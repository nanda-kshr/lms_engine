#!/bin/bash

BASE_URL="http://localhost:3000"
EMAIL="rag_test_$(date +%s)@example.com"
PASSWORD="password123"
COURSE_CODE="DSA_TEST_$(date +%s)"
TOPIC="Trees"

echo "1. Registering User: $EMAIL"
curl -v -X POST "$BASE_URL/auth/signup" \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"RAG Tester\", \"email\": \"$EMAIL\", \"password\": \"$PASSWORD\"}"

echo -e "\n\n2. Logging In"
LOGIN_RES=$(curl -v -X POST "$BASE_URL/auth/signin" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EMAIL\", \"password\": \"$PASSWORD\"}")

TOKEN=$(echo $LOGIN_RES | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
echo "Token: ${TOKEN:0:10}..."

if [ -z "$TOKEN" ]; then
  echo "Login failed. Exiting."
  echo "Response: $LOGIN_RES"
  exit 1
fi

echo -e "\n\n3. Creating Course: $COURSE_CODE"
curl -s -X POST "$BASE_URL/courses" \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"Data Structures $COURSE_CODE\", \"code\": \"$COURSE_CODE\", \"description\": \"Test Course\"}"

echo -e "\n\n4. Adding Topic: $TOPIC"
# Need Course ID first? Or can I just skip valid topics check?
# Frontend uses Course Code, but backend generation might fetch topics.
# Let's verify if we need to link topic to course in DB.
# Backend GenerationService fetches topics if none provided.
# If we provide topic in blueprint, it uses it.

COURSE_RES=$(curl -s "$BASE_URL/courses")
COURSE_ID=$(echo $COURSE_RES | grep -o "\"_id\":\"[^\"]*\",\"code\":\"$COURSE_CODE" | cut -d'"' -f4)

if [ -n "$COURSE_ID" ]; then
    echo "Found Course ID: $COURSE_ID"
    curl -s -X POST "$BASE_URL/courses/$COURSE_ID/topics" \
      -H "Content-Type: application/json" \
      -d "{\"name\": \"$TOPIC\", \"description\": \"Tree structures\"}"
fi


echo -e "\n\n5. Uploading Material: Dsa.pdf"
curl -s -X POST "$BASE_URL/materials/upload" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@./test/fixtures/Dsa.pdf" \
  -F "course_code=$COURSE_CODE" \
  -F "type=CONTENT"

echo -e "\n\n6. Waiting for Ingestion (15s)..."
sleep 15

echo -e "\n\n7. Generating Questions"
# Blueprint matches GenerationBlueprint interface
curl -v -X POST "$BASE_URL/questions/generate" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"course_code\": \"$COURSE_CODE\",
    \"topics\": [\"$TOPIC\"],
    \"marks\": 5,
    \"total\": 2,
    \"co_distribution\": {\"CO1\": 2},
    \"lo_distribution\": {\"LO1\": 2},
    \"difficulty_distribution\": {\"Medium\": 2}
  }"


echo -e "\n\nDone!"
