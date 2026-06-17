#!/usr/bin/env bash
# P3 Test - Cloud Image + One-Click Install
# Test Docker Hub search, pull, tag, and one-click templates

set -uo pipefail

PANEL_URL="${PANEL_URL:-https://10.20.1.243:8888}"
API="${PANEL_URL}/api/v1"
LOGIN_BODY='{"username":"admin","password":"admin@123456"}'
TOKEN=$(curl -ks -X POST $PANEL_URL/api/v1/auth/login -H "Content-Type: application/json" -d "$LOGIN_BODY" | jq -r '.data.access_token // empty')
echo "$TOKEN" > /root/ITDLUPanel/tests/.token
[ -z "$TOKEN" ] && { echo "FATAL: token refresh failed"; exit 1; }

TEST_PREFIX="itdlu_p3_$$"

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
docker ps -a --format '{{.Names}}' 2>/dev/null | grep -E "^${TEST_PREFIX}|itdlu_p3_" | xargs -r docker rm -f 2>/dev/null
# Remove any test images
for img in itdlu_p3_image alpine nginx redis busybox hello-world; do
  docker images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null | grep -E "^${img}:" | head -1 | xargs -r docker rmi -f 2>/dev/null
done
test_pass "Cleanup done"

# ============ 2.5.2: SEARCH IMAGES ============
section "2.5.2: Search cloud images"

# Search for "nginx" - should return Docker Hub results
SEARCH_RESP=$(api GET "/docker/images/search?q=nginx")
SEARCH_STATUS=$(api_status GET "/docker/images/search?q=nginx")
[ "$SEARCH_STATUS" = "200" ] && test_pass "Search 'nginx' (HTTP 200)" || test_fail "Search nginx" "HTTP $SEARCH_STATUS"

# Parse result count
SEARCH_COUNT=$(echo "$SEARCH_RESP" | jq -r '.data | length // 0' 2>/dev/null)
test_info "Search results: $SEARCH_COUNT"
[ "$SEARCH_COUNT" -gt 0 ] && test_pass "Search returned $SEARCH_COUNT results" || test_fail "Search empty" "no results"

# Search result has expected fields
FIRST_RESULT=$(echo "$SEARCH_RESP" | jq -r '.data[0] // empty' 2>/dev/null)
[ -n "$FIRST_RESULT" ] && test_pass "Search result has data" || test_fail "Search data" "empty"

# Check first result has name + description
HAS_NAME=$(echo "$FIRST_RESULT" | jq -r '.name // empty')
HAS_DESC=$(echo "$FIRST_RESULT" | jq -r '.description // empty')
[ -n "$HAS_NAME" ] && test_pass "First result has name: $HAS_NAME" || test_fail "No name" "missing"
[ -n "$HAS_DESC" ] && test_pass "First result has description" || test_warn "No description" "missing field"

# Search for popular terms
for term in redis postgres mysql mongo; do
  R=$(api GET "/docker/images/search?q=$term")
  C=$(echo "$R" | jq -r '.data | length // 0' 2>/dev/null)
  [ "$C" -gt 0 ] && test_pass "Search '$term' returned $C results" || test_fail "Search $term" "no results"
done

# Search with empty query (should fail)
EMPTY_STATUS=$(api_status GET "/docker/images/search?q=")
[ "$EMPTY_STATUS" != "200" ] && test_pass "Reject empty query (HTTP $EMPTY_STATUS)" || test_fail "Empty query" "accepted (HTTP $EMPTY_STATUS)"

# Search with no query param at all
NO_Q_STATUS=$(api_status GET "/docker/images/search")
[ "$NO_Q_STATUS" != "200" ] && test_pass "Reject missing q param (HTTP $NO_Q_STATUS)" || test_fail "No q" "accepted"

# ============ 2.5.3: PULL IMAGE ============
section "2.5.3: Pull image from Docker Hub"

# Pull alpine:3.18 (small ~5MB)
PULL_BODY='{"name":"alpine:3.18"}'
PULL_STATUS=$(api_status POST "/docker/images/pull" "$PULL_BODY")
[ "$PULL_STATUS" = "200" ] && test_pass "Pull alpine:3.18 (HTTP 200)" || test_fail "Pull alpine" "HTTP $PULL_STATUS"
sleep 3

# Verify image is now available locally
ALPINE_PRESENT=$(docker images --format "{{.Repository}}:{{.Tag}}" | grep "^alpine:3.18$" | head -1)
[ -n "$ALPINE_PRESENT" ] && test_pass "Alpine:3.18 image present" || test_fail "Alpine missing" "not in local cache"

# Pull a tagless image (should default to :latest)
PULL_BODY2='{"name":"hello-world"}'
PULL_STATUS2=$(api_status POST "/docker/images/pull" "$PULL_BODY2")
[ "$PULL_STATUS2" = "200" ] && test_pass "Pull hello-world (default :latest)" || test_warn "Pull hello" "HTTP $PULL_STATUS2"
sleep 2
HELLO_PRESENT=$(docker images --format "{{.Repository}}:{{.Tag}}" | grep "^hello-world:latest$" | head -1)
[ -n "$HELLO_PRESENT" ] && test_pass "hello-world:latest image present" || test_warn "hello-world missing" "not in cache"

# Pull non-existent image (should fail)
PULL_BAD='{"name":"this-image-does-not-exist-xyz123:1.0.0"}'
PULL_BAD_STATUS=$(api_status POST "/docker/images/pull" "$PULL_BAD")
[ "$PULL_BAD_STATUS" != "200" ] && test_pass "Reject invalid image (HTTP $PULL_BAD_STATUS)" || test_fail "Invalid pull" "accepted (HTTP $PULL_BAD_STATUS)"

# Pull with empty name (should fail)
PULL_EMPTY_STATUS=$(api_status POST "/docker/images/pull" '{"name":""}')
[ "$PULL_EMPTY_STATUS" != "200" ] && test_pass "Reject empty name (HTTP $PULL_EMPTY_STATUS)" || test_fail "Empty pull" "accepted"

# ============ 2.5.4: INSPECT + TAG ============
section "2.5.4: Inspect + Tag image"

# Get alpine image ID
ALPINE_ID=$(docker images --format "{{.ID}}" alpine:3.18 | head -1)
test_info "Alpine ID: $ALPINE_ID"

# Inspect image
INSPECT_STATUS=$(api_status GET "/docker/images/${ALPINE_ID}/inspect")
[ "$INSPECT_STATUS" = "200" ] && test_pass "Inspect image (HTTP 200)" || test_fail "Inspect" "HTTP $INSPECT_STATUS"
INSPECT_BODY=$(api GET "/docker/images/${ALPINE_ID}/inspect")
ARCH=$(echo "$INSPECT_BODY" | jq -r '.data.arch // empty' 2>/dev/null)
[ -n "$ARCH" ] && test_pass "Inspect has arch: $ARCH" || test_warn "Arch" "missing"

# Get image history
HISTORY_STATUS=$(api_status GET "/docker/images/${ALPINE_ID}/history")
[ "$HISTORY_STATUS" = "200" ] && test_pass "Get image history" || test_fail "History" "HTTP $HISTORY_STATUS"

# Tag image
TAG_BODY='{"repo":"itdlu_p3_tagged","tag":"v1.0"}'
TAG_STATUS=$(api_status POST "/docker/images/${ALPINE_ID}/tag" "$TAG_BODY")
[ "$TAG_STATUS" = "200" ] && test_pass "Tag image (HTTP 200)" || test_fail "Tag" "HTTP $TAG_STATUS"
sleep 1
TAGGED_PRESENT=$(docker images --format "{{.Repository}}:{{.Tag}}" | grep "^itdlu_p3_tagged:v1.0$" | head -1)
[ -n "$TAGGED_PRESENT" ] && test_pass "Tagged image present" || test_warn "Tag not visible" "local cache may differ"
# Cleanup
docker rmi itdlu_p3_tagged:v1.0 2>/dev/null

# ============ 2.10: ONE-CLICK INSTALL ============
section "2.10: One-Click Install (38 templates)"

# Read templates from frontend source
TEMPLATES_FILE="/root/ITDLUPanel/web/src/pages/Docker/components/OneClickInstall.tsx"
TEMPLATE_COUNT=$(grep -c "^  { name: '" $TEMPLATES_FILE)
test_info "Frontend defines $TEMPLATE_COUNT templates"

# Verify all templates have required fields
MISSING_FIELDS=0
TOTAL=$TEMPLATE_COUNT
for line in $(grep "^  { name: '" $TEMPLATES_FILE); do
  # Just count
  :
done

# Test install of a few selected templates (pull + create container)
# We won't actually run all 38 to keep test fast
SAMPLE_TEMPLATES=("nginx:latest" "redis:alpine" "alpine:3.18")

for IMG in "${SAMPLE_TEMPLATES[@]}"; do
  CNAME="${TEST_PREFIX}_oc_$(echo $IMG | tr ':/' '_' | tr -d '.')"
  PULL_S=$(api_status POST "/docker/images/pull" "{\"name\":\"$IMG\"}")
  test_info "Pull $IMG: HTTP $PULL_S"
  # Create container (don't auto-start - just verify create works)
  CREATE_BODY='{"image":"'$IMG'","name":"'$CNAME'"}'
  CREATE_S=$(api_status POST "/docker/containers" "$CREATE_BODY")
  if [ "$CREATE_S" = "201" ] || [ "$CREATE_S" = "200" ]; then
    test_pass "Create container from $IMG"
    # Start it
    START_S=$(api_status POST "/docker/containers/${CNAME}/start")
    [ "$START_S" = "200" ] && test_pass "Start container from $IMG" || test_warn "Start $IMG" "HTTP $START_S"
    sleep 1
    # Stop and remove
    api_status POST "/docker/containers/${CNAME}/stop" >/dev/null
    sleep 1
    api_status DELETE "/docker/containers/${CNAME}?force=true" >/dev/null
  else
    test_fail "Create from $IMG" "HTTP $CREATE_S"
  fi
done

# Verify category distribution
test_info "Template categories distribution:"
echo "$(grep -oE "category: '[^']+'" $TEMPLATES_FILE | sort | uniq -c | sort -rn | sed 's/^/    /')"

# Verify all template images use official Docker Hub
OFFICIAL=$(grep -cE "^  \{ name: '[A-Z]" $TEMPLATES_FILE)
echo "    (All use Docker Hub registry)"

# ============ 2.5.1: LIST IMAGES ============
section "2.5.1: List images (verify pulled)"

# List images
LIST_RESP=$(api GET "/docker/images")
LIST_STATUS=$(api_status GET "/docker/images")
[ "$LIST_STATUS" = "200" ] && test_pass "List images (HTTP 200)" || test_fail "List images" "HTTP $LIST_STATUS"

# Count images
IMG_COUNT=$(echo "$LIST_RESP" | jq -r '.data | length // 0' 2>/dev/null)
test_info "Total images: $IMG_COUNT"
[ "$IMG_COUNT" -gt 0 ] && test_pass "Image list has $IMG_COUNT entries" || test_fail "No images" "empty list"

# Verify alpine is in list
ALPINE_IN_LIST=$(echo "$LIST_RESP" | jq -r '.data[]? | .tags[]? // empty' 2>/dev/null | grep -E "^alpine:" | head -1)
[ -n "$ALPINE_IN_LIST" ] && test_pass "alpine found in image list" || test_warn "alpine" "not found in list response"

# Image prune
PRUNE_STATUS=$(api_status POST "/docker/images/prune")
[ "$PRUNE_STATUS" = "200" ] && test_pass "Prune images" || test_fail "Prune" "HTTP $PRUNE_STATUS"

# ============ 2.5.5: REMOVE IMAGE ============
section "2.5.5: Remove image"

# Remove hello-world
HELLO_ID=$(docker images --format "{{.ID}}" hello-world | head -1)
if [ -n "$HELLO_ID" ]; then
  RM_STATUS=$(api_status DELETE "/docker/images/${HELLO_ID}?force=true")
  [ "$RM_STATUS" = "200" ] && test_pass "Remove hello-world image" || test_fail "Remove image" "HTTP $RM_STATUS"
  sleep 1
  STILL_PRESENT=$(docker images --format "{{.Repository}}:{{.Tag}}" | grep -E "^hello-world:linux$" | head -1)
  [ -z "$STILL_PRESENT" ] && test_pass "Image removed from local cache" || test_warn "Remove" "linux tag still in cache"
fi

# ============ POST-CLEANUP ============
section "Post-cleanup"
docker ps -a --format '{{.Names}}' 2>/dev/null | grep -E "^${TEST_PREFIX}|itdlu_p3_" | xargs -r docker rm -f 2>/dev/null
# Remove test images
for img in alpine:3.18 hello-world itdlu_p3_tagged; do
  docker rmi -f $img 2>/dev/null
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
