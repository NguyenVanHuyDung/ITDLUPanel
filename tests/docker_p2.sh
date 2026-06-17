#!/usr/bin/env bash
# P2 Test - Docker Auto-Cleanup Tab
# Test rules CRUD, dry-run, run, logs

set -uo pipefail

PANEL_URL="${PANEL_URL:-https://10.20.1.243:8888}"
API="${PANEL_URL}/api/v1"
TOKEN=$(cat /root/ITDLUPanel/tests/.token 2>/dev/null)
[ -z "$TOKEN" ] && { echo "FATAL: no token."; exit 1; }

# Refresh token to avoid expiration
LOGIN_BODY='{"username":"admin","password":"admin@123456"}'
TOKEN=$(curl -ks -X POST $PANEL_URL/api/v1/auth/login -H "Content-Type: application/json" -d "$LOGIN_BODY" | jq -r '.data.access_token // empty')
echo "$TOKEN" > /root/ITDLUPanel/tests/.token
[ -z "$TOKEN" ] && { echo "FATAL: token refresh failed"; exit 1; }
echo "Token refreshed (${#TOKEN} chars)"

TEST_PREFIX="itdlu_p2_$$"

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

# ============ PRE-CLEANUP ============
section "Pre-cleanup"
docker ps -a --format '{{.Names}}' 2>/dev/null | grep -E "^${TEST_PREFIX}|itdlu_p2_" | xargs -r docker rm -f 2>/dev/null
docker volume ls --format '{{.Name}}' 2>/dev/null | grep -E "^${TEST_PREFIX}|itdlu_p2_" | xargs -r docker volume rm -f 2>/dev/null
docker network ls --format '{{.Name}}' 2>/dev/null | grep -E "^${TEST_PREFIX}|itdlu_p2_" | xargs -r docker network rm 2>/dev/null
# Remove all test rules
RULES_BEFORE=$(api GET "/docker/cleanup/rules")
echo "$RULES_BEFORE" | jq -r '.data[]? | select(.name | startswith("itdlu_p2_")) | .id' 2>/dev/null | while read rid; do
  [ -n "$rid" ] && api_status DELETE "/docker/cleanup/rules/$rid" >/dev/null
done
test_pass "Cleanup done"

# ============ 2.11.1: PAGE LOAD ============
section "2.11.1: Page load"

# List rules
RULES=$(api GET "/docker/cleanup/rules")
RULES_STATUS=$(api_status GET "/docker/cleanup/rules")
[ "$RULES_STATUS" = "200" ] && test_pass "List cleanup rules (HTTP 200)" || test_fail "List rules" "HTTP $RULES_STATUS"
RULES_DATA=$(echo "$RULES" | jq -r '.data' 2>/dev/null)
RULES_LEN=$(echo "$RULES_DATA" | jq -r 'length // 0' 2>/dev/null)
test_info "Existing rules: $RULES_LEN"

# Stats
STATS=$(api GET "/docker/cleanup/stats")
STATS_STATUS=$(api_status GET "/docker/cleanup/stats")
[ "$STATS_STATUS" = "200" ] && test_pass "Get cleanup stats" || test_fail "Get stats" "HTTP $STATS_STATUS"
echo "$STATS" | jq '.data' 2>/dev/null | head -10

# ============ 2.11.2: RULE CRUD ============
section "2.11.2: Rule CRUD"

# Create manual rule (simplest mode)
RULE_NAME="${TEST_PREFIX}_manual"
RULE_BODY='{"name":"'$RULE_NAME'","cleanup_types":["stopped_containers","dangling_images"],"mode":"manual","keep_last_log":10}'
CREATE_RESP=$(api POST "/docker/cleanup/rules" "$RULE_BODY")
CREATE_STATUS=$(api_status POST "/docker/cleanup/rules" "$RULE_BODY")
[ "$CREATE_STATUS" = "200" ] || [ "$CREATE_STATUS" = "201" ] && test_pass "Create manual rule (HTTP $CREATE_STATUS)" || test_fail "Create rule" "HTTP $CREATE_STATUS: $CREATE_RESP"
RULE_ID=$(echo "$CREATE_RESP" | jq -r '.data.id // .id // empty' 2>/dev/null)
test_info "Rule ID: $RULE_ID"

# Get rule
GET_STATUS=$(api_status GET "/docker/cleanup/rules/$RULE_ID")
[ "$GET_STATUS" = "200" ] && test_pass "Get rule by ID" || test_fail "Get rule" "HTTP $GET_STATUS"

# Update rule
UPDATE_BODY='{"name":"'$RULE_NAME'_v2","cleanup_types":["stopped_containers","dangling_images","unused_volumes"],"mode":"manual","keep_last_log":20}'
UPDATE_STATUS=$(api_status PUT "/docker/cleanup/rules/$RULE_ID" "$UPDATE_BODY")
[ "$UPDATE_STATUS" = "200" ] && test_pass "Update rule" || test_fail "Update rule" "HTTP $UPDATE_STATUS"
# Verify
GET2=$(api GET "/docker/cleanup/rules/$RULE_ID")
NEW_NAME=$(echo "$GET2" | jq -r '.data.name // .name // empty')
[ "$NEW_NAME" = "${RULE_NAME}_v2" ] && test_pass "Update name persisted" || test_warn "Update name" "got '$NEW_NAME'"
TYPES_COUNT=$(echo "$GET2" | jq -r '.data.cleanup_types // .cleanup_types // "[]"' | jq 'length')
[ "$TYPES_COUNT" = "3" ] && test_pass "Update cleanup_types persisted (3 types)" || test_warn "Update types" "got $TYPES_COUNT"

# Create schedule rule
RULE_SCHED_NAME="${TEST_PREFIX}_sched"
RULE_SCHED_BODY='{"name":"'$RULE_SCHED_NAME'","cleanup_types":["dangling_images"],"mode":"schedule","schedule":"@daily","keep_last_log":5}'
SCHED_STATUS=$(api_status POST "/docker/cleanup/rules" "$RULE_SCHED_BODY")
[ "$SCHED_STATUS" = "200" ] || [ "$SCHED_STATUS" = "201" ] && test_pass "Create schedule rule" || test_fail "Schedule rule" "HTTP $SCHED_STATUS"
SCHED_ID=$(echo "$RULE_SCHED_NAME" | jq -r '.' 2>/dev/null)  # placeholder
SCHED_ID=$(curl -ks -H "Authorization: Bearer $TOKEN" $API/docker/cleanup/rules | jq -r ".data[] | select(.name==\"$RULE_SCHED_NAME\") | .id")
test_info "Schedule rule ID: $SCHED_ID"

# Create threshold rule
RULE_THR_NAME="${TEST_PREFIX}_thresh"
RULE_THR_BODY='{"name":"'$RULE_THR_NAME'","cleanup_types":["stopped_containers"],"mode":"threshold","threshold_pct":80,"keep_last_log":3}'
THR_STATUS=$(api_status POST "/docker/cleanup/rules" "$RULE_THR_BODY")
[ "$THR_STATUS" = "200" ] || [ "$THR_STATUS" = "201" ] && test_pass "Create threshold rule" || test_fail "Threshold rule" "HTTP $THR_STATUS"
THR_ID=$(curl -ks -H "Authorization: Bearer $TOKEN" $API/docker/cleanup/rules | jq -r ".data[] | select(.name==\"$RULE_THR_NAME\") | .id")
test_info "Threshold rule ID: $THR_ID"

# ============ 2.11.3: DRY-RUN ============
section "2.11.3: Dry-run logic"

# Create test stopped containers to clean up
echo "=== Setup: create 2 stopped test containers ==="
for i in 1 2; do
  CNAME="${TEST_PREFIX}_stopped_$i"
  api_status POST "/docker/containers" '{"image":"nginx:alpine","name":"'$CNAME'"}' >/dev/null
  # Must START before stop can have any effect (otherwise stays in "Created" state)
  api_status POST "/docker/containers/${CNAME}/start" >/dev/null
  sleep 1
  # Now stop it
  api_status POST "/docker/containers/${CNAME}/stop" >/dev/null
done
sleep 2
STOPPED_COUNT=$(docker ps -a --filter "name=${TEST_PREFIX}_stopped" --filter "status=exited" --format '{{.Names}}' | wc -l)
test_info "Stopped test containers: $STOPPED_COUNT"

# Dry-run with stopped_containers
DRY_BODY='{"types":["stopped_containers"]}'
DRY_RESP=$(api POST "/docker/cleanup/dry-run" "$DRY_BODY")
DRY_STATUS=$(api_status POST "/docker/cleanup/dry-run" "$DRY_BODY")
[ "$DRY_STATUS" = "200" ] && test_pass "Dry-run with stopped_containers (HTTP 200)" || test_fail "Dry-run" "HTTP $DRY_STATUS"

# Verify dry-run reports stopped containers
DRY_LIST=$(echo "$DRY_RESP" | jq -r '.data.stopped_containers[]? | .name' 2>/dev/null | grep "${TEST_PREFIX}" | wc -l)
[ "$DRY_LIST" -ge 2 ] && test_pass "Dry-run found $DRY_LIST test stopped containers" || test_warn "Dry-run count" "expected >=2, got $DRY_LIST"

# Dry-run with multiple types
DRY_BODY2='{"types":["stopped_containers","dangling_images","unused_volumes","unused_networks"]}'
DRY_STATUS2=$(api_status POST "/docker/cleanup/dry-run" "$DRY_BODY2")
[ "$DRY_STATUS2" = "200" ] && test_pass "Dry-run with 4 types" || test_fail "Dry-run multi" "HTTP $DRY_STATUS2"

# Dry-run with empty array
DRY_BODY3='{"types":[]}'
DRY_EMPTY_STATUS=$(api_status POST "/docker/cleanup/dry-run" "$DRY_BODY3")
[ "$DRY_EMPTY_STATUS" = "200" ] && test_info "Dry-run with empty array: HTTP $DRY_EMPTY_STATUS" || test_info "Empty array rejected: HTTP $DRY_EMPTY_STATUS"

# Verify NO actual deletion happened
VERIFY_COUNT=$(docker ps -a --filter "name=${TEST_PREFIX}_stopped" --filter "status=exited" --format '{{.Names}}' | wc -l)
[ "$VERIFY_COUNT" -ge 2 ] && test_pass "Dry-run did NOT delete containers (count=$VERIFY_COUNT)" || test_fail "Dry-run safety" "containers were deleted!"

# ============ 2.11.4: ACTUAL RUN ============
section "2.11.4: Run cleanup (actual delete)"

# Run the rule - should actually delete
RUN_STATUS=$(api_status POST "/docker/cleanup/rules/${RULE_ID}/run")
[ "$RUN_STATUS" = "200" ] && test_pass "Run rule $RULE_ID (HTTP 200)" || test_fail "Run rule" "HTTP $RUN_STATUS"
sleep 2

# Verify containers were deleted
AFTER_COUNT=$(docker ps -a --filter "name=${TEST_PREFIX}_stopped" --filter "status=exited" --format '{{.Names}}' | wc -l)
[ "$AFTER_COUNT" -lt 2 ] && test_pass "Rule deleted stopped containers ($AFTER_COUNT left)" || test_warn "Cleanup" "$AFTER_COUNT stopped containers still there"

# Get run logs
LOGS=$(api GET "/docker/cleanup/logs")
LOGS_STATUS=$(api_status GET "/docker/cleanup/logs")
[ "$LOGS_STATUS" = "200" ] && test_pass "Get cleanup logs" || test_fail "Get logs" "HTTP $LOGS_STATUS"

# Get logs for specific rule
LOGS_RULE=$(api GET "/docker/cleanup/logs/${RULE_ID}")
LOGS_RULE_STATUS=$(api_status GET "/docker/cleanup/logs/${RULE_ID}")
[ "$LOGS_RULE_STATUS" = "200" ] && test_pass "Get logs for rule $RULE_ID" || test_fail "Get rule logs" "HTTP $LOGS_RULE_STATUS"

# Verify log entry has items count
LOG_ITEMS=$(echo "$LOGS_RULE" | jq -r '.data[0].items // .items // "0"' | jq -r '.containers // 0' 2>/dev/null)
test_info "Last run log: containers=$LOG_ITEMS"

# Run with no enabled flag (should still work for manual)
# Create a disabled rule and verify
DIS_NAME="${TEST_PREFIX}_disabled"
DIS_BODY='{"name":"'$DIS_NAME'","cleanup_types":["dangling_images"],"mode":"manual","enabled":false,"keep_last_log":5}'
DIS_STATUS=$(api_status POST "/docker/cleanup/rules" "$DIS_BODY")
[ "$DIS_STATUS" = "200" ] || [ "$DIS_STATUS" = "201" ] && test_pass "Create disabled rule" || test_fail "Disabled rule" "HTTP $DIS_STATUS"
DIS_ID=$(curl -ks -H "Authorization: Bearer $TOKEN" $API/docker/cleanup/rules | jq -r ".data[] | select(.name==\"$DIS_NAME\") | .id")
test_info "Disabled rule ID: $DIS_ID"

# ============ 2.11.5: TOGGLES, SCHEDULE, DELETE ============
section "2.11.5: Toggles + Schedule + Delete"

# Toggle enabled flag
TOGGLE_BODY='{"name":"'$RULE_NAME'_v2","cleanup_types":["stopped_containers","dangling_images","unused_volumes"],"mode":"manual","enabled":false,"keep_last_log":20}'
TOGGLE_STATUS=$(api_status PUT "/docker/cleanup/rules/${RULE_ID}" "$TOGGLE_BODY")
[ "$TOGGLE_STATUS" = "200" ] && test_pass "Toggle enabled=false" || test_fail "Toggle" "HTTP $TOGGLE_STATUS"
# Verify
GET3=$(api GET "/docker/cleanup/rules/$RULE_ID")
ENABLED=$(echo "$GET3" | jq -r '.data.enabled // .enabled // empty')
[ "$ENABLED" = "false" ] || [ "$ENABLED" = "0" ] && test_pass "enabled=false persisted" || test_warn "Enabled flag" "got '$ENABLED'"

# Toggle back
TOGGLE_BODY='{"name":"'$RULE_NAME'_v2","cleanup_types":["stopped_containers","dangling_images","unused_volumes"],"mode":"manual","enabled":true,"keep_last_log":20}'
TOGGLE_STATUS=$(api_status PUT "/docker/cleanup/rules/${RULE_ID}" "$TOGGLE_BODY")
[ "$TOGGLE_STATUS" = "200" ] && test_pass "Toggle enabled=true" || test_warn "Toggle back" "HTTP $TOGGLE_STATUS"

# Delete rules
DEL_STATUS=$(api_status DELETE "/docker/cleanup/rules/${RULE_ID}")
[ "$DEL_STATUS" = "200" ] || [ "$DEL_STATUS" = "204" ] && test_pass "Delete rule $RULE_ID" || test_fail "Delete rule" "HTTP $DEL_STATUS"

# Verify gone
GET_404=$(api_status GET "/docker/cleanup/rules/${RULE_ID}")
[ "$GET_404" = "404" ] || [ "$GET_404" = "500" ] && test_pass "Deleted rule returns 404/500" || test_warn "Get deleted" "HTTP $GET_404"

# Delete logs for disabled rule
DEL_LOGS_STATUS=$(api_status DELETE "/docker/cleanup/logs/${DIS_ID}")
[ "$DEL_LOGS_STATUS" = "200" ] || [ "$DEL_LOGS_STATUS" = "204" ] && test_pass "Clear logs for rule" || test_warn "Clear logs" "HTTP $DEL_LOGS_STATUS"

# Delete remaining test rules
for rid in $SCHED_ID $THR_ID $DIS_ID; do
  [ -n "$rid" ] && api_status DELETE "/docker/cleanup/rules/$rid" >/dev/null
done

# ============ VALIDATION TESTS ============
section "2.11.6: Validation tests"

# 2.11.6.1: Empty name
V1_BODY='{"name":"","cleanup_types":["dangling_images"],"mode":"manual"}'
V1_STATUS=$(api_status POST "/docker/cleanup/rules" "$V1_BODY")
[ "$V1_STATUS" != "200" ] && [ "$V1_STATUS" != "201" ] && test_pass "Reject empty name (HTTP $V1_STATUS)" || test_fail "Empty name" "accepted (HTTP $V1_STATUS)"

# 2.11.6.2: Empty cleanup_types
V2_BODY='{"name":"'$TEST_PREFIX'_v2","cleanup_types":[],"mode":"manual"}'
V2_STATUS=$(api_status POST "/docker/cleanup/rules" "$V2_BODY")
[ "$V2_STATUS" != "200" ] && [ "$V2_STATUS" != "201" ] && test_pass "Reject empty cleanup_types (HTTP $V2_STATUS)" || test_fail "Empty types" "accepted (HTTP $V2_STATUS)"

# 2.11.6.3: Invalid mode
V3_BODY='{"name":"'$TEST_PREFIX'_v3","cleanup_types":["dangling_images"],"mode":"invalid_mode"}'
V3_STATUS=$(api_status POST "/docker/cleanup/rules" "$V3_BODY")
[ "$V3_STATUS" != "200" ] && [ "$V3_STATUS" != "201" ] && test_pass "Reject invalid mode (HTTP $V3_STATUS)" || test_fail "Invalid mode" "accepted (HTTP $V3_STATUS)"

# 2.11.6.4: Invalid cleanup_type
V4_BODY='{"name":"'$TEST_PREFIX'_v4","cleanup_types":["invalid_type_xyz"],"mode":"manual"}'
V4_STATUS=$(api_status POST "/docker/cleanup/rules" "$V4_BODY")
# This may or may not be rejected at create - depends on validation
test_info "Invalid cleanup_type at create: HTTP $V4_STATUS"
# Cleanup if created
V4_ID=$(curl -ks -H "Authorization: Bearer $TOKEN" $API/docker/cleanup/rules | jq -r ".data[] | select(.name==\"${TEST_PREFIX}_v4\") | .id")
[ -n "$V4_ID" ] && api_status DELETE "/docker/cleanup/rules/$V4_ID" >/dev/null

# 2.11.6.5: Run non-existent rule
RUN_404=$(api_status POST "/docker/cleanup/rules/99999/run")
[ "$RUN_404" != "200" ] && test_pass "Run non-existent rule rejected (HTTP $RUN_404)" || test_fail "Run 99999" "should fail"

# 2.11.6.6: Schedule without cron expression
V6_BODY='{"name":"'$TEST_PREFIX'_v6","cleanup_types":["dangling_images"],"mode":"schedule","schedule":""}'
V6_STATUS=$(api_status POST "/docker/cleanup/rules" "$V6_BODY")
test_info "Schedule mode with empty schedule: HTTP $V6_STATUS"
V6_ID=$(curl -ks -H "Authorization: Bearer $TOKEN" $API/docker/cleanup/rules | jq -r ".data[] | select(.name==\"${TEST_PREFIX}_v6\") | .id")
[ -n "$V6_ID" ] && api_status DELETE "/docker/cleanup/rules/$V6_ID" >/dev/null

# ============ POST-CLEANUP ============
section "Post-cleanup"
# Remove all rules with test prefix
curl -ks -H "Authorization: Bearer $TOKEN" $API/docker/cleanup/rules | jq -r '.data[]? | select(.name | startswith("itdlu_p2_")) | .id' 2>/dev/null | while read rid; do
  [ -n "$rid" ] && api_status DELETE "/docker/cleanup/rules/$rid" >/dev/null
done
# Remove test containers
docker ps -a --format '{{.Names}}' 2>/dev/null | grep -E "^${TEST_PREFIX}|itdlu_p2_" | xargs -r docker rm -f 2>/dev/null
# Remove test volumes
docker volume ls --format '{{.Name}}' 2>/dev/null | grep -E "^${TEST_PREFIX}|itdlu_p2_" | xargs -r docker volume rm -f 2>/dev/null
# Remove test networks
docker network ls --format '{{.Name}}' 2>/dev/null | grep -E "^${TEST_PREFIX}|itdlu_p2_" | xargs -r docker network rm 2>/dev/null
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

echo ""
echo "Final cleanup rules count:"
curl -ks -H "Authorization: Bearer $TOKEN" $API/docker/cleanup/rules | jq -r '.data | length' 2>/dev/null | xargs -I {} echo "  {} rule(s) remaining"

exit $FAIL
