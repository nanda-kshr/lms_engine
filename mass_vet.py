
import requests
import random
import time

BASE_URL = "http://127.0.0.1:3000"

def get_token(name, email):
    # Try signup
    requests.post(f"{BASE_URL}/auth/signup", json={"name": name, "email": email, "password": "password123"}, timeout=5)
    # Signin
    resp = requests.post(f"{BASE_URL}/auth/signin", json={"email": email, "password": "password123"}, timeout=5)
    return resp.json().get('accessToken')

def mass_vet(token, count):
    headers = {'Authorization': f'Bearer {token}'}
    vetted = 0
    try:
        while vetted < count:
            resp = requests.get(f"{BASE_URL}/questions/vetting?limit=50", headers=headers, timeout=10)
            questions = resp.json().get('questions', [])
            if not questions: break
            
            for q in questions:
                if vetted >= count: break
                time.sleep(0.1)
                res = requests.post(f"{BASE_URL}/questions/{q['_id']}/vet", headers=headers, json={"action": "accept"}, timeout=5)
                if res.status_code == 201:
                    vetted += 1
                    if vetted % 10 == 0: print(f"Vetted {vetted}/{count}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    # Run 2 verifiers
    for i in range(2):
        email = f"bot_verifier_{i}_{random.randint(1000,9999)}@example.com"
        print(f"Starting {email}")
        token = get_token(f"Bot Verifier {i}", email)
        if token:
            mass_vet(token, 50)
