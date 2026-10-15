def test_create_and_get_doctor(client, doctor):
    response = client.get(f"/api/doctors/{doctor['id']}")
    assert response.status_code == 200
    assert response.json()["specialty"] == "General Medicine"
    assert response.json()["active"] is True


def test_list_doctors_filters_by_active(client, doctor):
    client.post("/api/doctors", json={"name": "Dr. On Leave", "specialty": "Cardiology", "active": False})
    assert len(client.get("/api/doctors").json()) == 2
    active = client.get("/api/doctors", params={"active": True}).json()
    assert [d["name"] for d in active] == ["Dr. Test Doctor"]


def test_update_doctor(client, doctor):
    response = client.put(f"/api/doctors/{doctor['id']}", json={"room": "202"})
    assert response.status_code == 200
    assert response.json()["room"] == "202"
    assert response.json()["name"] == "Dr. Test Doctor"  # untouched fields keep their value


def test_delete_doctor_then_404(client, doctor):
    assert client.delete(f"/api/doctors/{doctor['id']}").status_code == 204
    assert client.get(f"/api/doctors/{doctor['id']}").status_code == 404


def test_create_doctor_rejects_short_name(client):
    response = client.post("/api/doctors", json={"name": "X", "specialty": "Cardiology"})
    assert response.status_code == 422
