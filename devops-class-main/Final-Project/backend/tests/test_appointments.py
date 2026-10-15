import pytest


@pytest.fixture()
def appointment(client, doctor, patient):
    response = client.post(
        "/api/appointments",
        json={
            "doctor_id": doctor["id"],
            "patient_id": patient["id"],
            "scheduled_at": "2030-01-15T10:00:00Z",
            "duration_min": 30,
            "reason": "Annual check-up",
        },
    )
    assert response.status_code == 201
    return response.json()


def test_book_appointment(appointment, doctor, patient):
    assert appointment["status"] == "SCHEDULED"
    assert appointment["doctor_name"] == doctor["name"]
    assert appointment["patient_name"] == patient["name"]


def test_double_booking_same_doctor_is_rejected(client, appointment, doctor, patient):
    # 10:15 falls inside the existing 10:00-10:30 slot.
    response = client.post(
        "/api/appointments",
        json={"doctor_id": doctor["id"], "patient_id": patient["id"], "scheduled_at": "2030-01-15T10:15:00Z"},
    )
    assert response.status_code == 409


def test_back_to_back_booking_is_allowed(client, appointment, doctor, patient):
    response = client.post(
        "/api/appointments",
        json={"doctor_id": doctor["id"], "patient_id": patient["id"], "scheduled_at": "2030-01-15T10:30:00Z"},
    )
    assert response.status_code == 201


def test_cancelled_slot_can_be_rebooked(client, appointment, doctor, patient):
    client.patch(f"/api/appointments/{appointment['id']}/status", json={"status": "CANCELLED"})
    response = client.post(
        "/api/appointments",
        json={"doctor_id": doctor["id"], "patient_id": patient["id"], "scheduled_at": "2030-01-15T10:00:00Z"},
    )
    assert response.status_code == 201


def test_booking_unknown_doctor_returns_404(client, patient):
    response = client.post(
        "/api/appointments",
        json={"doctor_id": 999, "patient_id": patient["id"], "scheduled_at": "2030-01-15T10:00:00Z"},
    )
    assert response.status_code == 404


def test_booking_inactive_doctor_returns_400(client, doctor, patient):
    client.put(f"/api/doctors/{doctor['id']}", json={"active": False})
    response = client.post(
        "/api/appointments",
        json={"doctor_id": doctor["id"], "patient_id": patient["id"], "scheduled_at": "2030-01-15T10:00:00Z"},
    )
    assert response.status_code == 400


def test_status_workflow_and_terminal_state(client, appointment):
    url = f"/api/appointments/{appointment['id']}/status"
    assert client.patch(url, json={"status": "CHECKED_IN"}).json()["status"] == "CHECKED_IN"
    assert client.patch(url, json={"status": "COMPLETED"}).json()["status"] == "COMPLETED"
    # A completed visit cannot be reopened.
    assert client.patch(url, json={"status": "SCHEDULED"}).status_code == 409


def test_filter_appointments_by_status_and_date(client, appointment):
    assert len(client.get("/api/appointments", params={"status": "SCHEDULED"}).json()) == 1
    assert client.get("/api/appointments", params={"status": "COMPLETED"}).json() == []
    assert len(client.get("/api/appointments", params={"on_date": "2030-01-15"}).json()) == 1
    assert client.get("/api/appointments", params={"on_date": "2030-01-16"}).json() == []


def test_reschedule_appointment(client, appointment):
    response = client.put(
        f"/api/appointments/{appointment['id']}",
        json={"scheduled_at": "2030-01-16T09:00:00Z", "reason": "Follow-up"},
    )
    assert response.status_code == 200
    assert response.json()["reason"] == "Follow-up"
    assert response.json()["scheduled_at"].startswith("2030-01-16T09:00:00")


def test_delete_appointment_then_404(client, appointment):
    assert client.delete(f"/api/appointments/{appointment['id']}").status_code == 204
    assert client.get(f"/api/appointments/{appointment['id']}").status_code == 404
    assert client.delete(f"/api/appointments/{appointment['id']}").status_code == 404


# ---------- booking rules ----------
def book(client, doctor_id, patient_id, when, minutes=15):
    return client.post(
        "/api/appointments",
        json={"doctor_id": doctor_id, "patient_id": patient_id, "scheduled_at": when, "duration_min": minutes},
    )


def test_booking_in_the_past_is_rejected(client, doctor, patient):
    response = book(client, doctor["id"], patient["id"], "2020-01-01T10:00:00Z")
    assert response.status_code == 400
    assert "past" in response.json()["detail"]


def test_patient_cannot_be_in_two_places_at_once(client, appointment, patient):
    other_doctor = client.post("/api/doctors", json={"name": "Dr. Second", "specialty": "Cardiology"}).json()
    # Same patient, different doctor, overlapping 10:00-10:30.
    response = book(client, other_doctor["id"], patient["id"], "2030-01-15T10:20:00Z")
    assert response.status_code == 409
    assert patient["name"] in response.json()["detail"]


def test_scheduled_cannot_jump_straight_to_completed(client, appointment):
    response = client.patch(f"/api/appointments/{appointment['id']}/status", json={"status": "COMPLETED"})
    assert response.status_code == 409
    assert "CHECKED_IN" in response.json()["detail"]


def test_put_cannot_change_status(client, appointment):
    response = client.put(f"/api/appointments/{appointment['id']}", json={"status": "COMPLETED"})
    assert response.status_code == 422  # unknown field: status only changes via PATCH /status


def test_finished_appointment_cannot_be_rescheduled(client, appointment):
    client.patch(f"/api/appointments/{appointment['id']}/status", json={"status": "CANCELLED"})
    response = client.put(f"/api/appointments/{appointment['id']}", json={"reason": "changed"})
    assert response.status_code == 409


def test_reschedule_into_a_clash_is_rejected(client, appointment, doctor, patient):
    other_patient = client.post("/api/patients", json={"name": "Second Patient", "phone": "9000000001"}).json()
    second = book(client, doctor["id"], other_patient["id"], "2030-01-15T11:00:00Z").json()
    response = client.put(f"/api/appointments/{second['id']}", json={"scheduled_at": "2030-01-15T10:10:00Z"})
    assert response.status_code == 409


def test_on_date_uses_the_clinic_local_day(client, doctor, patient):
    # 20:00 UTC on the 15th is 01:30 on the 16th in India (UTC+5:30).
    book(client, doctor["id"], patient["id"], "2030-01-15T20:00:00Z")
    assert len(client.get("/api/appointments", params={"on_date": "2030-01-16"}).json()) == 1
    assert client.get("/api/appointments", params={"on_date": "2030-01-15"}).json() == []


def test_upcoming_lists_only_active_future_appointments(client, appointment, doctor, patient):
    cancelled = book(client, doctor["id"], patient["id"], "2030-01-15T12:00:00Z").json()
    client.patch(f"/api/appointments/{cancelled['id']}/status", json={"status": "CANCELLED"})
    upcoming = client.get("/api/appointments", params={"upcoming": True}).json()
    assert [a["id"] for a in upcoming] == [appointment["id"]]
