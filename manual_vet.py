
import requests
import random
import sys
import time

BASE_URL = "http://127.0.0.1:3000"

def login(email, password):
    print(f"Logging in as {email}...", flush=True)
    payload = {
        "email": email,
        "password": password
    }
    try:
        resp = requests.post(f"{BASE_URL}/auth/signin", json=payload, timeout=10)
        if resp.status_code == 200 or resp.status_code == 201:
            print("Login success.", flush=True)
            return resp.json().get('accessToken')
        else:
            print(f"Login failed: {resp.text}", flush=True)
            return None
    except Exception as e:
        print(f"Login error: {e}", flush=True)
        return None

def vet_questions(token, count):
    print(f"Vetting {count} questions...", flush=True)
    headers = {'Authorization': f'Bearer {token}'}
    
    vetted = 0
    page_size = 50
    
    try:
        while vetted < count:
            # Get pending questions
            resp = requests.get(f"{BASE_URL}/questions/vetting?limit={page_size}", headers=headers, timeout=10)
            
            if resp.status_code != 200:
                print(f"Failed to fetch questions: {resp.text}", flush=True)
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
                # Random action: mostly accept, some reject
                action = random.choice(['accept', 'accept', 'accept', 'reject']) 
                
                payload = {
                    'action': action,
                    'reason': 'Manual vetting script'
                }
                
                try:
                    time.sleep(0.5)
                    vet_resp = requests.post(f"{BASE_URL}/questions/{q_id}/vet", headers=headers, json=payload, timeout=5)
                    
                    if vet_resp.status_code == 201:
                        print(f"[{vetted+1}/{count}] Vetted {q_id}: {action}", flush=True)
                        vetted += 1
                    else:
                        print(f"Failed to vet {q_id}: {vet_resp.text}", flush=True)
                except Exception as e:
                    print(f"Error vetting {q_id}: {e}", flush=True)

        print(f"\nTotal vetted: {vetted}", flush=True)
    except Exception as e:
        print(f"Vetting error: {e}", flush=True)

if __name__ == "__main__":
    email = "analytics_seeds_3lrsx@example.com"
    password = "password123"
    target_count = random.randint(30, 40)
    
    token = login(email, password)
    if token:
        vet_questions(token, target_count)
