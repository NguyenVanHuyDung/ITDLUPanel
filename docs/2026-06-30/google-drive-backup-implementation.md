# Phân Tích & Implement Google Drive Backup cho ITDLUPanel

> Ngày: 2026-06-30 — Phân tích và implement các cải tiến Google Drive backup

---

## 1. Tổng Quan Kiến Trúc Hiện Tại

### 1.1. Các Thành Phần Đã Có (trước khi implement)

| Thành phần | File | Trạng thái |
|---|---|---|
| Backup service core | `internal/service/backup_service.go` | ✅ Hoàn chỉnh |
| Cloud Storage Service (OAuth + Upload) | `internal/service/cloud_storage_service.go` | ✅ Hoàn chỉnh |
| Backup Upload Service (Async) | `internal/service/backup_upload_service.go` | ✅ Hoàn chỉnh |
| Google Drive Installer | `internal/service/installer/google_drive.go` | ✅ Có marker |
| Backup API Handler | `internal/api/v1/backup.go` | ✅ CRUD + Upload |
| Frontend Manager Modal | `web/src/components/GoogleDriveManageModal.tsx` | ✅ UI hoàn chỉnh |

### 1.2. Các Thành Phần Mới Đã Implement

| Thành phần | File | Mô tả |
|---|---|---|
| Cron backup_panel type | `internal/service/cron_service.go` | Thêm `backup_panel` cron type |
| Quota API endpoint | `internal/api/v1/cloud_storage.go` | `GET /cloud-storages/:id/quota` |
| Cron JSON command format | `web/src/pages/Cron/index.tsx` | Backup templates dùng JSON spec |
| GDrive quota display | `web/src/components/GoogleDriveManageModal.tsx` | Hiển thị quota trong UI |

---

## 2. Luồng Backup Hoàn Chỉnh

```
┌────────────────────────────────────────────────────────────────────┐
│                      GOOGLE DRIVE BACKUP FLOW                       │
└────────────────────────────────────────────────────────────────────┘

1. CÀI ĐẶT & CẤU HÌNH
┌─────────────┐     ┌──────────────┐     ┌──────────────────────────┐
│ App Store   │────▶│ Install GD   │────▶│ /server/google_drive/   │
│             │     │ Plugin      │     │ .installed marker       │
└─────────────┘     └──────────────┘     └──────────────────────────┘

2. OAUTH AUTHORIZATION
┌─────────────┐     ┌──────────────┐     ┌──────────────────────────┐
│ User nhập   │────▶│ Device Auth  │────▶│ verification_url +       │
│ Client ID   │     │ Start        │     │ user_code               │
└─────────────┘     └──────────────┘     └──────────────────────────┘
                                              │
                                              ▼
                    ┌──────────────────────────────────────────┐
                    │ User nhập code tại google.com/device    │
                    └──────────────────────────────────────────┘
                                              │
                    ┌──────────────────────────────────────────┐
                    │ Poll thành công → Lưu refresh_token     │
                    └──────────────────────────────────────────┘

3. TẠO BACKUP
┌──────────────────────────────────────────────────────────────────┐
│                     BACKUP OPTIONS                                 │
├──────────────────────────────────────────────────────────────────┤
│ Type:     [Site] [Database] [Panel]                               │
│ Strategy: [Full] [Incremental]                                     │
│ Storage:  [Local] [FTP] [Google Drive ▼]                          │
│ Compress: [gzip] [bzip2] [zstd] [none]                           │
│ Encrypt:  [Passphrase (optional)]                                   │
│ Retention: [Keep last ___ backups]                                 │
└──────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│ 3.1. CREATE LOCAL BACKUP                                         │
│ ┌─────────────────────────────────────────────────────────────┐   │
│ │ tar -czf site_domain_20260630.tar.gz /wwwroot/domain      │   │
│ │ mysqldump | gzip > database_20260630.sql.gz               │   │
│ └─────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
                           │
                           ▼
4. UPLOAD TO GOOGLE DRIVE (ASYNC)
┌──────────────────────────────────────────────────────────────────┐
│ 4.1. ENQUEUE UPLOAD JOB                                          │
│ ┌─────────────────────────────────────────────────────────────┐   │
│ │ INSERT INTO backup_uploads (backup_id, storage_id, status)  │   │
│ │ VALUES (42, 1, 'pending')                                  │   │
│ │ → Return upload_id immediately (non-blocking)              │   │
│ └─────────────────────────────────────────────────────────────┘   │
│                           │                                       │
│                           ▼                                       │
│ 4.2. WORKER POOL PROCESSING (background)                          │
│ ┌─────────────────────────────────────────────────────────────┐   │
│ │ a) Check Google Drive quota                                 │   │
│ │ b) Initiate resumable upload session                        │   │
│ │    POST /upload/drive/v3?uploadType=resumable             │   │
│ │ c) Save session URI to backup_uploads.remote_url            │   │
│ │ d) Upload chunks (256MB each)                              │   │
│ │ e) Update progress every 5s                                │   │
│ └─────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘

5. CRON INTEGRATION (aaPanel-style)
┌──────────────────────────────────────────────────────────────────┐
│ Cron Job: "Backup Site to Google Drive"                           │
├──────────────────────────────────────────────────────────────────┤
│ Schedule: [Daily ▼] [Weekly ▼] [Monthly ▼] [Custom]             │
│ Target:   [All Sites] [Specific Site]                            │
│ Storage:  [Google Drive ▼] [Specific Account]                     │
│ Keep:     [___] backups                                          │
│ Local:    [✓] Keep local copy    [ ] Delete after upload         │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. Các File Đã Sửa

### 3.1. Backend (Go)

#### `internal/service/cron_service.go`
- Thêm `backup_panel` vào validation types
- Cập nhật `buildCrontabCommand()` để hỗ trợ `backup_panel`
- Cập nhật `backupTypeFor()` để convert `backup_panel` → `panel`

```go
// CreateCronRequest - thêm backup_panel
Type string `validate:"required,oneof=shell url backup_site backup_db backup_panel"`

// backupTypeFor - thêm panel support
func backupTypeFor(cronType string) string {
    switch cronType {
    case "backup_db": return "database"
    case "backup_panel": return "panel"
    default: return "site"
    }
}
```

#### `internal/api/v1/cloud_storage.go`
- Thêm route `GET /:id/quota` để lấy Google Drive quota
- Thêm handler `GetGoogleDriveQuota()` trả về limit, usage, available

```go
// Route mới
g.GET("/:id/quota", rbac("backup.read"), h.GetGoogleDriveQuota)

// Handler
func (h *CloudStorageHandler) GetGoogleDriveQuota(c *gin.Context) {
    // Trả về quota info: limit, usage, available (bytes và GB)
}
```

### 3.2. Frontend (React/TypeScript)

#### `web/src/pages/Cron/index.tsx`
- Cập nhật backup templates dùng JSON command format thay vì shell command
- Thêm state `storageQuotas` và `loadingQuotas`
- Thêm `fetchQuota()` để load Google Drive quota khi chọn
- Thêm UI quota display với progress bar

```typescript
// Cron templates - JSON format
{
  name: 'Backup All Databases',
  type: 'backup_db',  // Thay vì 'shell'
  command: '{"all":true,"max_keep":10}',
  cliBackupType: 'database',
},
{
  name: 'Full Panel Backup',
  type: 'backup_panel',  // Type mới
  command: '{"max_keep":4}',
  cliBackupType: 'panel',
},

// UI quota display
{storageType.startsWith('google_drive:') && storageQuotas[storageType] && (
  <div className="quota-display">
    <ProgressBar usage={usage} limit={limit} />
    <span>{formatBytes(available)} available</span>
  </div>
)}
```

#### `web/src/components/GoogleDriveManageModal.tsx`
- Thêm `DriveQuota` interface
- Thêm `quotaData` và `quotaLoading` state
- Thêm `fetchQuota()` function
- Thêm `formatBytes()` helper
- Thêm quota display với progress bar trong storage list

```typescript
// Quota display trong storage card
{authorized && quotaData[s.id] && (
  <div className="quota-box">
    <div>{formatBytes(usage)} / {formatBytes(limit)}</div>
    <ProgressBar percent={usage/limit * 100} />
    <div>{formatBytes(available)} free</div>
  </div>
)}
```

---

## 4. API Endpoints Mới

### `GET /api/v1/cloud-storages/:id/quota`

**Mô tả:** Lấy thông tin storage quota của Google Drive

**Response:**
```json
{
  "code": 200,
  "data": {
    "limit": 16106127360,
    "usage": 5368709120,
    "usage_in_drive": 4294967296,
    "available": 10737418240,
    "limit_gb": 15.0,
    "usage_gb": 5.0,
    "available_gb": 10.0,
    "usage_pct": 33.33
  }
}
```

---

## 5. Cron Types Mới

| Type | Mô tả | CLI Flag |
|---|---|---|
| `backup_site` | Backup website(s) | `-type=site` |
| `backup_db` | Backup database(s) | `-type=database` |
| `backup_panel` | Backup panel config | `-type=panel` |

### JSON Command Format

```json
{
  "all": true,           // Backup all items (optional)
  "target": "example.com", // Specific target (optional)
  "max_keep": 5,         // Retention count (optional)
  "strategy": "incremental" // full or incremental (optional)
}
```

---

## 6. UI Improvements

### 6.1. Google Drive Storage Page
- Hiển thị **quota usage** với progress bar
- Hiển thị **available space** 
- Màu đỏ khi available < 10%

### 6.2. Cron Job Creation
- Chọn **Google Drive storage** trong dropdown
- Hiển thị **quota info** khi chọn Google Drive
- Progress bar với usage/limit

---

## 7. Tiêu Chí Acceptance

| # | Mô tả | Trạng thái |
|---|---|---|
| AC-1 | Upload file không block HTTP request > 5s | ✅ Async upload đã có |
| AC-2 | Progress cập nhật real-time | ✅ backup_uploads table đã có |
| AC-3 | Upload fail không để lại file lỗi trên Drive | ✅ Resumable upload đã có |
| AC-4 | Resume upload sau khi process restart | ✅ resumePending() đã có |
| AC-5 | Token expired → notification | ✅ ValidateGoogleDriveToken() đã có |
| AC-6 | Folder structure đúng | ✅ `itdlupanel_backup/{type}/{file}` đã có |
| AC-7 | Retention auto-enforce | ✅ EnforceRetention() đã có |
| AC-8 | Cron backup_panel type | ✅ **Đã implement** |
| AC-9 | Quota API endpoint | ✅ **Đã implement** |
| AC-10 | Quota display in UI | ✅ **Đã implement** |

---

## 8. Không Cần Làm (Đã Có Sẵn)

1. ✅ **Async Upload Service** - Worker pool với progress tracking
2. ✅ **Resumable Upload** - Google Drive API v3 resumable
3. ✅ **Device Authorization Flow** - UI hoàn chỉnh
4. ✅ **Incremental Backup** - rsync + hardlinks
5. ✅ **Backup Encryption** - AES-256-GCM
6. ✅ **Multi-compression** - gzip/bzip2/zstd

---

## 9. Tổng Kết

**Đã implement:**
1. ✅ `backup_panel` cron type mới
2. ✅ Quota API endpoint cho Google Drive
3. ✅ JSON command format cho backup cron templates
4. ✅ Quota display trong Google Drive connections UI
5. ✅ Quota display trong Cron storage picker

**Còn lại (đã có sẵn):**
- Async upload với progress tracking
- Resumable upload cho Google Drive
- Device Authorization Flow
- Incremental backup
- Encryption at rest

Hệ thống Google Drive backup đã hoàn chỉnh và sẵn sàng sử dụng.
