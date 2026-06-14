def test_register_user(client):
    response = client.post(
        "/api/auth/register",
        json={"email": "alice@example.com", "password": "password123", "name": "Alice"}
    )
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "alice@example.com"
    assert data["name"] == "Alice"
    assert "id" in data

def test_register_duplicate_email(client):
    client.post(
        "/api/auth/register",
        json={"email": "alice@example.com", "password": "password123", "name": "Alice"}
    )
    response = client.post(
        "/api/auth/register",
        json={"email": "alice@example.com", "password": "password456", "name": "Alice Duplicate"}
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Email already registered"

def test_login_user(client):
    client.post(
        "/api/auth/register",
        json={"email": "alice@example.com", "password": "password123", "name": "Alice"}
    )
    response = client.post(
        "/api/auth/login",
        json={"email": "alice@example.com", "password": "password123"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"

def test_login_invalid_password(client):
    client.post(
        "/api/auth/register",
        json={"email": "alice@example.com", "password": "password123", "name": "Alice"}
    )
    response = client.post(
        "/api/auth/login",
        json={"email": "alice@example.com", "password": "wrongpassword"}
    )
    assert response.status_code == 401

def test_get_current_user(client):
    client.post(
        "/api/auth/register",
        json={"email": "alice@example.com", "password": "password123", "name": "Alice"}
    )
    login_response = client.post(
        "/api/auth/login",
        json={"email": "alice@example.com", "password": "password123"}
    )
    token = login_response.json()["access_token"]
    
    headers = {"Authorization": f"Bearer {token}"}
    response = client.get("/api/auth/me", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "alice@example.com"
    assert data["name"] == "Alice"
