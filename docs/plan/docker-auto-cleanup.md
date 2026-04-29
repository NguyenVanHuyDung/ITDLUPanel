# Docker Auto-Cleanup Feature Plan

> **Chức năng:** Tự động dọn dẹp tài nguyên Docker (container đã dừng, image treo, volume không sử dụng, network rác) sau một khoảng thời gian vận hành.
>
> **Mục tiêu:** Giải phóng disk, giảm clutter, giữ môi trường Docker gọn gàng mà không cần can thiệp thủ công.
>
> **Target:** ITDLUPanel v0.1.x

---

## 1. Tổng Quan Chức Năng

### 1.1 Mô tả

Cho phép người dùng cấu hình các **cleanup rules** để hệ thống tự động dọn dẹp tài nguyên Docker theo lịch trình hoặc điều kiện. Mỗi rule có thể áp dụng cho một hoặc nhiều loại tài nguyên: stopped containers, unused images, dangling volumes, unused networks.

### 1.2 Các loại cleanup

| Loại | Mô tả | API Docker Engine tương ứng |
|------|--------|-----------------------------|
| `stopped_containers` | Xóa container đã dừng (status=exited) | `DELETE /containers/prune` |
| `dangling_images` | Xóa image không có tag (dangling) | `POST /images/prune` |
| `unused_images` | Xóa image không được container nào sử dụng | `POST /images/prune?filters={"dangling":{"true"}}` |
| `unused_volumes` | Xóa volume không được mount bởi container | `DELETE /volumes/prune` |
| `unused_networks` | Xóa network không được container nào sử dụng | `DELETE /networks/prune` |
| `build_cache` | Xóa build cache | `POST /build/prune` |

### 1.3 Cleanup modes

- **Manual:** Người dùng click button để clean ngay lập tức
- **Scheduled:** Chạy theo cron schedule (daily, weekly, custom cron expression)
- **Threshold-based:** Chạy khi disk usage vượt ngưỡng (e.g., disk > 80%)

---

## 2. Thiết Kế Database

### 2.1 Bảng `docker_cleanup_rules`

```sql
CREATE TABLE docker_cleanup_rules (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    cleanup_types TEXT    NOT NULL,  -- JSON array: ["stopped_containers", "dangling_images"]
    mode          TEXT    NOT NULL,  -- 'manual' | 'schedule' | 'threshold'
    schedule      TEXT,              -- cron expression: "0 3 * * *" (daily at 3AM)
    threshold_pct INTEGER,           -- disk usage threshold: 80
    enabled       INTEGER DEFAULT 1,
    keep_last_log INTEGER DEFAULT 1, -- giữ lại N bản log gần nhất
    created_by    INTEGER,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
);
```

### 2.2 Bảng `docker_cleanup_logs`

```sql
CREATE TABLE docker_cleanup_logs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_id         INTEGER,
    triggered_by    TEXT,            -- 'manual' | 'schedule' | 'threshold'
    started_at      DATETIME,
    finished_at     DATETIME,
    space_reclaimed INTEGER,         -- bytes
    items_removed   TEXT,            -- JSON: {"containers": 3, "images": 5, "volumes": 1}
    errors          TEXT,            -- JSON array of error messages
    status          TEXT,            -- 'running' | 'success' | 'failed'
    FOREIGN KEY (rule_id) REFERENCES docker_cleanup_rules(id)
);
```

---

## 3. Backend

### 3.1 Go Service: `internal/service/docker_cleanup_service.go`

```
DockerCleanupService
├── ListRules() ([]CleanupRule, error)
├── GetRule(id) (CleanupRule, error)
├── CreateRule(req) (CleanupRule, error)
├── UpdateRule(id, req) (CleanupRule, error)
├── DeleteRule(id) error
├── RunCleanup(ruleID, triggeredBy) (*CleanupResult, error)
├── PruneStoppedContainers() (*PruneResult, error)
├── PruneImages(danglingOnly bool) (*PruneResult, error)
├── PruneVolumes() (*PruneResult, error)
├── PruneNetworks() (*PruneResult, error)
├── PruneBuildCache() (*PruneResult, error)
├── GetLogs(ruleID, limit) ([]CleanupLog, error)
├── ClearLogs(ruleID) error
└── CheckThreshold() (bool, int, error) // bool=exceeded, int=usagePct
```

### 3.2 API Handler: `internal/api/v1/docker_cleanup.go`

```
POST   /docker/cleanup/rules              -- Tạo rule mới
GET    /docker/cleanup/rules              -- List all rules
GET    /docker/cleanup/rules/:id          -- Get rule detail
PUT    /docker/cleanup/rules/:id          -- Update rule
DELETE /docker/cleanup/rules/:id          -- Delete rule
POST   /docker/cleanup/rules/:id/run      -- Run cleanup ngay (manual)
GET    /docker/cleanup/logs               -- Get all logs
GET    /docker/cleanup/logs/:rule_id      -- Get logs for rule
DELETE /docker/cleanup/logs/:rule_id     -- Clear logs for rule
GET    /docker/cleanup/stats              -- Get disk usage stats
POST   /docker/cleanup/dry-run           -- Dry run (xem trước ket qua)
```

### 3.3 Cron Integration

Thêm `docker_cleanup` type vào cron service để run theo schedule. Mỗi khi có rule `mode='schedule'` thì đăng ký vào system crontab:

```go
// Ví dụ schedule: "0 3 * * *" (daily 3AM)
// Cron command: /opt/itdlupanel/panel cron-run -cleanup-rule=42
```

Threshold-based cleanup được trigger bởi background goroutine check disk usage mỗi 15 phút.

### 3.4 RBAC Permission

Thêm permission mới: `docker.cleanup` trong `internal/rbac/permissions.go`.

---

## 4. Frontend

### 4.1 Tab mới trong Docker Settings

**Route/Position:** Tab thứ 11 trong Docker page (`/web/src/pages/Docker/index.tsx`), gọi là **"Cleanup"**

**File mới:** `web/src/pages/Docker/CleanupTab.tsx` (~400-500 dòng)

### 4.2 Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Docker Cleanup                                    [Refresh] │
│─────────────────────────────────────────────────────────────│
│  ┌─ Rule Cards (maxWidth: none) ─────────────────────────┐  │
│  │                                                       │  │
│  │  [Card]  "Daily Cleanup"         [Enabled Toggle]     │  │
│  │          stopped_containers, dangling_images           │  │
│  │          Schedule: 0 3 * * *  │ Last run: 2h ago     │  │
│  │          Space reclaimed: 1.2GB │ Status: ✓ Success    │  │
│  │          [Edit] [Run Now] [Delete]                    │  │
│  │                                                       │  │
│  │  [Card]  "Weekly Deep Clean"      [Enabled Toggle]    │  │
│  │          all types                                       │  │
│  │          Schedule: 0 4 * * 0   │ Last run: 3d ago     │  │
│  │          [Edit] [Run Now] [Delete]                    │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  [+ Add Cleanup Rule]                                      │
│─────────────────────────────────────────────────────────────│
│  Recent Cleanup Logs (table, maxWidth: 640)                │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Rule        │ Trigger  │ Started    │ Space │ Status │  │
│  │ Daily Clean │ Schedule │ 2026-04-28 │ 1.2GB │ ✓ OK  │  │
│  │ Weekly Deep │ Manual   │ 2026-04-27 │ 3.4GB │ ✓ OK  │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 Create/Edit Rule Modal

```
┌─ Create Cleanup Rule ─────────────────────────────────────┐
│                                                            │
│  Name: [Daily Docker Cleanup___________________________]   │
│                                                            │
│  Cleanup Types:                                            │
│  ☑ Stopped Containers                                     │
│  ☑ Dangling Images                                        │
│  ☐ Unused Volumes                                         │
│  ☐ Unused Networks                                        │
│  ☐ Build Cache                                            │
│                                                            │
│  Mode:                                                     │
│  ○ Manual (run on demand only)                             │
│  ● Scheduled (run on cron schedule)                        │
│    Cron Expression: [0 3 * * *_____________________]       │
│    (preview: "Every day at 3:00 AM")                      │
│                                                            │
│  ○ Threshold-based                                         │
│    Run when disk usage exceeds: [80__] %                  │
│                                                            │
│  Keep last [10] cleanup logs                               │
│                                                            │
│  [Cancel]                          [Create Rule]           │
└────────────────────────────────────────────────────────────┘
```

### 4.4 Dry Run Modal

Hiển thị trước khi chạy cleanup — xem container/image/volume nào sẽ bị xóa mà không thực sự xóa.

### 4.5 API Frontend

```typescript
// web/src/services/api.ts
api.get('/docker/cleanup/rules')
api.post('/docker/cleanup/rules', data)
api.put(`/docker/cleanup/rules/${id}`, data)
api.delete(`/docker/cleanup/rules/${id}`)
api.post(`/docker/cleanup/rules/${id}/run`)
api.get('/docker/cleanup/logs')
api.get('/docker/cleanup/stats')
api.post('/docker/cleanup/dry-run', { types: string[] })
```

### 4.6 Store (Zustand)

```typescript
// web/src/stores/dockerCleanup.ts
interface DockerCleanupStore {
  rules: CleanupRule[]
  logs: CleanupLog[]
  stats: DockerDiskStats
  loading: boolean
  fetchRules: () => Promise<void>
  fetchLogs: () => Promise<void>
  fetchStats: () => Promise<void>
  createRule: (data: CreateRulePayload) => Promise<void>
  updateRule: (id: number, data: UpdateRulePayload) => Promise<void>
  deleteRule: (id: number) => Promise<void>
  runCleanup: (id: number) => Promise<string>
  dryRun: (types: string[]) => Promise<DryRunResult>
  clearLogs: (ruleId: number) => Promise<void>
}
```

---

## 5. UI Consistency — Checklist

Đảm bảo component mới tuân theo design system đã được refactor của Settings:

| Pattern | Implementation |
|---------|---------------|
| `sectionBox` | `maxWidth: 640` cho rule cards, `maxWidth: 'none'` cho stats overview |
| Button styles | `btnPrimary`, `btnOutline`, `btnDanger` từ Settings pattern |
| Nav tabs | Text-style tabs, `border: none`, `fontWeight: 500`, `accent15` active |
| Palette vars | Dùng `p.card`, `p.accent`, `p.cardBorder`, `p.rowAlt` thay vì hardcoded hex |
| SVG Icons | `NotifIcon` pattern từ Settings hoặc inline SVG |
| Empty states | Icon + title + description + CTA button |
| Section titles | `sectionTitle()` helper với icon + title + extra slot |

---

## 6. Implementation Order

### Phase 1: Backend Core (3-4 days)
1. Thêm migration cho 2 bảng `docker_cleanup_rules` và `docker_cleanup_logs`
2. Tạo `internal/service/docker_cleanup_service.go` với các method prune
3. Tạo `internal/api/v1/docker_cleanup.go` handler + register routes
4. Thêm `docker.cleanup` permission vào RBAC
5. Implement cron integration cho scheduled cleanup
6. Viết unit test cho service layer

### Phase 2: Backend Threshold Engine (1-2 days)
7. Background goroutine checker cho threshold-based cleanup
8. Disk usage monitoring integration với `/docker/system/df`
9. Dry-run API endpoint

### Phase 3: Frontend Core (2-3 days)
10. Tạo `web/src/stores/dockerCleanup.ts`
11. Tạo `web/src/pages/Docker/CleanupTab.tsx` — tab chính với rule cards
12. Implement Create/Edit Rule modal
13. Implement Run Now + Delete actions
14. Implement Logs table

### Phase 4: Frontend Advanced (1-2 days)
15. Dry-run modal với preview
16. Stats card (disk usage overview)
17. i18n: thêm keys cho Docker cleanup vào `en.json` + `vi.json`
18. Responsive mobile layout

### Phase 5: Integration & Polish (1 day)
19. Integration test end-to-end
20. Error handling + notification on cleanup complete
21. Review UI với linter
22. Update README/docs

---

## 7. Technical Considerations

### 7.1 Docker Socket Permissions
Lệnh prune yêu cầu quyền truy cập `/var/run/docker.sock`. Đảm bảo panel chạy với user có quyền Docker (thường là `root` hoặc user thuộc group `docker`).

### 7.2 Concurrency
- Scheduled cleanup: chạy qua cron subprocess (`panel cron-run`), không block main process
- Threshold check: background goroutine, không blocking
- Manual cleanup: synchronous, có loading state

### 7.3 Safety
- **Dry-run trước:** Luôn cho phép xem trước những gì sẽ bị xóa
- **Confirmation dialog:** Confirm trước khi xóa bất kỳ resource nào (trừ auto-scheduled)
- **Keep minimum:** Không xóa image đang được running container sử dụng
- **Log everything:** Mọi cleanup action đều được log vào `docker_cleanup_logs`

### 7.4 Notifications
Khi cleanup hoàn thành (scheduled hoặc threshold), gửi notification event qua `SetNotifier()` pattern (giống như backup_service và cron_service):
```go
notifier.Notify("cleanup_completed", map[string]interface{}{
    "rule_name":   rule.Name,
    "space_freed": result.SpaceReclaimed,
    "items_removed": result.ItemsRemoved,
    "status":      result.Status,
})
```

### 7.5 Scheduled Cleanup Engine
Sử dụng cùng mechanism với cron service — tạo cron entry trong system crontab:
```go
// Khi rule có mode='schedule':
// Entry trong crontab:
// 0 3 * * * CRON_TZ=Asia/Ho_Chi_Minh /opt/itdlupanel/panel cron-run -cleanup-rule=<id>
```
Hoặc có thể dùng internal scheduler (goroutine-based) để tránh phụ thuộc system crontab — tương tự cách backup service tự schedule.

---

## 8. API Response Shapes

### GET /docker/cleanup/rules
```json
{
  "data": [
    {
      "id": 1,
      "name": "Daily Cleanup",
      "cleanup_types": ["stopped_containers", "dangling_images"],
      "mode": "schedule",
      "schedule": "0 3 * * *",
      "threshold_pct": null,
      "enabled": true,
      "keep_last_log": 10,
      "last_run_at": "2026-04-28T03:00:00Z",
      "last_run_status": "success",
      "last_space_reclaimed": 1258291200,
      "created_at": "2026-04-01T00:00:00Z"
    }
  ]
}
```

### POST /docker/cleanup/rules/:id/run
```json
{
  "data": {
    "rule_id": 1,
    "triggered_by": "manual",
    "started_at": "2026-04-28T10:00:00Z",
    "status": "success",
    "space_reclaimed": 536870912,
    "items_removed": {
      "containers": 2,
      "images": 4,
      "volumes": 0,
      "networks": 1
    },
    "errors": []
  }
}
```

### POST /docker/cleanup/dry-run
```json
{
  "data": {
    "stopped_containers": [
      { "id": "abc123", "name": "web-app", "created": "2026-04-20T00:00:00Z", "size": "~50MB" }
    ],
    "dangling_images": [
      { "id": "sha256:def456", "tags": ["<none>:<none>"], "size": "~200MB" }
    ],
    "unused_volumes": [
      { "name": "db-data-old", "created": "2026-04-15T00:00:00Z" }
    ],
    "total_space_reclaimable": "1.2 GB"
  }
}
```

### GET /docker/cleanup/stats
```json
{
  "data": {
    "disk_total": 500000000000,
    "disk_used": 350000000000,
    "disk_free": 150000000000,
    "disk_percent": 70,
    "docker_disk_usage": 45000000000,
    "images_count": 24,
    "containers_count": 12,
    "volumes_count": 8
  }
}
```
