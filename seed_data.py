
import requests
import csv
import random
import string
import os

BASE_URL = "http://127.0.0.1:3000"

def generate_random_string(length=10):
    return ''.join(random.choices(string.ascii_letters + string.digits, k=length))

def generate_questions(count=120):
    questions = []
    
    # Headers based on MCQ template
    headers = [
        'question', 'option_a', 'option_b', 'option_c', 'option_d', 
        'option_correct', 'co', 'lo mapping', 'difficulty', 'marks'
    ]
    
    difficulties = ['Easy', 'Medium', 'Hard']
    cos = ['CO1', 'CO2', 'CO3', 'CO4', 'CO5']
    topics = ['Data Structures', 'Algorithms', 'Database', 'Operating Systems', 'Networks']
    
    for i in range(count):
        is_bad_question = random.random() < 0.1 # 10% bad questions for rejection
        
        q_text = f"Sample Question {i+1}: {generate_random_string(20)}?"
        if is_bad_question:
            q_text = "Bad Question " + generate_random_string(5)
            
        row = {
            'question': q_text,
            'option_a': f"Option A {i}",
            'option_b': f"Option B {i}",
            'option_c': f"Option C {i}",
            'option_d': f"Option D {i}",
            'option_correct': random.choice(['A', 'B', 'C', 'D']),
            'co': random.choice(cos),
            'lo mapping': f"LO{random.randint(1,5)}",
            'difficulty': random.choice(difficulties),
            'marks': random.choice(['1', '2', '5'])
        }
        
        # Introduce errors for bad questions if needed, but for now we just label them "Bad" 
        # so we know to reject them in the script logic if we wanted.
        # Actually, the prompt says "wrong should also be there". 
        # This implies content errors. Vetting happens manually or via API.
        
        questions.append(row)
        
    return headers, questions

def register_user():
    email = f"analytics_seeds_{generate_random_string(5).lower()}@example.com"
    password = "password123"
    name = "Analytics Seeder"
    
    print(f"Registering user: {email} / {password}", flush=True)
    
    payload = {
        "email": email,
        "password": password,
        "name": name
    }
    
    try:
        # Try login first to see if exists (unlikely with random)
        pass 
    except:
        pass

    # Register
    try:
        resp = requests.post(f"{BASE_URL}/auth/signup", json=payload, timeout=10)
        if resp.status_code == 201 or resp.status_code == 200:
            print("Registration success.", flush=True)
            return email, password
        else:
            print(f"Registration failed: {resp.text}", flush=True)
            return None, None
    except Exception as e:
        print(f"Registration unexpected error: {e}", flush=True)
        return None, None

def login(email, password):
    print(f"Logging in...", flush=True)
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

def upload_csv(token, filename):
    print(f"Uploading CSV...", flush=True)
    headers = {'Authorization': f'Bearer {token}'}
    
    try:
        with open(filename, 'rb') as f:
            files = {'file': (filename, f, 'text/csv')}
            data = {
                'course_code': 'PYTHON',
                'topic': 'Recursion'
            }
            resp = requests.post(f"{BASE_URL}/questions/upload", headers=headers, files=files, data=data, timeout=30)
            
        if resp.status_code == 201:
            print(f"Upload successful: {resp.json()}", flush=True)
            return True
        else:
            print(f"Upload failed: {resp.text}", flush=True)
            return False
    except Exception as e:
        print(f"Upload error: {e}", flush=True)
        return False

def vet_questions(token, count=30):
    print(f"Vetting {count} questions...", flush=True)
    headers = {'Authorization': f'Bearer {token}'}
    
    vetted = 0
    page_size = 50
    
    try:
        while vetted < count:
            limit = min(page_size, count - vetted)
            # Using the new limit support!
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
                # Random action
                action = random.choice(['accept', 'reject'])
                if 'Bad' in q['question_text']:
                     action = 'reject'
                
                payload = {
                    'action': action,
                    'reason': 'Seeding script auto-vet'
                }
                
                vet_resp = requests.post(f"{BASE_URL}/questions/{q_id}/vet", headers=headers, json=payload, timeout=10)
                
                if vet_resp.status_code == 201:
                    print(f"Vetted {q_id}: {action}", flush=True)
                    vetted += 1
                else:
                    print(f"Failed to vet {q_id}: {vet_resp.text}", flush=True)

        print(f"\nTotal vetted: {vetted}", flush=True)
    except Exception as e:
        print(f"Vetting error: {e}", flush=True)

def main():
    # 1. Generate CSV
    filename = "seed_questions.csv"
    headers, rows = generate_questions(120)
    
    with open(filename, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=headers)
        writer.writeheader()
        writer.writerows(rows)
        
    print(f"Generated {filename} with 120 questions.")
    
    # 2. Register
    email, password = register_user()
    if not email:
        return
        
    # 3. Login
    token = login(email, password)
    if not token:
        return
        
    # 4. Upload
    if upload_csv(token, filename):
        # 5. Vet
        target_vet = random.randint(27, 38)
        print(f"Vetting {target_vet} tasks...")
        vet_questions(token, target_vet)
        
        print("\n" + "="*50)
        print("SEEDING COMPLETE")
        print(f"Username: {email}")
        print(f"Password: {password}")
        print("="*50)

if __name__ == "__main__":
    main()
