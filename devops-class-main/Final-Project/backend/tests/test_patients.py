import pytest


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
    updated = client.put(f"/api/patients/{patient['id']}", json={"phone": "9000011111"})
    assert updated.status_code == 200
    assert updated.json()["phone"] == "9000011111"

    assert client.delete(f"/api/patients/{patient['id']}").status_code == 204
    assert client.get(f"/api/patients/{patient['id']}").status_code == 404


@pytest.mark.parametrize("phone", ["987654321", "98765432101", "98765 43210", "+919876543210", "98765abcde", ""])
def test_phone_must_be_exactly_10_digits(client, phone):
    response = client.post("/api/patients", json={"name": "Phone Check", "phone": phone})
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"][-1] == "phone"


def test_phone_with_exactly_10_digits_is_accepted(client):
    response = client.post("/api/patients", json={"name": "Phone Check", "phone": "9123456780"})
    assert response.status_code == 201
    assert response.json()["phone"] == "9123456780"


def test_update_rejects_invalid_phone(client, patient):
    response = client.put(f"/api/patients/{patient['id']}", json={"phone": "12345"})
    assert response.status_code == 422


def test_blank_name_is_rejected(client):
    response = client.post("/api/patients", json={"name": "   ", "phone": "9123456780"})
    assert response.status_code == 422


def test_names_are_trimmed(client):
    response = client.post("/api/patients", json={"name": "  Meera Nair  ", "phone": "9123456780"})
    assert response.json()["name"] == "Meera Nair"


def test_future_date_of_birth_is_rejected(client):
    response = client.post(
        "/api/patients", json={"name": "Future Baby", "phone": "9123456780", "date_of_birth": "2999-01-01"}
    )
    assert response.status_code == 422
