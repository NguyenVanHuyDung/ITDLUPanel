---
name: itdlupanel-publish
description: Skill for publishing a new ITDLUPanel release. Handles frontend build, Go backend build, publish folder creation, archive packaging, checksum generation, and git commit. Use this skill whenever the user asks to publish, release, or create a new version of ITDLUPanel.
license: MIT
metadata:
  author: NguyenVanHuyDung/ITDLUPanel
  version: "1.0.0"
  domain: devops
  triggers: publish, release, tao publish, tao release, xuat ban, new version, phien ban moi, build release, dong goi
  role: specialist
  scope: implementation
  output-format: code+shell
---

# ITDLUPanel Publish Skill

Expert publish workflow for ITDLUPanel — a Go + React/TypeScript server management panel. Handles versioning, building, packaging, and releasing new versions.

## Project Context

- **Repo**: `/root/ITDLUPanel`
- **Go binary**: `cmd/panel/` → `bin/itdlupanel`
- **Frontend**: `web/` (Vite + React + TypeScript)
- **Go toolchain**: `/usr/local/go/bin/go` (v1.25.9) — NOT `/usr/bin/go` (v1.18, wrong)
- **go.mod version**: keep at `go 1.23` (compatible with 1.25.9 toolchain)
- **Publish folder**: `publish/v<N>/` — one folder per version
- **Archive format**: `itdlupanel-v<N>-linux-amd64.tar.gz`

## Publish Workflow

### Step 1 — Determine next version

```bash
ls /root/ITDLUPanel/publish/
# Find highest vN folder, increment by 1
```

### Step 2 — Create publish folder

```bash
mkdir -p /root/ITDLUPanel/publish/v<N>
```

Copy and update from previous version:
- `publish.sh` — update `VERSION` variable and banner text
- `deploy.sh` — update banner version text
- `DEPLOY.md` — update version, date, and "What's New" section
- `DEPLOY.vi.md` — same as DEPLOY.md but in Vietnamese
- `itdlupanel.service` — copy unchanged (no version-specific content)

### Step 3 — Build frontend

```bash
cd /root/ITDLUPanel/web
npx vite build
```

> ⚠️ Do NOT use `tsc -b && vite build` — there are pre-existing TS errors in the codebase. Use `npx vite build` directly to skip type-check.

### Step 4 — Build Go backend

```bash
cd /root/ITDLUPanel
CGO_ENABLED=0 /usr/local/go/bin/go build -o bin/itdlupanel ./cmd/panel
echo "BUILD_EXIT:$?"
ls -la bin/itdlupanel   # verify timestamp updated
```

> ⚠️ Always check exit code directly — do NOT pipe to `| head` as it masks the real exit code.
> ⚠️ Always use `/usr/local/go/bin/go`, not `go` (which resolves to Go 1.18, too old).

**Common build errors and fixes:**

| Error | Fix |
|---|---|
| `parseID redeclared` | Remove `parseID` helper from new handler files — it already exists in `site.go` |
| `ErrBadRequest undefined` | Use `apperrors.ErrValidation` (422) instead — `ErrBadRequest` does not exist |
| `updates to go.mod needed` | Run `/usr/local/go/bin/go mod tidy` first |
| `package X is not in GOROOT` | Wrong Go binary — use `/usr/local/go/bin/go` |

### Step 5 — Run publish script

```bash
cd /root/ITDLUPanel/publish/v<N>
chmod +x publish.sh
bash publish.sh --skip-frontend   # frontend already built in step 3
```

This creates:
- `publish/v<N>/itdlupanel-v<N>-linux-amd64.tar.gz`
- `publish/v<N>/itdlupanel-v<N>-linux-amd64.tar.gz.sha256`

### Step 6 — Verify archive

```bash
ls -lh /root/ITDLUPanel/publish/v<N>/
tar -tzf publish/v<N>/itdlupanel-v<N>-linux-amd64.tar.gz | head -10
```

Expected archive contents:
```
itdlupanel/itdlupanel
itdlupanel/deploy.sh
itdlupanel/itdlupanel.service
itdlupanel/config/panel.json
itdlupanel/data/.gitkeep
itdlupanel/DEPLOY.md
itdlupanel/DEPLOY.vi.md
```

### Step 7 — Commit

```bash
cd /root/ITDLUPanel
git add publish/v<N>/
git add go.mod go.sum  # if updated
git commit -m "release: v<N>.0.0

- <summary of what's new>

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

> ⚠️ Do NOT commit the `.tar.gz` archive itself (binary file, bloats repo). Only commit the scripts and docs. Add to `.gitignore` if needed.

## File Templates

### publish.sh key variables to update

```bash
VERSION="<N>.0.0"
# update banner line:
echo -e "${BOLD}║     ITDLUPanel — Publish Builder v<N>                   ║${NC}"
# update ARCHIVE_NAME reference from v<N-1> to v<N>
ARCHIVE_NAME="itdlupanel-v<N>-linux-${ARCH}.tar.gz"
```

### deploy.sh key line to update

```bash
# update banner:
echo -e "${BOLD}  ║   ${CYAN}ITDLUPanel${NC}${BOLD} — Server Deployment v<N>              ║${NC}"
```

### DEPLOY.md / DEPLOY.vi.md sections to update

1. **Version** field at top
2. **Published** date (current date)
3. **What's New in v<N>** section — add new features implemented since previous version
4. All `v<N-1>` references in code examples → `v<N>`

## What's New Sections — Feature Reference

Use git log to find features added since last version:

```bash
git log --oneline --no-pager | head -20
```

Each feature that appears in commits should be documented in "What's New":
- `feat:` commits → new features
- `fix:` commits → important bug fixes worth mentioning

## Database Migrations

If new DB migrations were added in this version, mention the new tables/columns in "What's New".

Check which migrations exist:

```bash
ls /root/ITDLUPanel/internal/database/migrations/
sqlite3 /root/ITDLUPanel/data/panel.db "SELECT * FROM schema_migrations ORDER BY version;"
```

## Panel Restart After Publish

After building a new binary, the running panel uses the old binary until restarted:

```bash
pgrep -fa "itdlupanel"         # find PID
kill <PID>
cd /root/ITDLUPanel
nohup ./bin/itdlupanel > /dev/null 2>&1 &
sleep 5
curl -sk https://localhost:8888/api/v1/health  # verify up
# verify migrations applied:
sqlite3 data/panel.db "SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 3;"
```

> ⚠️ If panel exits immediately after restart, check if old process is still holding port 8888.
> Use `pgrep -fa "itdlupanel"` — look for processes with `(deleted)` in exe path (old binary).

## Version History

| Version | Key Features |
|---|---|
| v1 | Initial release |
| v2 | Core panel features |
| v3 | Enhanced management |
| v4 | UFW firewall, Docker templates, Notification system, Cron templates |
| v5 | Docker Auto-Cleanup, Ubuntu 24.04 installer support, Notification UI rewrite |
