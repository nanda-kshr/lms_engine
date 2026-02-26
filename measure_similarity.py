import requests
import json
import time
from difflib import SequenceMatcher

BASE_URL = "http://localhost:3000"

# Using credentials from seed_data.py or similar
EMAIL = "nandakishorep212@gmail.com"
PASSWORD = "nandakishorep212@gmail.com"

def login():
    print(f"Logging in as {EMAIL}...", flush=True)
    payload = {
        "email": EMAIL,
        "password": PASSWORD
    }
    
    # Try with existing user or create one
    try:
        resp = requests.post(f"{BASE_URL}/auth/signin", json=payload, timeout=10)
        if resp.status_code == 200 or resp.status_code == 201:
            print("Login success.")
            return resp.json().get('accessToken')
    except Exception as e:
        print(f"Login failed: {e}")
        
    # If login fails, try register
    print("Login failed, trying registration...")
    reg_payload = {
        "email": EMAIL,
        "password": PASSWORD,
        "name": "Test User"
    }
    try:
        register_resp = requests.post(f"{BASE_URL}/auth/signup", json=reg_payload, timeout=10)
        if register_resp.status_code == 201:
            print("Registration success, logging in...")
            resp = requests.post(f"{BASE_URL}/auth/signin", json=payload, timeout=10)
            return resp.json().get('accessToken')
    except Exception as e:
         print(f"Registration failed: {e}")

    return None

def similar(a, b):
    return SequenceMatcher(None, a, b).ratio()

def main():
    token = login()
    if not token:
        print("Could not authenticate. Exiting.")
        return

    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    }

    # Configuration similar to what user might use
    blueprint = {
        "course_code": "PYTHON",
        "total": 2,
        "marks": 1,
        "topics": ["Recursion"],
        "co_distribution": {"CO1": 2},
        "lo_distribution": {"LO1": 2},
        "difficulty_distribution": {"Easy": 2}
    }

    print(f"\nConfiguration: {json.dumps(blueprint, indent=2)}")
    print("Generating questions 10 times to check similarity...")

    all_questions = [] # List of list of questions
    all_texts = [] # Flat list of all question texts

    for i in range(10):
        print(f"Iteration {i+1}/10...", end="", flush=True)
        try:
            resp = requests.post(f"{BASE_URL}/questions/generate", headers=headers, json=blueprint, timeout=1800)
            if resp.status_code == 201:
                data = resp.json()
                paper = data.get('paper', [])
                print(f" Got {len(paper)} questions.")
                
                texts = [q['question_text'] for q in paper]
                all_questions.append(texts)
                all_texts.extend(texts)
            else:
                print(f" Failed: {resp.status_code} {resp.text}")
        except Exception as e:
            print(f" Error: {e}")
        
        # Small delay
        time.sleep(1)

    if not all_texts:
        print("No questions generated.")
        return

    # Analyze Similarity
    print("\n--- Similarity Analysis ---")
    total_pairs = 0
    high_similarity_count = 0
    exact_duplicates = 0
    threshold = 0.85 # 85% similarity threshold

    n = len(all_texts)
    print(f"Total questions generated across all runs: {n}")
    
    comparisons = []

    for i in range(n):
        for j in range(i + 1, n):
            total_pairs += 1
            s = similar(all_texts[i], all_texts[j])
            if s == 1.0:
                exact_duplicates += 1
            if s > threshold:
                high_similarity_count += 1
                comparisons.append({
                    'q1': all_texts[i][:50] + "...",
                    'q2': all_texts[j][:50] + "...",
                    'score': s
                })

    avg_similarity = 0 # Difficult to calc meaningfully for all pairs, focusing on duplicates

    print(f"Total pairs compared: {total_pairs}")
    print(f"Exact duplicates: {exact_duplicates} ({exact_duplicates/total_pairs*100:.2f}%)")
    print(f"Similar pairs (> {threshold*100}%): {high_similarity_count} ({high_similarity_count/total_pairs*100:.2f}%)")
    
    if comparisons:
        print("\nSample Similar Pairs:")
        for camp in comparisons[:5]:
             print(f"- {camp['score']:.2f}: {camp['q1']}  <-->  {camp['q2']}")

    print("\nDone.")

if __name__ == "__main__":
    main()
