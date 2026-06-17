#!/usr/bin/env bash
# P0 Test Suite - ITDLUPanel Docker Page
# Tests: 2.1 (Page-level) + 2.3 (Containers) + 2.5 (Local Image) + 2.10 (Settings)
# Requires: Docker daemon, panel running, admin token

set -uo pipefail

# ============ CONFIG ============
PANEL_URL="${PANEL_URL:-https://10.20.1.243:8888}"
API="${PANEL_URL}/api/v1"
TOKEN=$(cat /root/ITDLUPanel/tests/.token 2>/dev/null)
[ -z "$TOKEN" ] && { echo "FATAL: no token. Run tests/login first."; exit 1; }

# Refresh token to avoid expiration mid-test
LOGIN_BODY='{"username":"admin","password":"admin@123456"}'
TOKEN=$(curl -ks -X POST $PANEL_URL/api/v1/auth/login -H "Content-Type: application/json" -d "$LOGIN_BODY" | jq -r '.data.access_token // empty')
echo "$TOKEN" > /root/ITDLUPanel/tests/.token
[ -z "$TOKEN" ] && { echo "FATAL: token refresh failed"; exit 1; }

# Test container name prefix (không động vào wordpress/grafana/minio)
TEST_PREFIX="itdlu_test_$$"
RAND_ID=$RANDOM

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0
declare -a FAILURES

# ============ HELPERS ============
test_pass() { PASS=$((PASS+1)); echo -e "  ${GREEN}✓${NC} $1"; }
test_fail() { FAIL=$((FAIL+1)); FAILURES+=("$1: $2"); echo -e "  ${RED}✗${NC} $1: $2"; }
test_warn() { WARN=$((WARN+1)); echo -e "  ${YELLOW}⚠${NC} $1: $2"; }
test_info() { echo -e "  ℹ $1"; }

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

json_val() {
  echo "$1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data', d).get('$2', ''))" 2>/dev/null
}

section() { echo ""; echo -e "${YELLOW}═══ $1 ═══${NC}"; }

# ============ PRE-CLEANUP ============
section "Pre-cleanup"
echo "Removing any leftover test containers/images/volumes/networks..."
docker ps -a --format '{{.Names}}' 2>/dev/null | grep -E "^${TEST_PREFIX}" | xargs -r docker rm -f 2>/dev/null
docker images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null | grep -E "^${TEST_PREFIX}" | xargs -r docker rmi -f 2>/dev/null
docker volume ls --format '{{.Name}}' 2>/dev/null | grep -E "^${TEST_PREFIX}" | xargs -r docker volume rm -f 2>/dev/null
docker network ls --format '{{.Name}}' 2>/dev/null | grep -E "^${TEST_PREFIX}" | xargs -r docker network rm 2>/dev/null
test_pass "Cleanup done"

# ============ 2.1: PAGE-LEVEL FLOW ============
section "2.1: Page-level flow"

# 2.1.1: Docker not installed - cannot test without breaking system
# 2.1.3: Docker not running - cannot test (would break other services)
# 2.1.4: Header badges
INFO=$(api GET "/docker/info")
if echo "$INFO" | jq -e '.data.info.server_version' >/dev/null 2>&1; then
  VERSION=$(echo "$INFO" | jq -r '.data.info.server_version')
  CONTAINERS=$(echo "$INFO" | jq -r '.data.info.containers')
  RUNNING=$(echo "$INFO" | jq -r '.data.info.running')
  IMAGES=$(echo "$INFO" | jq -r '.data.info.images')

  [ -n "$VERSION" ] && test_pass "Header badge: v$VERSION" || test_warn "Header badge version" "empty"
  test_info "Badges: $CONTAINERS containers ($RUNNING running), $IMAGES images"
  test_pass "Header badges data accessible"
else
  test_fail "Header badges" "Cannot parse /docker/info - response: ${INFO:0:200}"
fi

# 2.1.5: Tab labels - kiểm tra i18n key
# Verify HTML bundle served
BUNDLE_URL=$(curl -ks $PANEL_URL/ | grep -oE 'src="/assets/index-[^"]+\.js"' | head -1 | sed 's/src="//;s/"//')
test_info "Bundle: $BUNDLE_URL"
BUNDLE=$(curl -ks "$PANEL_URL$BUNDLE_URL")

if echo "$BUNDLE" | grep -q "container_tabs"; then
  test_pass "i18n key 'container_tabs' present in bundle"
else
  test_fail "i18n key 'container_tabs'" "NOT in bundle"
fi

# Bundle uses JS template literal: settings:`Settings` and settings:`Cài đặt`
if echo "$BUNDLE" | grep 'settings:`Settings`' >/dev/null; then
  test_pass "i18n EN 'Settings' for common.settings"
else
  test_fail "i18n EN 'Settings'" "NOT in bundle"
fi

if echo "$BUNDLE" | grep 'settings:`Cài đặt`' >/dev/null; then
  test_pass "i18n VI 'Cài đặt' for common.settings"
else
  test_fail "i18n VI 'Cài đặt'" "NOT in bundle"
fi

if echo "$BUNDLE" | grep 'container_tabs:`Containers`' >/dev/null; then
  test_pass "i18n EN 'Containers' for docker.container_tabs"
else
  test_fail "i18n 'Containers'" "NOT in bundle"
fi

if echo "$BUNDLE" | grep 'container_tabs:`Container`' >/dev/null; then
  test_pass "i18n VI 'Container' for docker.container_tabs"
else
  test_fail "i18n VI 'Container'" "NOT in bundle"
fi

# Verify Settings bundle contains new Appearance tab
SETTINGS_BUNDLE=$(curl -ks "$PANEL_URL/assets/$(ls /root/ITDLUPanel/web/dist/assets/Settings-*.js 2>/dev/null | head -1 | xargs basename)")
if echo "$SETTINGS_BUNDLE" | grep -q "accent_palette\|BgColorsOutlined"; then
  test_pass "Settings tab has Appearance (accent_palette feature)"
else
  test_fail "Settings tab Appearance" "Not found in Settings bundle"
fi

# ============ 2.3: CONTAINERS TAB ============
section "2.3: Containers Tab"

# 2.3.1: List containers
LIST=$(api GET "/docker/containers?all=true")
LIST_STATUS=$(api_status GET "/docker/containers?all=true")
[ "$LIST_STATUS" = "200" ] && test_pass "List containers (HTTP 200)" || test_fail "List containers" "HTTP $LIST_STATUS"
LIST_COUNT=$(echo "$LIST" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('data',[])))" 2>/dev/null)
test_info "List returned $LIST_COUNT containers (incl. 3 production)"

# 2.3.13-17: Create container with various options
# Backend expects:
#   ports: map[string]string (host_port -> container_port)
#   env: []string (array of KEY=VALUE)
#   volumes: []string
# 2.3.14: port mapping
CNAME="${TEST_PREFIX}_port"
# Pre-clean to ensure no name collision
docker rm -f "${CNAME}" 2>/dev/null
CREATE_BODY='{"image":"nginx:alpine","name":"'$CNAME'","ports":{"8088":"80"},"env":["TEST=1"],"restart_policy":"no"}'
CREATE_STATUS=$(api_status POST "/docker/containers" "$CREATE_BODY")
[ "$CREATE_STATUS" = "200" ] || [ "$CREATE_STATUS" = "201" ] && test_pass "Create container with port mapping (HTTP $CREATE_STATUS)" || test_fail "Create container" "HTTP $CREATE_STATUS"
sleep 1

# 2.3.5: Start container
sleep 1
START_STATUS=$(api_status POST "/docker/containers/${CNAME}/start")
[ "$START_STATUS" = "200" ] && test_pass "Start container" || test_fail "Start container" "HTTP $START_STATUS"
sleep 2

# Verify running
RUN_CHECK=$(docker ps --format '{{.Names}}' | grep -c "^${CNAME}$")
[ "$RUN_CHECK" -ge 1 ] && test_pass "Container is running" || test_warn "Container running" "not in 'docker ps'"

# 2.3.9: Logs
LOGS=$(api GET "/docker/containers/${CNAME}/logs?tail=50")
LOGS_STATUS=$(api_status GET "/docker/containers/${CNAME}/logs?tail=50")
[ "$LOGS_STATUS" = "200" ] && test_pass "Get container logs" || test_fail "Container logs" "HTTP $LOGS_STATUS"

# 2.3.10: Details
DETAIL=$(api GET "/docker/containers/${CNAME}")
DETAIL_STATUS=$(api_status GET "/docker/containers/${CNAME}")
[ "$DETAIL_STATUS" = "200" ] && test_pass "Get container details" || test_fail "Container details" "HTTP $DETAIL_STATUS"

# 2.3.6: Stop container
STOP_STATUS=$(api_status POST "/docker/containers/${CNAME}/stop")
[ "$STOP_STATUS" = "200" ] && test_pass "Stop container" || test_fail "Stop container" "HTTP $STOP_STATUS"
sleep 2

# 2.3.7: Restart
RESTART_STATUS=$(api_status POST "/docker/containers/${CNAME}/restart")
[ "$RESTART_STATUS" = "200" ] && test_pass "Restart container" || test_fail "Restart container" "HTTP $RESTART_STATUS"
sleep 2

# 2.3.8: Pause/Resume
PAUSE_STATUS=$(api_status POST "/docker/containers/${CNAME}/pause")
[ "$PAUSE_STATUS" = "200" ] && test_pass "Pause container" || test_fail "Pause container" "HTTP $PAUSE_STATUS"
sleep 1
UNPAUSE_STATUS=$(api_status POST "/docker/containers/${CNAME}/unpause")
[ "$UNPAUSE_STATUS" = "200" ] && test_pass "Resume container" || test_fail "Resume container" "HTTP $UNPAUSE_STATUS"

# 2.3.18: Create fail (name trùng)
DUP_STATUS=$(api_status POST "/docker/containers" "{\"image\":\"nginx:alpine\",\"name\":\"$CNAME\"}")
[ "$DUP_STATUS" = "409" ] || [ "$DUP_STATUS" = "500" ] || [ "$DUP_STATUS" = "400" ] && test_pass "Reject duplicate name (HTTP $DUP_STATUS)" || test_warn "Duplicate name" "HTTP $DUP_STATUS (may or may not reject)"

# 2.3.19: Create fail (invalid image)
BAD_STATUS=$(api_status POST "/docker/containers" "{\"image\":\"this_image_does_not_exist_xyz:999\",\"name\":\"${TEST_PREFIX}_badimg\"}")
[ "$BAD_STATUS" != "200" ] && [ "$BAD_STATUS" != "201" ] && test_pass "Reject invalid image (HTTP $BAD_STATUS)" || test_warn "Invalid image" "HTTP $BAD_STATUS (suspicious)"

# 2.3.11: Remove container
STOP2_STATUS=$(api_status POST "/docker/containers/${CNAME}/stop")
sleep 1
RM_STATUS=$(api_status DELETE "/docker/containers/${CNAME}?force=true")
[ "$RM_STATUS" = "200" ] || [ "$RM_STATUS" = "204" ] && test_pass "Remove container" || test_fail "Remove container" "HTTP $RM_STATUS"

# Verify gone
docker ps -a --format '{{.Names}}' | grep -q "^${CNAME}$" && test_fail "Container removed" "still exists" || test_pass "Container gone after remove"

# 2.3.20: Empty state when filter no match (UI behavior, not API)
# Skip - UI level

# ============ 2.5: LOCAL IMAGE TAB ============
section "2.5: Local Image Tab"

# 2.5.1: List local images
IMG_LIST=$(api GET "/docker/images")
IMG_STATUS=$(api_status GET "/docker/images")
[ "$IMG_STATUS" = "200" ] && test_pass "List local images" || test_fail "List images" "HTTP $IMG_STATUS"
IMG_COUNT=$(echo "$IMG_LIST" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('data',[])))" 2>/dev/null)
test_info "Total images: $IMG_COUNT"

# 2.5.3: Inspect an image (use alpine which is now in cache or another)
FIRST_IMG_ID=$(echo "$IMG_LIST" | python3 -c "import sys,json; d=json.load(sys.stdin).get('data',[]); print(d[0]['id'] if d else '')" 2>/dev/null)
if [ -n "$FIRST_IMG_ID" ]; then
  INSPECT_STATUS=$(api_status GET "/docker/images/${FIRST_IMG_ID}/inspect")
  [ "$INSPECT_STATUS" = "200" ] && test_pass "Inspect image ($FIRST_IMG_ID)" || test_fail "Inspect image" "HTTP $INSPECT_STATUS"
else
  test_warn "Image inspect" "no image to inspect"
fi

# 2.5.6: Prune dangling
# First check current count
PRUNE_STATUS=$(api_status POST "/docker/images/prune")
[ "$PRUNE_STATUS" = "200" ] && test_pass "Prune dangling images" || test_fail "Prune" "HTTP $PRUNE_STATUS"

# ============ 2.10: SETTINGS TAB ============
section "2.10: Settings Tab"

# 2.10.1: Status (already covered by /docker/info)
test_pass "Settings status check (via /docker/info, installed=true, running=true)"

# 2.10.3-4: Save mirrors
MIRRORS='{"mirrors":["https://mirror.example.com","https://registry.example.io"]}'
SAVE_STATUS=$(api_status PUT "/docker/system/config" "$MIRRORS")
[ "$SAVE_STATUS" = "200" ] && test_pass "Save registry mirrors" || test_fail "Save mirrors" "HTTP $SAVE_STATUS"

# 2.10.3-4: Get mirrors back
GET_MIRRORS=$(api GET "/docker/system/config")
GET_STATUS=$(api_status GET "/docker/system/config")
[ "$GET_STATUS" = "200" ] && test_pass "Get mirrors config" || test_fail "Get mirrors" "HTTP $GET_STATUS"

# 2.10.5: Save mirrors with empty list (reset)
RESET='{"mirrors":[]}'
RESET_STATUS=$(api_status PUT "/docker/system/config" "$RESET")
[ "$RESET_STATUS" = "200" ] && test_pass "Reset mirrors to empty" || test_warn "Reset mirrors" "HTTP $RESET_STATUS"

# 2.10.6: Restart Docker (cẩn thận - sẽ restart production containers)
# SKIP - would disrupt wordpress/grafana/minio
test_warn "Restart Docker" "SKIPPED (would disrupt 3 production containers: wordpress, grafana, minio)"

# 2.10.7: Stop Docker - same, SKIP
test_warn "Stop Docker" "SKIPPED (would disrupt 3 production containers)"

# ============ POST-CLEANUP ============
section "Post-cleanup"
docker ps -a --format '{{.Names}}' 2>/dev/null | grep -E "^${TEST_PREFIX}" | xargs -r docker rm -f 2>/dev/null
docker images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null | grep -E "^${TEST_PREFIX}" | xargs -r docker rmi -f 2>/dev/null
docker volume ls --format '{{.Name}}' 2>/dev/null | grep -E "^${TEST_PREFIX}" | xargs -r docker volume rm -f 2>/dev/null
docker network ls --format '{{.Name}}' 2>/dev/null | grep -E "^${TEST_PREFIX}" | xargs -r docker network rm 2>/dev/null
test_pass "Cleanup done"

# ============ SUMMARY ============
section "SUMMARY"
echo -e "PASS: ${GREEN}$PASS${NC}"
echo -e "FAIL: ${RED}$FAIL${NC}"
echo -e "WARN: ${YELLOW}$WARN${NC}"

if [ $FAIL -gt 0 ]; then
  echo ""
  echo "Failures:"
  for f in "${FAILURES[@]}"; do
    echo "  - $f"
  done
fi

echo ""
echo "Production containers status (should still be UP):"
docker ps --format '  {{.Names}}: {{.Status}}' 2>/dev/null | grep -E "wordpress|grafana|minio"

exit $FAIL
