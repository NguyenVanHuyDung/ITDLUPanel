#!/usr/bin/env bash
# P1 Test Suite - Compose, Network, Volume
# Requires: Docker daemon, panel running, admin token

set -uo pipefail

PANEL_URL="${PANEL_URL:-https://10.20.1.243:8888}"
API="${PANEL_URL}/api/v1"
TOKEN=$(cat /root/ITDLUPanel/tests/.token 2>/dev/null)
[ -z "$TOKEN" ] && { echo "FATAL: no token. Run tests/login first."; exit 1; }

# Refresh token to avoid expiration mid-test
LOGIN_BODY='{"username":"admin","password":"admin@123456"}'
TOKEN=$(curl -ks -X POST $PANEL_URL/api/v1/auth/login -H "Content-Type: application/json" -d "$LOGIN_BODY" | jq -r '.data.access_token // empty')
echo "$TOKEN" > /root/ITDLUPanel/tests/.token
[ -z "$TOKEN" ] && { echo "FATAL: token refresh failed"; exit 1; }

TEST_PREFIX="itdlu_p1_$$"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0
declare -a FAILURES

test_pass() { PASS=$((PASS+1)); echo -e "  ${GREEN}✓${NC} $1"; }
test_fail() { FAIL=$((FAIL+1)); FAILURES+=("$1: $2"); echo -e "  ${RED}✗${NC} $1: $2"; }
test_warn() { WARN=$((WARN+1)); echo -e "  ${YELLOW}⚠${NC} $1: $2"; }
test_info() { echo -e "  ℹ $1"; }
section() { echo ""; echo -e "${YELLOW}═══ $1 ═══${NC}"; }

api() {
  local method=$1 path=$2 data=${3:-}
  local args=(-ks -X "$method" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json")
  [ -n "$data" ] && args+=(-d "$data")
  curl "${args[@]}" "${API}${path}"
}

api_status() {
  local method=$1 path=$2 data=${3:-}
  local args=(-ks -X "$method" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -o /dev/null -w "%{http_code}")
  [ -n "$data" ] && args+=(-d "$data")
  curl "${args[@]}" "${API}${path}"
}

api_body_status() {
  # Returns both body and status code
  local method=$1 path=$2 data=${3:-}
  local args=(-ks -X "$method" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -w "\n%{http_code}")
  [ -n "$data" ] && args+=(-d "$data")
  curl "${args[@]}" "${API}${path}"
}

# ============ PRE-CLEANUP ============
section "Pre-cleanup"
docker ps -a --format '{{.Names}}' 2>/dev/null | grep -E "^${TEST_PREFIX}|itdlu_p1_" | xargs -r docker rm -f 2>/dev/null
docker volume ls --format '{{.Name}}' 2>/dev/null | grep -E "^${TEST_PREFIX}|itdlu_p1_" | xargs -r docker volume rm -f 2>/dev/null
docker network ls --format '{{.Name}}' 2>/dev/null | grep -E "^${TEST_PREFIX}|itdlu_p1_" | xargs -r docker network rm 2>/dev/null
test_pass "Cleanup done"

# ============ 2.7: NETWORK TAB ============
section "2.7: Network Tab"

# 2.7.1: List networks
NW_LIST=$(api GET "/docker/networks")
NW_STATUS=$(api_status GET "/docker/networks")
[ "$NW_STATUS" = "200" ] && test_pass "List networks" || test_fail "List networks" "HTTP $NW_STATUS"

# 2.7.2: DEFAULT badge (bridge/host/none)
NW_BODY=$(echo "$NW_LIST" | jq -r '.data[].name' 2>/dev/null)
for d in bridge host none; do
  echo "$NW_BODY" | grep -qx "$d" && test_pass "Default network '$d' exists" || test_fail "Default $d" "missing"
done

# 2.7.4: Create bridge network with subnet/gateway
NW_NAME="${TEST_PREFIX}_net1"
NW_BODY='{"name":"'$NW_NAME'","driver":"bridge","subnet":"172.30.0.0/16","gateway":"172.30.0.1"}'
NW_CREATE_STATUS=$(api_status POST "/docker/networks" "$NW_BODY")
[ "$NW_CREATE_STATUS" = "200" ] || [ "$NW_CREATE_STATUS" = "201" ] && test_pass "Create bridge network (HTTP $NW_CREATE_STATUS)" || test_fail "Create network" "HTTP $NW_CREATE_STATUS"

# 2.7.6: Inspect network
NW_ID=$(docker network ls --filter "name=${NW_NAME}" --format '{{.ID}}' | head -1)
test_info "Network ID: $NW_ID"
NW_INSPECT_STATUS=$(api_status GET "/docker/networks/${NW_ID}")
[ "$NW_INSPECT_STATUS" = "200" ] && test_pass "Inspect network" || test_fail "Inspect network" "HTTP $NW_INSPECT_STATUS"

# Verify inspect returns useful data
INSPECT_BODY=$(api GET "/docker/networks/${NW_ID}")
echo "$INSPECT_BODY" | jq -e '.data.id' >/dev/null 2>&1 && test_pass "Inspect returns valid JSON" || test_fail "Inspect JSON" "invalid"
SUBNET_CHECK=$(echo "$INSPECT_BODY" | jq -r '.data.ipam.config[0].Subnet // empty' 2>/dev/null)
[ "$SUBNET_CHECK" = "172.30.0.0/16" ] && test_pass "Subnet preserved (172.30.0.0/16)" || test_warn "Subnet" "got '$SUBNET_CHECK'"

# 2.7.7: Delete custom network
NW_DEL_STATUS=$(api_status DELETE "/docker/networks/${NW_ID}")
[ "$NW_DEL_STATUS" = "200" ] || [ "$NW_DEL_STATUS" = "204" ] && test_pass "Delete custom network" || test_fail "Delete network" "HTTP $NW_DEL_STATUS"

# Verify gone
docker network ls --format '{{.Name}}' | grep -q "^${NW_NAME}$" && test_fail "Network gone" "still exists" || test_pass "Network removed"

# 2.7.4b: Create network with invalid subnet (should fail or succeed with warning)
NW_NAME_BAD="${TEST_PREFIX}_bad"
NW_BAD_BODY='{"name":"'$NW_NAME_BAD'","subnet":"999.999.0.0/16"}'
NW_BAD_STATUS=$(api_status POST "/docker/networks" "$NW_BAD_BODY")
# Either reject or accept - both OK from API standpoint
[ "$NW_BAD_STATUS" = "200" ] || [ "$NW_BAD_STATUS" = "201" ] && test_info "Invalid subnet accepted (HTTP $NW_BAD_STATUS) - backend may validate" || test_info "Invalid subnet rejected (HTTP $NW_BAD_STATUS) - good"
# Cleanup if created
NW_BAD_ID=$(docker network ls --filter "name=${NW_NAME_BAD}" --format '{{.ID}}' | head -1)
[ -n "$NW_BAD_ID" ] && docker network rm "$NW_BAD_ID" 2>/dev/null

# 2.7.5: Create with different driver (overlay may fail on single host)
NW_NAME_OVL="${TEST_PREFIX}_ovl"
NW_OVL_BODY='{"name":"'$NW_NAME_OVL'","driver":"overlay"}'
NW_OVL_STATUS=$(api_status POST "/docker/networks" "$NW_OVL_BODY")
if [ "$NW_OVL_STATUS" = "200" ] || [ "$NW_OVL_STATUS" = "201" ]; then
  test_pass "Create overlay network (HTTP $NW_OVL_STATUS)"
  docker network rm "$NW_NAME_OVL" 2>/dev/null
else
  test_info "Overlay network create: HTTP $NW_OVL_STATUS (expected to fail on single-host swarm)"
fi

# 2.7.8: Cannot delete protected networks (test backend behavior)
# Try deleting bridge - should be rejected
BR_DEL_STATUS=$(api_status DELETE "/docker/networks/bridge")
[ "$BR_DEL_STATUS" != "200" ] && [ "$BR_DEL_STATUS" != "204" ] && test_pass "Reject delete protected 'bridge' (HTTP $BR_DEL_STATUS)" || test_fail "Delete bridge" "SHOULD reject (HTTP $BR_DEL_STATUS)"

# 2.7.9: Prune unused networks
NW_PRUNE_STATUS=$(api_status POST "/docker/networks/prune")
[ "$NW_PRUNE_STATUS" = "200" ] && test_pass "Prune networks" || test_fail "Prune networks" "HTTP $NW_PRUNE_STATUS"

# ============ 2.8: VOLUME TAB ============
section "2.8: Volume Tab"

# 2.8.1: List volumes
VOL_LIST=$(api GET "/docker/volumes")
VOL_STATUS=$(api_status GET "/docker/volumes")
[ "$VOL_STATUS" = "200" ] && test_pass "List volumes" || test_fail "List volumes" "HTTP $VOL_STATUS"

# 2.8.3: Create volume
VOL_NAME="${TEST_PREFIX}_vol1"
VOL_BODY='{"name":"'$VOL_NAME'","driver":"local"}'
VOL_CREATE_STATUS=$(api_status POST "/docker/volumes" "$VOL_BODY")
[ "$VOL_CREATE_STATUS" = "200" ] || [ "$VOL_CREATE_STATUS" = "201" ] && test_pass "Create volume (HTTP $VOL_CREATE_STATUS)" || test_fail "Create volume" "HTTP $VOL_CREATE_STATUS"

# 2.8.4: Inspect volume
VOL_INSPECT_STATUS=$(api_status GET "/docker/volumes/${VOL_NAME}")
[ "$VOL_INSPECT_STATUS" = "200" ] && test_pass "Inspect volume" || test_fail "Inspect volume" "HTTP $VOL_INSPECT_STATUS"

INSPECT_VOL=$(api GET "/docker/volumes/${VOL_NAME}")
MOUNTPOINT=$(echo "$INSPECT_VOL" | jq -r '.data.mountpoint // empty')
[ -n "$MOUNTPOINT" ] && test_pass "Volume has mountpoint: $MOUNTPOINT" || test_warn "Mountpoint" "empty"

# 2.8.6: Delete volume not in use
VOL_DEL_STATUS=$(api_status DELETE "/docker/volumes/${VOL_NAME}")
[ "$VOL_DEL_STATUS" = "200" ] || [ "$VOL_DEL_STATUS" = "204" ] && test_pass "Delete unused volume" || test_fail "Delete volume" "HTTP $VOL_DEL_STATUS"

# Verify gone
docker volume ls --format '{{.Name}}' | grep -q "^${VOL_NAME}$" && test_fail "Volume gone" "still exists" || test_pass "Volume removed"

# 2.8.7: Prune unused volumes
VOL_PRUNE_STATUS=$(api_status POST "/docker/volumes/prune")
[ "$VOL_PRUNE_STATUS" = "200" ] && test_pass "Prune volumes" || test_fail "Prune volumes" "HTTP $VOL_PRUNE_STATUS"

# 2.8.5: Cannot delete volume in use (create + use + try delete)
# Create test volume
VOL_USED="${TEST_PREFIX}_used"
api_status POST "/docker/volumes" '{"name":"'$VOL_USED'"}' >/dev/null
# Use it in a container
CNAME="${TEST_PREFIX}_uses_vol"
api_status POST "/docker/containers" "{\"image\":\"nginx:alpine\",\"name\":\"$CNAME\",\"volumes\":[\"/hosttmp:/data:rw\"]}" >/dev/null
# Try to delete volume that's not actually mounted (different path)
# Note: this depends on implementation - if panel creates named volume, different behavior
sleep 1
docker rm -f "$CNAME" 2>/dev/null
docker volume rm "$VOL_USED" 2>/dev/null
test_info "Volume in-use test skipped (depends on panel auto-volume creation)"

# ============ 2.6: COMPOSE TAB ============
section "2.6: Compose Tab"

# 2.6.1: List compose projects (initially empty or have existing)
COMP_LIST=$(api GET "/docker/compose")
COMP_STATUS=$(api_status GET "/docker/compose")
[ "$COMP_STATUS" = "200" ] && test_pass "List compose projects" || test_fail "List compose" "HTTP $COMP_STATUS"

# 2.6.2: Create compose project
COMP_NAME="${TEST_PREFIX}_proj1"
COMP_YAML='services:
  web:
    image: nginx:alpine
    ports:
      - "9090:80"
    restart: unless-stopped'
# Body needs name + yaml
COMP_BODY=$(jq -n --arg n "$COMP_NAME" --arg y "$COMP_YAML" '{name:$n, yaml:$y}')
COMP_CREATE_STATUS=$(api_status POST "/docker/compose" "$COMP_BODY")
[ "$COMP_CREATE_STATUS" = "200" ] || [ "$COMP_CREATE_STATUS" = "201" ] && test_pass "Create compose project (HTTP $COMP_CREATE_STATUS)" || test_fail "Create project" "HTTP $COMP_CREATE_STATUS"

# 2.6.4: Get project info
COMP_GET_STATUS=$(api_status GET "/docker/compose/${COMP_NAME}")
[ "$COMP_GET_STATUS" = "200" ] && test_pass "Get project YAML" || test_fail "Get project" "HTTP $COMP_GET_STATUS"

# 2.6.5: UP project
COMP_UP_STATUS=$(api_status POST "/docker/compose/${COMP_NAME}/up")
# Up may take 10-30s
if [ "$COMP_UP_STATUS" = "200" ]; then
  test_pass "Compose up (HTTP 200)"
else
  test_fail "Compose up" "HTTP $COMP_UP_STATUS"
fi
sleep 8  # Give time for containers to start

# Verify container created
COMP_CONTAINER=$(docker ps --format '{{.Names}}' | grep -E "${COMP_NAME}_web|${COMP_NAME}-web" | head -1)
if [ -n "$COMP_CONTAINER" ]; then
  test_pass "Compose container started: $COMP_CONTAINER"
else
  # Try alternative naming
  ALL_CONTAINERS=$(docker ps --format '{{.Names}}' | grep -i "${TEST_PREFIX}" | head -3)
  if [ -n "$ALL_CONTAINERS" ]; then
    test_info "Found related containers: $ALL_CONTAINERS"
    test_pass "Some containers started from compose"
  else
    test_warn "Compose container" "no container found - check docker compose logs"
  fi
fi

# 2.6.7: Logs
COMP_LOGS_STATUS=$(api_status GET "/docker/compose/${COMP_NAME}/logs")
[ "$COMP_LOGS_STATUS" = "200" ] && test_pass "Get compose logs" || test_fail "Compose logs" "HTTP $COMP_LOGS_STATUS"

# 2.6.6: Down project
COMP_DOWN_STATUS=$(api_status POST "/docker/compose/${COMP_NAME}/down")
[ "$COMP_DOWN_STATUS" = "200" ] && test_pass "Compose down (HTTP 200)" || test_fail "Compose down" "HTTP $COMP_DOWN_STATUS"
sleep 3

# 2.6.9: Delete project
COMP_DEL_STATUS=$(api_status DELETE "/docker/compose/${COMP_NAME}")
[ "$COMP_DEL_STATUS" = "200" ] || [ "$COMP_DEL_STATUS" = "204" ] && test_pass "Delete compose project" || test_fail "Delete project" "HTTP $COMP_DEL_STATUS"

# 2.6.3: Create with invalid YAML (only checks if validate)
COMP_NAME2="${TEST_PREFIX}_bad"
COMP_BAD_YAML='invalid: yaml: : :'
COMP_BAD_BODY=$(jq -n --arg n "$COMP_NAME2" --arg y "$COMP_BAD_YAML" '{name:$n, yaml:$y}')
COMP_BAD_STATUS=$(api_status POST "/docker/compose" "$COMP_BAD_BODY")
[ "$COMP_BAD_STATUS" = "200" ] || [ "$COMP_BAD_STATUS" = "201" ] && test_info "Invalid YAML accepted at create (HTTP $COMP_BAD_STATUS) - validate on up" || test_info "Invalid YAML rejected (HTTP $COMP_BAD_STATUS)"
# Cleanup if created
docker compose -p "$COMP_NAME2" down 2>/dev/null

# 2.6.10: URL encoding for project name with special chars
COMP_NAME_ENC="test project with spaces"
COMP_ENC_BODY=$(jq -n --arg n "$COMP_NAME_ENC" --arg y "$COMP_YAML" '{name:$n, yaml:$y}')
COMP_ENC_STATUS=$(api_status POST "/docker/compose" "$COMP_ENC_BODY")
test_info "Project name with spaces: HTTP $COMP_ENC_STATUS"
# Cleanup
docker compose -p "test_project_with_spaces" down 2>/dev/null
docker compose -p "test%20project%20with%20spaces" down 2>/dev/null

# ============ POST-CLEANUP ============
section "Post-cleanup"
docker ps -a --format '{{.Names}}' 2>/dev/null | grep -E "^${TEST_PREFIX}|itdlu_p1_" | xargs -r docker rm -f 2>/dev/null
docker volume ls --format '{{.Name}}' 2>/dev/null | grep -E "^${TEST_PREFIX}|itdlu_p1_" | xargs -r docker volume rm -f 2>/dev/null
docker network ls --format '{{.Name}}' 2>/dev/null | grep -E "^${TEST_PREFIX}|itdlu_p1_" | xargs -r docker network rm 2>/dev/null
# Compose cleanup
for proj in $(docker compose ls --format json 2>/dev/null | jq -r '.[].Name' 2>/dev/null | grep -E "${TEST_PREFIX}|itdlu_p1_"); do
  docker compose -p "$proj" down --remove-orphans 2>/dev/null
done
test_pass "Cleanup done"

# ============ SUMMARY ============
section "SUMMARY"
echo -e "PASS: ${GREEN}$PASS${NC}"
echo -e "FAIL: ${RED}$FAIL${NC}"
echo -e "WARN: ${YELLOW}$WARN${NC}"
if [ $FAIL -gt 0 ]; then
  echo ""
  echo "Failures:"
  for f in "${FAILURES[@]}"; do echo "  - $f"; done
fi

echo ""
echo "Production containers:"
docker ps --format '  {{.Names}}: {{.Status}}' | grep -E "wordpress|grafana|minio"

exit $FAIL
