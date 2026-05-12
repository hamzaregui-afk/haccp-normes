#!/bin/bash
# HACCP API Comprehensive Test Script
# Server: 178.105.126.165

BASE_URL="http://localhost"
API="$BASE_URL/api/v1"
PASS=0
FAIL=0
RESULTS=()

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "========================================================"
echo "   HACCP API COMPREHENSIVE TEST SUITE"
echo "   Server: 178.105.126.165"
echo "   Date: $(date)"
echo "========================================================"
echo ""

# ─── Helper ────────────────────────────────────────────────
test_endpoint() {
  local label="$1"
  local method="$2"
  local url="$3"
  local data="$4"
  local extra_headers="$5"

  if [ -n "$data" ]; then
    RESPONSE=$(curl -s -w "\n__STATUS__%{http_code}" -X "$method" "$url" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $TOKEN" \
      $extra_headers \
      -d "$data" 2>&1)
  else
    RESPONSE=$(curl -s -w "\n__STATUS__%{http_code}" -X "$method" "$url" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $TOKEN" \
      $extra_headers 2>&1)
  fi

  HTTP_STATUS=$(echo "$RESPONSE" | grep -o '__STATUS__[0-9]*' | grep -o '[0-9]*')
  BODY=$(echo "$RESPONSE" | sed 's/__STATUS__[0-9]*$//' | tr -d '\n')
  BODY_SHORT="${BODY:0:250}"

  if [[ "$HTTP_STATUS" =~ ^2 ]]; then
    echo -e "${GREEN}[PASS]${NC} $label"
    echo -e "       Status: $HTTP_STATUS"
    echo -e "       Body: $BODY_SHORT"
    PASS=$((PASS + 1))
    RESULTS+=("PASS|$label|$HTTP_STATUS")
  else
    echo -e "${RED}[FAIL]${NC} $label"
    echo -e "       Status: ${RED}$HTTP_STATUS${NC}"
    echo -e "       Body: $BODY_SHORT"
    FAIL=$((FAIL + 1))
    RESULTS+=("FAIL|$label|$HTTP_STATUS|$BODY_SHORT")
  fi
  echo ""
}

# ─── STEP 1: Login ─────────────────────────────────────────
echo -e "${BLUE}━━━ STEP 1: Authentication ━━━${NC}"
echo ""

LOGIN_RESPONSE=$(curl -s -w "\n__STATUS__%{http_code}" -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@haccp.local","password":"Admin@haccp1"}' 2>&1)

LOGIN_STATUS=$(echo "$LOGIN_RESPONSE" | grep -o '__STATUS__[0-9]*' | grep -o '[0-9]*')
LOGIN_BODY=$(echo "$LOGIN_RESPONSE" | sed 's/__STATUS__[0-9]*$//')

echo "Login Status: $LOGIN_STATUS"
echo "Login Body (first 300 chars): ${LOGIN_BODY:0:300}"
echo ""

if [[ "$LOGIN_STATUS" =~ ^2 ]]; then
  # Try to extract token from various response shapes
  TOKEN=$(echo "$LOGIN_BODY" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    # try common paths
    for path in [['data','accessToken'],['data','token'],['accessToken'],['token'],['data','access_token'],['access_token']]:
        obj = d
        try:
            for k in path:
                obj = obj[k]
            print(obj)
            break
        except:
            pass
except Exception as e:
    print('ERROR:' + str(e), file=sys.stderr)
" 2>/dev/null)

  if [ -z "$TOKEN" ]; then
    # fallback with grep
    TOKEN=$(echo "$LOGIN_BODY" | grep -oP '"(accessToken|token|access_token)"\s*:\s*"\K[^"]+' | head -1)
  fi

  if [ -n "$TOKEN" ]; then
    echo -e "${GREEN}[PASS]${NC} Login successful - Token obtained"
    echo "       Token (first 50 chars): ${TOKEN:0:50}..."
    PASS=$((PASS + 1))
    RESULTS+=("PASS|POST /auth/login|$LOGIN_STATUS")
  else
    echo -e "${YELLOW}[WARN]${NC} Login returned 2xx but could not extract token"
    echo "       Full body: $LOGIN_BODY"
    TOKEN=""
    RESULTS+=("WARN|POST /auth/login|$LOGIN_STATUS|Could not extract token")
  fi
else
  echo -e "${RED}[FAIL]${NC} Login failed with status $LOGIN_STATUS"
  echo "       Body: $LOGIN_BODY"
  FAIL=$((FAIL + 1))
  RESULTS+=("FAIL|POST /auth/login|$LOGIN_STATUS|$LOGIN_BODY")
  TOKEN=""
fi

echo ""
echo -e "${BLUE}━━━ STEP 2: Users Endpoints ━━━${NC}"
echo ""

test_endpoint "GET /api/v1/users" "GET" "$API/users"

# Create a user
CREATE_USER_PAYLOAD='{"email":"testoperator_'$(date +%s)'@haccp.local","password":"Operator@1234","firstName":"Test","lastName":"Operator","role":"OPERATOR"}'
test_endpoint "POST /api/v1/users (create user)" "POST" "$API/users" "$CREATE_USER_PAYLOAD"

echo -e "${BLUE}━━━ STEP 3: Tenants Endpoint ━━━${NC}"
echo ""

test_endpoint "GET /api/v1/tenants" "GET" "$API/tenants"

echo -e "${BLUE}━━━ STEP 4: Asset Endpoints ━━━${NC}"
echo ""

test_endpoint "GET /api/v1/assets/products" "GET" "$API/assets/products"

CREATE_PRODUCT_PAYLOAD='{"name":"Test Product '$(date +%s)'","description":"Created by test script","category":"RAW_MATERIAL","unit":"kg","minTemperature":2,"maxTemperature":8}'
test_endpoint "POST /api/v1/assets/products (create product)" "POST" "$API/assets/products" "$CREATE_PRODUCT_PAYLOAD"

test_endpoint "GET /api/v1/assets/equipments" "GET" "$API/assets/equipments"

CREATE_EQUIP_PAYLOAD='{"name":"Test Fridge '$(date +%s)'","type":"REFRIGERATION","location":"Kitchen A","serialNumber":"SN-TEST-'$(date +%s)'"}'
test_endpoint "POST /api/v1/assets/equipments (create equipment)" "POST" "$API/assets/equipments" "$CREATE_EQUIP_PAYLOAD"

test_endpoint "GET /api/v1/assets/suppliers" "GET" "$API/assets/suppliers"

echo -e "${BLUE}━━━ STEP 5: Controls Endpoints ━━━${NC}"
echo ""

test_endpoint "GET /api/v1/controls/tasks" "GET" "$API/controls/tasks"

CREATE_TASK_PAYLOAD='{"title":"Temperature Check '$(date +%s)'","description":"Check fridge temperature","type":"TEMPERATURE","frequency":"DAILY","scheduledAt":"2026-05-13T08:00:00Z"}'
test_endpoint "POST /api/v1/controls/tasks (create task)" "POST" "$API/controls/tasks" "$CREATE_TASK_PAYLOAD"

echo -e "${BLUE}━━━ STEP 6: Non-Conformities Endpoints ━━━${NC}"
echo ""

test_endpoint "GET /api/v1/nonconformities" "GET" "$API/nonconformities"

CREATE_NC_PAYLOAD='{"title":"Test NC '$(date +%s)'","description":"Temperature exceeded critical limit","severity":"HIGH","category":"TEMPERATURE","location":"Cold Storage A"}'
test_endpoint "POST /api/v1/nonconformities (create NC)" "POST" "$API/nonconformities" "$CREATE_NC_PAYLOAD"

echo -e "${BLUE}━━━ STEP 7: Reports Endpoints ━━━${NC}"
echo ""

test_endpoint "GET /api/v1/reports" "GET" "$API/reports"

CREATE_REPORT_PAYLOAD='{"title":"Daily HACCP Report '$(date +%s)'","type":"DAILY","periodStart":"2026-05-01T00:00:00Z","periodEnd":"2026-05-11T23:59:59Z"}'
test_endpoint "POST /api/v1/reports (create report)" "POST" "$API/reports" "$CREATE_REPORT_PAYLOAD"

echo -e "${BLUE}━━━ STEP 8: DLC Endpoints ━━━${NC}"
echo ""

test_endpoint "GET /api/v1/dlc" "GET" "$API/dlc"

CREATE_DLC_PAYLOAD='{"productId":"test-product-001","openedAt":"2026-05-12T08:00:00Z","storageTemperature":4}'
test_endpoint "POST /api/v1/dlc/calculate (calculate DLC)" "POST" "$API/dlc/calculate" "$CREATE_DLC_PAYLOAD"

echo -e "${BLUE}━━━ STEP 9: Audit Logs Endpoint ━━━${NC}"
echo ""

test_endpoint "GET /api/v1/audit/logs" "GET" "$API/audit/logs"

# Also try alternative paths
echo -e "${BLUE}━━━ STEP 10: Alternative/Additional Endpoint Probes ━━━${NC}"
echo ""

test_endpoint "GET /api/v1/health (gateway)" "GET" "$BASE_URL/api/v1/health"
test_endpoint "GET /health (direct)" "GET" "$BASE_URL/health"
test_endpoint "GET /api/v1/controls/templates" "GET" "$API/controls/templates"
test_endpoint "GET /api/v1/assets/products (alias check)" "GET" "$API/products"
test_endpoint "GET /api/v1/notifications" "GET" "$API/notifications"

# ─── DOCKER LOGS ────────────────────────────────────────────
echo ""
echo "========================================================"
echo "   DOCKER SERVICE LOGS (last 20 lines each)"
echo "========================================================"

SERVICES=("haccp-users" "haccp-controls" "haccp-nc" "haccp-assets" "haccp-reports" "haccp-dlc" "haccp-auth" "haccp-tenant" "haccp-audit" "haccp-gateway" "haccp-notifications")

for svc in "${SERVICES[@]}"; do
  echo ""
  echo -e "${YELLOW}━━━ docker logs $svc --tail 20 ━━━${NC}"
  docker logs "$svc" --tail 20 2>&1 || echo "(container not found or no logs)"
done

# ─── DOCKER PS ──────────────────────────────────────────────
echo ""
echo "========================================================"
echo "   RUNNING CONTAINERS"
echo "========================================================"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>&1

# ─── SUMMARY ────────────────────────────────────────────────
echo ""
echo "========================================================"
echo "   TEST SUMMARY"
echo "========================================================"
echo -e "  ${GREEN}PASSED: $PASS${NC}"
echo -e "  ${RED}FAILED: $FAIL${NC}"
echo ""
echo "  Detailed Results:"
for result in "${RESULTS[@]}"; do
  IFS='|' read -r status label code msg <<< "$result"
  if [ "$status" = "PASS" ]; then
    echo -e "    ${GREEN}✓ $label${NC} [$code]"
  elif [ "$status" = "WARN" ]; then
    echo -e "    ${YELLOW}⚠ $label${NC} [$code] $msg"
  else
    echo -e "    ${RED}✗ $label${NC} [$code] ${msg:0:100}"
  fi
done
echo ""
echo "========================================================"
echo "   END OF TEST SUITE"
echo "========================================================"
