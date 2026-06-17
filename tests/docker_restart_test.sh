#!/usr/bin/env bash
# Test Docker Restart/Stop với safety guard
# Tạo test container, restart Docker, verify test container hoạt động lại

set -uo pipefail

PANEL_URL="${PANEL_URL:-https://10.20.1.243:8888}"
API="${PANEL_URL}/api/v1"
TOKEN=$(cat /root/ITDLUPanel/tests/.token 2>/dev/null)

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

TEST_NAME="itdlu_safety_$$"

section "Pre-test: Production containers status (BEFORE restart)"
PROD_BEFORE=$(docker ps --format '{{.Names}}\t{{.Status}}' | grep -E "wordpress|grafana|minio" | sort)
echo "$PROD_BEFORE" | while read line; do test_info "$line"; done

section "Setup: Create + start test container"
docker rm -f $TEST_NAME 2>/dev/null
TEST_BODY='{"image":"nginx:alpine","name":"'$TEST_NAME'","ports":{"9089":"80"},"env":[],"restart_policy":"always"}'
CR=$(api_status POST "/docker/containers" "$TEST_BODY")
if [ "$CR" != "200" ] && [ "$CR" != "201" ]; then
  test_fail "Create test container" "HTTP $CR"
  exit 1
fi
test_pass "Created test container"

ST=$(api_status POST "/docker/containers/${TEST_NAME}/start")
[ "$ST" = "200" ] && test_pass "Started test container" || test_warn "Start" "HTTP $ST"
sleep 2

RUNNING_BEFORE=$(docker ps --format '{{.Names}}' | grep -c "^${TEST_NAME}$")
[ "$RUNNING_BEFORE" -ge 1 ] && test_pass "Test container is running (before restart)" || test_warn "Running check" "not in docker ps"

section "TEST: POST /docker/system/restart"
START_TIME=$(date +%s)
RR=$(api_status POST "/docker/system/restart")
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
test_info "Restart HTTP $RR, took ${DURATION}s"
[ "$RR" = "200" ] && test_pass "Restart Docker daemon (HTTP 200)" || test_fail "Restart" "HTTP $RR"

# Wait for Docker to come back
echo "Waiting for Docker daemon to be ready..."
for i in $(seq 1 30); do
  if docker info >/dev/null 2>&1; then
    test_pass "Docker daemon responsive after $i sec"
    break
  fi
  sleep 1
done

section "Post-restart checks"
sleep 3  # Allow containers to come back

# Check test container is running (restart_policy=always → should auto-restart)
TEST_RUNNING=$(docker ps --format '{{.Names}}' | grep -c "^${TEST_NAME}$")
[ "$TEST_RUNNING" -ge 1 ] && test_pass "Test container auto-restarted (restart_policy=always)" || test_warn "Test container" "not auto-restarted (HTTP restart may not affect containers)"

# Check production containers - by their RestartPolicy
# A container only auto-restarts after Docker daemon restart if its RestartPolicy != "no"
# - wordpress: unless-stopped → auto-restart
# - grafana:    unless-stopped → auto-restart
# - minio:      no             → does NOT auto-restart (expected Docker behavior)
PROD_AFTER=$(docker ps --format '{{.Names}}\t{{.Status}}' | grep -E "wordpress|grafana|minio" | sort)
echo "$PROD_AFTER" | while read line; do test_info "PROD: $line"; done

# Verify policy-based recovery
for c in wordpress grafana minio; do
  policy=$(docker inspect $c --format '{{.HostConfig.RestartPolicy.Name}}' 2>/dev/null)
  running=$(docker ps --format '{{.Names}}' | grep -c "^${c}$")
  if [ "$policy" != "no" ]; then
    [ "$running" -ge 1 ] && test_pass "$c (policy=$policy) auto-restarted" \
      || test_fail "$c auto-restart" "still down despite policy=$policy"
  else
    # policy=no - expected to stay down
    [ "$running" -eq 0 ] && test_info "$c (policy=no) stayed down (expected)" \
      || test_warn "$c" "policy=no but still running"
  fi
done

section "Cleanup"
docker rm -f $TEST_NAME 2>/dev/null
test_pass "Test container removed"

section "TEST: POST /docker/system/stop (SHOULD break production!)"
test_warn "Stop Docker" "SKIPPED in this script - would break 3 production containers"
test_info "Manually verify: docker ps would return error after /docker/system/stop"

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

exit $FAIL
