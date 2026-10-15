def test_stats_on_empty_clinic(client):
    body = client.get("/api/stats").json()
    assert body["doctors"] == 0
    assert body["appointments_total"] == 0
    assert body["busiest_doctor"] is None


def test_stats_counts_by_status_and_busiest_doctor(client, doctor, patient):
    for hour in (9, 10, 11):
        client.post(
            "/api/appointments",
            json={
                "doctor_id": doctor["id"],
                "patient_id": patient["id"],
                "scheduled_at": f"2030-02-01T{hour:02d}:00:00Z",
            },
        )
    client.patch("/api/appointments/1/status", json={"status": "CANCELLED"})

    body = client.get("/api/stats").json()
    assert body["doctors"] == 1
    assert body["patients"] == 1
    assert body["appointments_total"] == 3
    assert body["by_status"]["SCHEDULED"] == 2
    assert body["by_status"]["CANCELLED"] == 1
    assert body["busiest_doctor"] == doctor["name"]
