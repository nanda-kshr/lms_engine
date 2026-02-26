
import requests
import random
import sys
import time

BASE_URL = "http://127.0.0.1:3000"

def register_and_login(name, email, password):
    print(f"Registering {email}...", flush=True)
    payload = {
        "email": email,
        "password": password,
        "name": name
    }
    
    # Register
    try:
        requests.post(f"{BASE_URL}/auth/signup", json=payload, timeout=10)
    except:
        pass # Might already exist

    # Login
    print(f"Logging in {email}...", flush=True)
    try:
        resp = requests.post(f"{BASE_URL}/auth/signin", json={"email": email, "password": password}, timeout=10)
        if resp.status_code == 200 or resp.status_code == 201:
            return resp.json().get('accessToken')
    except Exception as e:
        print(f"Login error: {e}", flush=True)
    return None

def vet_questions(token, count):
    print(f"Vetting {count} questions as verifier...", flush=True)
    headers = {'Authorization': f'Bearer {token}'}
    
    vetted = 0
    page_size = 50
    
    try:
        while vetted < count:
            # Get questions
            resp = requests.get(f"{BASE_URL}/questions/vetting?limit={page_size}", headers=headers, timeout=10)
            
            if resp.status_code != 200:
                print(f"Failed to fetch: {resp.text}", flush=True)
                break
                
            data = resp.json()
            questions = data.get('questions', [])
            
            if not questions:
                print("No more questions to vet.", flush=True)
                break
                
            for q in questions:
                if vetted >= count:
                    break
                    
                q_id = q['_id']
                # Always accept to push to approval
                action = 'accept'
                
                payload = {
                    'action': action,
                    'reason': 'Verifier script'
                }
                
                try:
                    time.sleep(0.5)
                    vet_resp = requests.post(f"{BASE_URL}/questions/{q_id}/vet", headers=headers, json=payload, timeout=5)
                    
                    if vet_resp.status_code == 201:
                        print(f"[{vetted+1}/{count}] Verifier Vetted {q_id}: {action}", flush=True)
                        vetted += 1
                    else:
                        print(f"Failed to vet {q_id}: {vet_resp.text}", flush=True)
                except Exception as e:
                    print(f"Error vetting {q_id}: {e}", flush=True)

        print(f"\nTotal verified: {vetted}", flush=True)
    except Exception as e:
        print(f"Vetting error: {e}", flush=True)

if __name__ == "__main__":
    # Create a verifier user
    verifier_email = f"analytics_verifier_{random.randint(1000,9999)}@example.com"
    token = register_and_login("Analytics Verifier", verifier_email, "password123")
    
    if token:
        # Vet 40 questions to ensure we push enough to Approved state
        vet_questions(token, 45)
