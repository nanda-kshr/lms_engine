#!/bin/bash

BASE_URL="http://localhost:3000"
EMAIL="rag_test_1770945024@example.com"
PASSWORD="password123"
COURSE_CODE="DSA_TEST"
TOPIC="Trees"

echo -e "Logging In"
LOGIN_RES=$(curl -s -X POST "$BASE_URL/auth/signin" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EMAIL\", \"password\": \"$PASSWORD\"}")

TOKEN=$(echo $LOGIN_RES | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
echo "Token: ${TOKEN:0:10}..."

if [ -z "$TOKEN" ]; then
  echo "Login failed. Response: $LOGIN_RES"
  exit 1
fi

echo -e "\nGenerating Questions..."
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
  }" > generate_output.json 2>&1

cat generate_output.json
