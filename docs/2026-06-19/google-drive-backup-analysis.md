# Phân tích & đề xuất rewrite Google Drive backup cho ITDLUPanel

> Ngày: 2026-06-19 — so sánh cách **aaPanel** backup lên Google Drive (theo bài viết trên vietnix.vn) với cách hiện tại của ITDLUPanel, sau đó đề xuất phương án rewrite.

---

## 1. Cách aaPanel backup lên Google Drive (theo Vietnix)

Dựa trên bài viết và các nguồn aaPanel docs (AZDIGI, Rumahweb, Domainesia, Jagoan Hosting), luồng chuẩn của aaPanel gồm 4 bước tách biệt:

### 1.1. Cài plugin Google Drive từ App Store
- aaPanel phân phối plugin như 1 **package độc lập**, không phải code trong lõi panel.
- Plugin nằm ở App Store, người dùng bấm **Install** → plugin tự đăng ký handler, lưu marker `/server/google_drive/.installed` (tương tự `installer/google_drive.go` hiện tại của panel này).
- Lý do tách plugin: cho phép bật/tắt storage backend, cập nhật OAuth client riêng, dễ maintain.

### 1.2. Cấu hình Google Drive trong plugin
- Người dùng nhập **Client ID + Client Secret** (OAuth2 do Google cấp).
- Plugin generate **authorization URL** với scope `drive.file`.
- Mở tab mới → user đăng nhập Google → Allow → Google redirect về `redirect_uri` của panel kèm `code`.
- aaPanel **catch code** từ URL của trang redirect, **lưu access_token + refresh_token** vào DB, set `is_active=1`.

### 1.3. Tạo Cron Job kiểu "Backup Site / Backup Database"
- Vào menu **Cron** → **Add Task**:
  - **Type of Task**: `Backup Site` | `Backup Database` | `Backup Directory` | `Shell Script` …
  - **Backup to**: dropdown gồm `Local Disk` | `FTP Storage` | `Google Drive` | `Google Cloud Storage` | `AWS S3`.
  - **Keep Last N**: số bản giữ lại, vượt quá tự xoá.
  - **Keep Local Backup**: tuỳ chọn giữ thêm ở server.
- Cron chạy theo lịch (Daily / N Days / Hourly / N Hours / N Minutes / Weekly / Monthly / N Second).
- Mỗi lần chạy, plugin tạo file `.tar.gz` (site) hoặc `.sql.gz` (DB) ở local **trước**, sau đó mới upload lên cloud.

### 1.4. Thực thi + verify
- Bấm **Execute** trên cron để chạy tay 1 lần.
- Mở Google Drive web → thấy file ở folder `Backup/...` với tên `Backup-2026-06-19-0210.tar.gz`.
- aaPanel cũng lưu log execution để debug.

### Đặc điểm cốt lõi của aaPanel
1. **Backup là 1 phần của Cron**, không phải 1 module riêng → tận dụng scheduler đã có, không phải quản lý state.
2. **"Backup to" là 1 trường trong cron**, không phải parameter của API `POST /backups` → đơn giản hoá form.
3. **Cloud storage là 1 "feature" cắm vào**, không phải dependency cứng → nếu Google Drive lỗi, cron vẫn chạy local.
4. **OAuth scope `drive.file`**: chỉ truy cập file do app tạo → an toàn, không cần verify app.
5. **Folder structure trên Drive** thường là `panel_backup/{type}/{domain}_{timestamp}.tar.gz`.

---

## 2. Hiện trạng ITDLUPanel (đã có sẵn)

Đã có phần lớn hạ tầng, nhưng thiết kế hơi khác aaPanel:

### 2.1. Thành phần đã có

| Thành phần | File | Trạng thái |
|---|---|---|
| Backup service core (site/db/panel) | `internal/service/backup_service.go` | ✅ Hoàn chỉnh, dùng `tar` + `mysqldump` |
| Cloud storage service (S3/Google Drive/OneDrive) | `internal/service/cloud_storage_service.go` | ✅ OAuth + upload/download/delete qua REST API |
| Google Drive installer (marker plugin) | `internal/service/installer/google_drive.go` | ✅ Có marker `.installed` |
| Cloud storage CRUD API | `internal/api/v1/cloud_storage.go` | ✅ List/Create/Update/Delete/Test |
| OAuth flow (auth-url + callback) | `cloud_storage_service.go:470-510` | ✅ Đầy đủ |
| Backup → cloud upload | `backup_service.go:581-612` | ✅ `UploadBackupToCloud` |
| Cron task (type=backup_*) | `internal/service/cron_service.go` (chưa đọc) | ? |
| Backup API | `internal/api/v1/backup.go` | ✅ List/Get/Create/Delete/Restore/Download |
| Frontend Storage management | (chưa tìm thấy) | ? |

### 2.2. Đã kiểm tra
- **OAuth2 flow chuẩn**: dùng `golang.org/x/oauth2/google`, scope `drive.file`, có lưu `access_token` + `refresh_token` + `expiry`.
- **Folder path resolution**: `ensureGoogleDriveFolder` tự tạo nested folder theo `itdlupanel_backup/{type}/{file}`.
- **Multipart upload**: chuẩn Drive API v3, `uploadType=multipart` với metadata + file.
- **Token refresh**: `oauthCfg.Client(ctx, token)` tự động refresh khi `Expiry` qua.
- **Cron** đã có sẵn từ trước, gần như chắc chắn đã wire vào backup.

### 2.3. Điểm KHÁC biệt với aaPanel

| Khía cạnh | aaPanel | ITDLUPanel hiện tại |
|---|---|---|
| Cấu hình Backup-to | Trường trong cron task | Parameter trong API `POST /backups` body |
| Lưu trữ cloud config | Trong plugin marker | Bảng `cloud_storages` chung cho S3/GD/OD |
| Backup & upload | 1 cron gọi 2 bước (local → cloud) | Cùng pattern nhưng tách thành 2 function `CreateXxx` + `UploadBackupToCloud` |
| Upload blocking | Tùy cron (sync) | Sync trong request `POST /backups` → API block 5+ phút nếu file lớn |
| Retention | "Keep Last N" trong cron | `EnforceRetention` riêng, cần cron gọi |
| Restore từ cloud | Download tự động | Có, `Restore()` đã tự download từ cloud nếu local missing |
| Default storage | 1 mỗi loại | Có (`is_default`), nhưng cần chọn thủ công khi backup |
| Folder structure | Tự do | `itdlupanel_backup/{type}/{file}` cứng trong code |

### 2.4. Vấn đề / Gap hiện tại

Sau khi đọc code, tôi thấy các vấn đề sau **cần rewrite/fix**:

1. **Upload blocking request**: `Create` handler gọi `UploadBackupToCloud` **synchronously** trong HTTP request. Với file 5GB lên Google Drive (chậm), request treo 5+ phút → timeout. Cần tách thành **background task**.

2. **Không có progress**: User không biết upload tới đâu, bao nhiêu %, lỗi gì. aaPanel có log execution; panel này chỉ log vào server.

3. **Folder name conflict**: `ensureGoogleDriveFolder` tìm folder theo **tên** đầu tiên trong parent. Nếu user có sẵn folder `itdlupanel_backup` (case khác, vd `ITDLUPanel_Backup`) → tạo thêm folder mới. Cần xử lý case-insensitive hoặc dùng ID cứng.

4. **`remoteBackupPath` không dedupe**: Mỗi lần backup = 1 file ở Drive root. Nếu cùng `site_domain_timestamp.tar.gz` chạy 2 lần (vd manual + cron overlap) → 2 file. aaPanel có option `Keep Last N` để xoá bản cũ.

5. **Resume upload**: Không có. Nếu upload 4.8/5GB bị ngắt → phải upload lại từ đầu. Google Drive API hỗ trợ **resumable upload** (chunked).

6. **Không kiểm tra quota Google Drive**: User có thể hết 15GB → upload fail lặng lẽ.

7. **Không có Cron-Storage integration test**: Chưa thấy evidence `cron_service` thực sự gọi `backup_service` với storage.

8. **Token expiry check lỏng**: `TestGoogleDrive` chỉ check có token, không check `Expiry`. Nếu refresh_token bị thu hồi bởi Google → upload sẽ fail mà không có message rõ ràng.

9. **Charset issue**: `findGoogleDriveFile` query với `name='filename'` — nếu filename có ký tự Unicode (vd `mysite_việtnam_2026.tar.gz`) thì query có thể không match đúng.

10. **No multi-account**: 1 cloud_storage row = 1 Google account. Nếu user muốn backup site1 lên accountA, site2 lên accountB → phải tạo 2 row với 2 OAuth flow riêng. aaPanel cũng vậy, nhưng UI không support rõ.

11. **Cron "Backup to" dropdown** — nếu frontend chưa có thì đây là work cần làm.

---

## 3. Phương án rewrite — đề xuất

Tôi đề xuất **rewrite theo hướng aaPanel-inspired** nhưng vẫn giữ thế mạnh đã có của panel (multi-storage, OAuth chuẩn, retention API). Ưu tiên theo impact:

### Phase 1 — Fix gap nghiêm trọng (1-2 ngày)

#### 1.1. Async upload + progress tracking
- Tạo `backup_uploads` table:
  ```sql
  CREATE TABLE backup_uploads (
    id INTEGER PRIMARY KEY,
    backup_id INTEGER NOT NULL,
    storage_id INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',  -- pending, uploading, completed, failed
    bytes_uploaded INTEGER DEFAULT 0,
    bytes_total INTEGER DEFAULT 0,
    error_message TEXT,
    started_at DATETIME,
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  ```
- Tách `UploadBackupToCloud` thành:
  - `StartBackupUpload(backupID, storageID)` → tạo row `pending`, enqueue goroutine
  - `RunBackupUpload(uploadID)` → background, update progress mỗi 5s
- API:
  - `POST /api/v1/backups/{id}/upload` (bắt đầu async, trả upload_id)
  - `GET /api/v1/backups/{id}/upload-status` (poll progress)
- Frontend: Modal upload với **progress bar real-time**.

#### 1.2. Resumable upload cho Google Drive
Thay multipart single-shot bằng **resumable upload**:
```
1. POST /upload/drive/v3/files?uploadType=resumable
   Body: { name, parents }
   → Trả về session URI trong header `Location`
2. PUT {session_uri}
   Body: binary chunk (≤ 256 MB mỗi chunk)
   Header: Content-Range: bytes 0-{N}/{total}
   → Nếu 308 RESUME INCOMPLETE, continue
   → Nếu 200/201, done
```
- Lưu `session_uri` vào `backup_uploads`.
- Nếu process crash mid-upload, lần sau resume từ `bytes_uploaded`.

#### 1.3. Folder name conflict fix
- Option A (đơn giản): Save `folder_id` thẳng vào config lần đầu tạo → reuse. (Hiện đã có `FolderID` trong config).
- Option B (an toàn hơn): Dùng Google Drive API `create` với `parents` explicit, fail nếu parent ID không tồn tại.
- Đề xuất: **đã có sẵn `cfg.FolderID`**, chỉ cần tăng độ tin cậy của `ensureGoogleDriveFolder` bằng cách ưu tiên ID đã biết.

#### 1.4. Refresh token health check
- Thêm method `ValidateGoogleToken(storageID) error`:
  - Test refresh token bằng cách gọi `about.get` với refresh.
  - Nếu fail → set `is_active=0`, gửi notification "Google Drive cần authorize lại".
- Cron check token trước khi chạy backup → skip nếu invalid.

### Phase 2 — Cải thiện UX (2-3 ngày)

#### 2.1. UI "Backup to" trong Cron
Nếu chưa có, thêm vào trang Cron:
- Field **Storage** (multi-select hoặc single dropdown)
- Field **Keep Last N** (number input)
- Field **Keep Local** (checkbox)
- Hiển thị danh sách storage đang `is_active=1` (lọc theo type nếu cần)

#### 2.2. Backup detail page
- Trang `/backups/{id}`:
  - Thông tin file (size, checksum, ngày tạo)
  - Trạng thái upload (nếu có)
  - Actions: Download, Restore, Delete
  - Lịch sử upload (nếu upload lại)

#### 2.3. Storage health dashboard
- Card cho mỗi cloud storage:
  - Status (active/error/expired)
  - Last test connection
  - Total backups stored
  - Quota Google Drive (cần API `about.get` với `fields=storageQuota`)

### Phase 3 — Mở rộng (1 tuần+)

#### 3.1. Incremental / differential backup
- Hiện tại: full `.tar.gz` mỗi lần.
- Cải tiến: dùng `rsync --link-dest` để backup incremental, chỉ lưu diff.

#### 3.2. Compression options
- Tuỳ chọn: `gzip`, `bzip2`, `zstd`, `none` (cho file đã nén).
- Mặc định: `gzip` (tương thích rộng).

#### 3.3. Encryption at rest
- Tuỳ chọn mã hoá file bằng AES-256 trước khi upload.
- Key lưu trong panel config (hoặc yêu cầu user nhập passphrase mỗi lần).

#### 3.4. Auto-restore testing
- Cron job định kỳ download 1 backup mới nhất → verify checksum → restore vào thư mục test → so sánh.

---

## 4. Cụ thể các file cần sửa (Phase 1)

### 4.1. Database migration mới
```sql
-- File: migrations/2026-06-19-001-backup-uploads.sql
CREATE TABLE IF NOT EXISTS backup_uploads (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    backup_id       INTEGER NOT NULL,
    storage_id      INTEGER NOT NULL,
    storage_type    TEXT    NOT NULL,         -- 'google_drive', 's3', 'onedrive'
    status          TEXT    NOT NULL DEFAULT 'pending',  -- pending, uploading, completed, failed
    bytes_uploaded  INTEGER NOT NULL DEFAULT 0,
    bytes_total     INTEGER NOT NULL DEFAULT 0,
    progress_pct    REAL    NOT NULL DEFAULT 0,          -- denormalized for fast query
    error_message   TEXT,
    remote_url      TEXT,                                -- session_uri for resumable
    started_at      DATETIME,
    completed_at    DATETIME,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (backup_id) REFERENCES backups(id) ON DELETE CASCADE,
    FOREIGN KEY (storage_id) REFERENCES cloud_storages(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_backup_uploads_backup ON backup_uploads(backup_id);
CREATE INDEX IF NOT EXISTS idx_backup_uploads_status ON backup_uploads(status);
```

### 4.2. Service layer
**File mới: `internal/service/backup_upload_service.go`**
```go
type BackupUpload struct {
    ID            int64
    BackupID      int64
    StorageID     int64
    StorageType   string
    Status        string
    BytesUploaded int64
    BytesTotal    int64
    ProgressPct   float64
    ErrorMessage  string
    RemoteURL     string
    StartedAt     *time.Time
    CompletedAt   *time.Time
}

type BackupUploadService struct {
    db                  *sql.DB
    cloudStorageService *CloudStorageService
    notifier            *NotificationService
    workQueue           chan int64  // upload IDs to process
    workerCount         int
}

func (s *BackupUploadService) StartUpload(backupID, storageID int64) (*BackupUpload, error)
func (s *BackupUploadService) GetStatus(uploadID int64) (*BackupUpload, error)
func (s *BackupUploadService) GetByBackup(backupID int64) ([]*BackupUpload, error)
func (s *BackupUploadService) worker() // background loop
```

**Sửa `cloud_storage_service.go`:**
- `UploadGoogleDrive` → thêm variant với **progress callback**:
  ```go
  type UploadProgress func(bytesUploaded, bytesTotal int64)
  func (s *CloudStorageService) UploadGoogleDriveWithProgress(
      storageID int64, localPath, remoteFileName, redirectURL string,
      progress UploadProgress,
  ) error
  ```
- Triển khai resumable upload với chunked PUT.

**Sửa `backup_service.go`:**
- `UploadBackupToCloud` → chuyển thành:
  ```go
  func (s *BackupService) StartCloudUpload(backupID, storageID int64) (*BackupUpload, error)
  ```
  Enqueue job, trả về upload_id ngay.
- Loại bỏ logic upload sync khỏi `Create` handler.

### 4.3. API layer
**Sửa `internal/api/v1/backup.go`:**
```go
backups.POST("/:id/upload", rbac("backup.create"), h.StartUpload)
backups.GET("/:id/uploads", rbac("backup.read"), h.ListUploads)
backups.GET("/uploads/:upload_id", rbac("backup.read"), h.GetUploadStatus)
backups.DELETE("/uploads/:upload_id", rbac("backup.delete"), h.CancelUpload)  // bonus
```

Response example:
```json
GET /api/v1/backups/42/uploads
{
  "code": 200,
  "data": [
    {
      "id": 7,
      "backup_id": 42,
      "storage_id": 1,
      "storage_type": "google_drive",
      "status": "uploading",
      "bytes_uploaded": 4194304,
      "bytes_total": 10485760,
      "progress_pct": 40.0,
      "started_at": "2026-06-19T09:30:00Z"
    }
  ]
}
```

### 4.4. Frontend
**Sửa `web/src/pages/Backup/*` (nếu chưa có) hoặc tạo mới:**
- Component `<UploadProgress>` với polling mỗi 2s
- Modal upload với progress bar, nút Cancel
- Notification khi upload hoàn tất (qua WebSocket task events)

### 4.5. Cron integration
Nếu `cron_service` chưa wire vào `backupService.StartCloudUpload`:
- Thêm parameter `storage_id` vào cron task type `backup_*`
- Khi cron fire → `backupService.CreateXxxBackup()` → `backupService.StartCloudUpload()` (async)
- Tự động `EnforceRetention()` sau khi upload xong

---

## 5. Tiêu chí acceptance (Phase 1)

| ID | Mô tả | Test |
|---|---|---|
| AC-1 | Upload file 100MB lên Google Drive không block HTTP request > 5s | Tạo backup qua API, response trong < 5s, file vẫn được upload |
| AC-2 | Progress cập nhật real-time | Poll `/backups/{id}/uploads` thấy `progress_pct` tăng dần |
| AC-3 | Upload fail không để lại file lỗi trên Drive | Stop server mid-upload → file Drive không tồn tại hoặc size 0 |
| AC-4 | Resume upload sau khi process restart | Kill process ở 50%, restart → tiếp tục từ 50% |
| AC-5 | Token expired → notification | Refresh token revoke → backup fail với error rõ ràng + notification |
| AC-6 | Folder structure đúng | `itdlupanel_backup/site/{domain}_{ts}.tar.gz` |
| AC-7 | Retention auto-enforce | Tạo 5 backup với Keep Last 3 → chỉ còn 3 mới nhất |

---

## 6. Không nên làm (out of scope)

1. **Tự host OAuth server** — phụ thuộc Google, không có lý do tự host.
2. **Service account thay user account** — phức tạp hơn nhiều, cần Google Workspace admin. Đa số user nhỏ dùng personal account.
3. **Streaming encryption** — chưa cần, Phase 3.
4. **Multi-region replication** — Phase 3+.
5. **Deduplication** — Google Drive API không support, cần build cross-file dedup. Phase 3+.

---

## 7. Tổng kết

ITDLUPanel đã có **hạ tầng khá tốt** (OAuth chuẩn, cloud storage CRUD, backup core). Điểm cần rewrite nằm ở **UX và reliability**:
- Upload sync trong HTTP request → chuyển async + resumable.
- Progress tracking → thêm `backup_uploads` table + polling API.
- Cron integration → wire `storage_id` vào cron task.
- Token health check → proactive notification khi refresh token expire.

Phương án trên **không phá vỡ kiến trúc hiện tại**, chỉ thêm 1 bảng mới + 1 service mới + sửa handler để enqueue thay vì block.

Có thể làm theo từng phase để giảm risk, mỗi phase đều có AC rõ ràng để verify.
