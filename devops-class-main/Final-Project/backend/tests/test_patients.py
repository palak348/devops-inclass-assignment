def test_create_patient(client, patient):
    assert patient["id"] > 0
    assert patient["email"] == "asha@example.com"


def test_patient_validation_rejects_bad_phone_and_email(client):
    response = client.post("/api/patients", json={"name": "Bad Data", "phone": "abc", "email": "not-an-email"})
    assert response.status_code == 422
    fields = {error["loc"][-1] for error in response.json()["detail"]}
    assert fields == {"phone", "email"}


def test_search_patients_by_name(client, patient):
    client.post("/api/patients", json={"name": "Rahul Sen", "phone": "9876500000"})
    result = client.get("/api/patients", params={"search": "ash"}).json()
    assert [p["name"] for p in result] == ["Asha Verma"]


def test_update_and_delete_patient(client, patient):
    updated = client.put(f"/api/patients/{patient['id']}", json={"phone": "+91 90000 11111"})
    assert updated.status_code == 200
    assert updated.json()["phone"] == "+91 90000 11111"

    assert client.delete(f"/api/patients/{patient['id']}").status_code == 204
    assert client.get(f"/api/patients/{patient['id']}").status_code == 404
