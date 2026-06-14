import pytest

def get_auth_headers(client, email, name):
    client.post(
        "/api/auth/register",
        json={"email": email, "password": "password123", "name": name}
    )
    login_response = client.post(
        "/api/auth/login",
        json={"email": email, "password": "password123"}
    )
    token = login_response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}

def test_group_creation_and_member_management(client):
    headers_alice = get_auth_headers(client, "alice@example.com", "Alice")
    headers_bob = get_auth_headers(client, "bob@example.com", "Bob")
    
    # Alice creates a group
    group_response = client.post(
        "/api/groups",
        json={"name": "Roommates"},
        headers=headers_alice
    )
    assert group_response.status_code == 201
    group = group_response.json()
    assert group["name"] == "Roommates"
    
    # Alice adds Bob
    add_member_response = client.post(
        f"/api/groups/{group['id']}/members",
        json={"email": "bob@example.com"},
        headers=headers_alice
    )
    assert add_member_response.status_code == 200
    assert add_member_response.json()["name"] == "Bob"
    
    # Bob gets his groups, should see Roommates
    bob_groups = client.get("/api/groups", headers=headers_bob).json()
    assert len(bob_groups) == 1
    assert bob_groups[0]["name"] == "Roommates"

def test_equal_split_rounding(client):
    """
    Split ₹100.00 equally among 3 users (Alice, Bob, Charlie).
    100.00 / 3 = 33.33 each, leaving 0.01 remainder.
    The first participant (Alice or whoever is index 0) should be adjusted to 33.34.
    """
    headers_alice = get_auth_headers(client, "alice@example.com", "Alice")
    headers_bob = get_auth_headers(client, "bob@example.com", "Bob")
    headers_charlie = get_auth_headers(client, "charlie@example.com", "Charlie")
    
    # Get user profiles to get IDs
    user_a = client.get("/api/auth/me", headers=headers_alice).json()
    user_b = client.get("/api/auth/me", headers=headers_bob).json()
    user_c = client.get("/api/auth/me", headers=headers_charlie).json()
    
    # Alice creates a group
    group = client.post("/api/groups", json={"name": "Trip"}, headers=headers_alice).json()
    client.post(f"/api/groups/{group['id']}/members", json={"email": "bob@example.com"}, headers=headers_alice)
    client.post(f"/api/groups/{group['id']}/members", json={"email": "charlie@example.com"}, headers=headers_alice)
    
    # Log expense: Alice paid ₹100.00, split equally
    expense_payload = {
        "group_id": group["id"],
        "description": "Dinner",
        "amount": 100.00,
        "split_type": "equally",
        "payers": [{"user_id": user_a["id"], "amount_paid": 100.00}],
        "splits": [
            {"user_id": user_a["id"]},
            {"user_id": user_b["id"]},
            {"user_id": user_c["id"]}
        ]
    }
    
    response = client.post("/api/expenses", json=expense_payload, headers=headers_alice)
    assert response.status_code == 201
    expense = response.json()
    
    # Verify splits
    splits = {s["user_id"]: float(s["amount_owed"]) for s in expense["splits"]}
    
    # Check that total sum of splits equals 100.00
    assert sum(splits.values()) == 100.00
    # The first split in payload is Alice's, so Alice should get 33.34, others 33.33
    assert splits[user_a["id"]] == 33.34
    assert splits[user_b["id"]] == 33.33
    assert splits[user_c["id"]] == 33.33

def test_percentage_and_shares_split(client):
    headers_alice = get_auth_headers(client, "alice@example.com", "Alice")
    headers_bob = get_auth_headers(client, "bob@example.com", "Bob")
    
    user_a = client.get("/api/auth/me", headers=headers_alice).json()
    user_b = client.get("/api/auth/me", headers=headers_bob).json()
    
    group = client.post("/api/groups", json={"name": "Rent"}, headers=headers_alice).json()
    client.post(f"/api/groups/{group['id']}/members", json={"email": "bob@example.com"}, headers=headers_alice)
    
    # Percentage split: Rent is ₹1000.00. Alice owes 60%, Bob owes 40%
    payload_pct = {
        "group_id": group["id"],
        "description": "Rent share",
        "amount": 1000.00,
        "split_type": "percentage",
        "payers": [{"user_id": user_a["id"], "amount_paid": 1000.00}],
        "splits": [
            {"user_id": user_a["id"], "split_value": 60.00},
            {"user_id": user_b["id"], "split_value": 40.00}
        ]
    }
    response = client.post("/api/expenses", json=payload_pct, headers=headers_alice)
    assert response.status_code == 201
    splits = {s["user_id"]: float(s["amount_owed"]) for s in response.json()["splits"]}
    assert splits[user_a["id"]] == 600.00
    assert splits[user_b["id"]] == 400.00
    
    # Shares split: Alice has 2 shares, Bob has 1 share. Total 3 shares. Amount ₹100.00.
    # Alice owes round(2/3 * 100, 2) = 66.67, Bob owes round(1/3 * 100, 2) = 33.33.
    payload_shares = {
        "group_id": group["id"],
        "description": "Snacks",
        "amount": 100.00,
        "split_type": "shares",
        "payers": [{"user_id": user_a["id"], "amount_paid": 100.00}],
        "splits": [
            {"user_id": user_a["id"], "split_value": 2.0},
            {"user_id": user_b["id"], "split_value": 1.0}
        ]
    }
    response2 = client.post("/api/expenses", json=payload_shares, headers=headers_alice)
    assert response2.status_code == 201
    splits2 = {s["user_id"]: float(s["amount_owed"]) for s in response2.json()["splits"]}
    assert splits2[user_a["id"]] == 66.67
    assert splits2[user_b["id"]] == 33.33

def test_balance_and_debt_simplification(client):
    """
    Scenario:
    1. Alice, Bob, Charlie form a group.
    2. Alice pays ₹300.00 for Dinner (split equally: A owes 100, B owes 100, C owes 100).
       Net balances: Alice: +200, Bob: -100, Charlie: -100.
    3. Bob pays ₹300.00 for Taxi (split equally: A owes 100, B owes 100, C owes 100).
       Taxi splits: A owes 100, B owes 100, C owes 100.
       Net Taxi: Alice: -100, Bob: +200, Charlie: -100.
       Cumulative:
       Alice: +200 - 100 = +100
       Bob: -100 + 200 = +100
       Charlie: -100 - 100 = -200
       
    Simplified debts should show:
    Charlie owes Alice ₹100.00
    Charlie owes Bob ₹100.00
    """
    headers_alice = get_auth_headers(client, "alice@example.com", "Alice")
    headers_bob = get_auth_headers(client, "bob@example.com", "Bob")
    headers_charlie = get_auth_headers(client, "charlie@example.com", "Charlie")
    
    user_a = client.get("/api/auth/me", headers=headers_alice).json()
    user_b = client.get("/api/auth/me", headers=headers_bob).json()
    user_c = client.get("/api/auth/me", headers=headers_charlie).json()
    
    group = client.post("/api/groups", json={"name": "Simplification test"}, headers=headers_alice).json()
    client.post(f"/api/groups/{group['id']}/members", json={"email": "bob@example.com"}, headers=headers_alice)
    client.post(f"/api/groups/{group['id']}/members", json={"email": "charlie@example.com"}, headers=headers_alice)
    
    # 1. Dinner: Alice paid ₹300
    client.post("/api/expenses", json={
        "group_id": group["id"],
        "description": "Dinner",
        "amount": 300.00,
        "split_type": "equally",
        "payers": [{"user_id": user_a["id"], "amount_paid": 300.00}],
        "splits": [{"user_id": user_a["id"]}, {"user_id": user_b["id"]}, {"user_id": user_c["id"]}]
    }, headers=headers_alice)
    
    # 2. Taxi: Bob paid ₹300
    client.post("/api/expenses", json={
        "group_id": group["id"],
        "description": "Taxi",
        "amount": 300.00,
        "split_type": "equally",
        "payers": [{"user_id": user_b["id"], "amount_paid": 300.00}],
        "splits": [{"user_id": user_a["id"]}, {"user_id": user_b["id"]}, {"user_id": user_c["id"]}]
    }, headers=headers_bob)
    
    # Get group balances
    balances_response = client.get(f"/api/groups/{group['id']}/balances", headers=headers_alice)
    assert balances_response.status_code == 200
    data = balances_response.json()
    
    # Validate balances
    balances = {b["user_id"]: float(b["net_balance"]) for b in data["balances"]}
    assert balances[user_a["id"]] == 100.00
    assert balances[user_b["id"]] == 100.00
    assert balances[user_c["id"]] == -200.00
    
    # Validate simplified debts
    simplified = data["simplified_debts"]
    assert len(simplified) == 2
    
    # Match simplified debts
    for debt in simplified:
        assert debt["debtor_id"] == user_c["id"]
        assert float(debt["amount"]) == 100.00
        assert debt["creditor_id"] in [user_a["id"], user_b["id"]]

        
    # --- Settlement check ---
    # Charlie settles up with Alice: pays Alice ₹100.00
    settle_response = client.post("/api/settlements", json={
        "group_id": group["id"],
        "payer_id": user_c["id"],
        "payee_id": user_a["id"],
        "amount": 100.00
    }, headers=headers_charlie)
    assert settle_response.status_code == 201
    
    # Recheck balances
    balances_response2 = client.get(f"/api/groups/{group['id']}/balances", headers=headers_alice)
    data2 = balances_response2.json()
    balances2 = {b["user_id"]: float(b["net_balance"]) for b in data2["balances"]}
    
    # Alice should be 0 now (+100 - 100 = 0), Charlie should be -100 (-200 + 100 = -100)
    assert balances2[user_a["id"]] == 0.00
    assert balances2[user_b["id"]] == 100.00
    assert balances2[user_c["id"]] == -100.00
    
    simplified2 = data2["simplified_debts"]
    assert len(simplified2) == 1
    assert simplified2[0]["debtor_id"] == user_c["id"]
    assert simplified2[0]["creditor_id"] == user_b["id"]
    assert float(simplified2[0]["amount"]) == 100.00
