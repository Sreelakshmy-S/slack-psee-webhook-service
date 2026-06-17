#!/bin/bash
# Test script for webhook service
# Usage: ./scripts/test-webhook.sh [base_url]

BASE_URL=${1:-"http://localhost:3000"}

echo "🧪 Testing Slack PSEE Webhook Service"
echo "Base URL: $BASE_URL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Test 1: Health Check
echo "Test 1: Health Check"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
curl -s "$BASE_URL/health" | jq '.'
echo ""
echo ""

# Test 2: Lookup PSEE - Allianz
echo "Test 2: Lookup PSEE - Allianz (Db2)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
curl -s -X POST "$BASE_URL/lookup-psee" \
  -H "Content-Type: application/json" \
  -d '{
    "product": "Db2 Linux, Unix and Windows",
    "customer": "Allianz",
    "channel_id": "C0A7C3CH4LW"
  }' | jq '.'
echo ""
echo ""

# Test 3: Lookup PSEE - Bradesco
echo "Test 3: Lookup PSEE - Bradesco"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
curl -s -X POST "$BASE_URL/lookup-psee" \
  -H "Content-Type: application/json" \
  -d '{
    "product": "Watson Assistant",
    "customer": "Bradesco",
    "channel_id": "C0A5UTEGZJT"
  }' | jq '.'
echo ""
echo ""

# Test 4: Process Full Alert
echo "Test 4: Process Full Alert"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
curl -s -X POST "$BASE_URL/process-alert" \
  -H "Content-Type: application/json" \
  -d '{
    "alert_text": "IBM On Call Manager\nIncident: #0000-0320\nState: Unassigned\nPriority: 1\nLast Changed: 2026-02-19T01:33:55.135Z\nDescription: Name: TS021494518 Db2 Linux, Unix and Windows",
    "customer": "Allianz",
    "channel_id": "C0A7C3CH4LW"
  }' | jq '.'
echo ""
echo ""

# Test 5: Unknown Product (PSA Fallback)
echo "Test 5: Unknown Product - PSA Fallback"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
curl -s -X POST "$BASE_URL/lookup-psee" \
  -H "Content-Type: application/json" \
  -d '{
    "product": "Unknown Product XYZ",
    "customer": "Mastercard",
    "channel_id": "C0A5KDHSCRE"
  }' | jq '.'
echo ""
echo ""

# Test 6: Invalid Request
echo "Test 6: Invalid Request (Missing Fields)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
curl -s -X POST "$BASE_URL/lookup-psee" \
  -H "Content-Type: application/json" \
  -d '{
    "product": "Db2"
  }' | jq '.'
echo ""
echo ""

echo "✅ All tests completed!"
echo ""
echo "💡 Tips:"
echo "   - Check logs for detailed information"
echo "   - Verify Monday.com and Slack credentials are set"
echo "   - Ensure Monday.com board has test data"

# Made with Bob
