# Hướng dẫn kết nối Cloud Storage / Cloud Storage Connection Guide

Hướng dẫn chi tiết cách kết nối **Google Drive**, **OneDrive** và **Amazon S3** với ITDLUPanel để sao lưu dữ liệu tự động.

---

## Mục lục

1. [Amazon S3 / S3-Compatible](#1-amazon-s3--s3-compatible)
2. [Google Drive](#2-google-drive)
3. [OneDrive](#3-onedrive)
4. [Sử dụng Storage cho Backup](#4-sử-dụng-storage-cho-backup)
5. [Xử lý lỗi thường gặp](#5-xử-lý-lỗi-thường-gặp)

---

## 1. Amazon S3 / S3-Compatible

Amazon S3 là dịch vụ lưu trữ đối tượng (object storage). ITDLUPanel cũng hỗ trợ các dịch vụ tương thích S3 như **MinIO**, **Wasabi**, **DigitalOcean Spaces**, **Backblaze B2**, **Cloudflare R2**.

### 1.1. Tạo Access Key trên AWS

1. Đăng nhập [AWS Console](https://console.aws.amazon.com/)
2. Vào **IAM** → **Users** → Chọn user hoặc tạo mới
3. Tab **Security credentials** → **Create access key**
4. Chọn use case **Third-party service** → **Create**
5. Lưu lại **Access Key ID** và **Secret Access Key** (chỉ hiển thị 1 lần)

> **Gợi ý bảo mật:** Tạo user IAM riêng cho backup với chỉ quyền S3. Sử dụng policy:
> ```json
> {
>   "Version": "2012-10-17",
>   "Statement": [{
>     "Effect": "Allow",
>     "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:ListBucket"],
>     "Resource": [
>       "arn:aws:s3:::your-bucket-name",
>       "arn:aws:s3:::your-bucket-name/*"
>     ]
>   }]
> }
> ```

### 1.2. Tạo S3 Bucket

1. Vào **S3** → **Create bucket**
2. Đặt tên bucket (vd: `itdlupanel-backups`)
3. Chọn **Region** (vd: `ap-southeast-1` cho Singapore)
4. Nhấn **Create bucket**

### 1.3. Cấu hình trong ITDLUPanel

Vào **Storage** → Card **Amazon S3** → **Install** (nếu chưa cài) → **Manage** → **Add Connection**

| Trường | Mô tả | Ví dụ |
|--------|--------|-------|
| **Storage Name** | Tên hiển thị | `AWS Backups` |
| **Endpoint** | Địa chỉ S3 endpoint | `s3.amazonaws.com` |
| **Region** | Vùng AWS | `ap-southeast-1` |
| **Bucket** | Tên bucket đã tạo | `itdlupanel-backups` |
| **Access Key** | Access Key ID | `AKIAIOSFODNN7EXAMPLE` |
| **Secret Key** | Secret Access Key | `wJalrXUtnFEMI/K7MDENG/...` |
| **Path Prefix** | Thư mục con trong bucket (tùy chọn) | `backups/` |
| **Use SSL** | Bật HTTPS (khuyến nghị bật) | ✅ |

### 1.4. Cấu hình cho dịch vụ S3-compatible

| Dịch vụ | Endpoint | Region |
|---------|----------|--------|
| **DigitalOcean Spaces** | `sgp1.digitaloceanspaces.com` | `sgp1` |
| **MinIO (self-hosted)** | `minio.yourdomain.com:9000` | `us-east-1` |
| **Wasabi** | `s3.ap-southeast-1.wasabisys.com` | `ap-southeast-1` |
| **Backblaze B2** | `s3.us-west-004.backblazeb2.com` | `us-west-004` |
| **Cloudflare R2** | `<account_id>.r2.cloudflarestorage.com` | `auto` |

### 1.5. Kiểm tra kết nối

Nhấn **Test Connection** trong modal cấu hình. Nếu thành công sẽ hiện thông báo xanh ✅.

---

## 2. Google Drive

Sử dụng Google Drive để lưu trữ backup thông qua OAuth 2.0.

### 2.1. Tạo OAuth Credentials trên Google Cloud

1. Truy cập [Google Cloud Console](https://console.cloud.google.com/)
2. Tạo project mới hoặc chọn project có sẵn
3. Vào **APIs & Services** → **Library**
4. Tìm và bật **Google Drive API**
5. Vào **APIs & Services** → **Credentials**
6. Nhấn **Create Credentials** → **OAuth client ID**
7. Nếu chưa cấu hình **OAuth consent screen**:
   - Chọn **External** → **Create**
   - Điền **App name** (vd: `ITDLUPanel Backup`)
   - Điền **User support email** và **Developer contact email**
   - Nhấn **Save and Continue** qua các bước còn lại
8. Quay lại **Create Credentials** → **OAuth client ID**:
   - **Application type**: `Web application`
   - **Name**: `ITDLUPanel`
   - **Authorized redirect URIs**: thêm URL callback của panel:
     ```
     https://your-panel-domain:8888/api/v1/cloud-storages/oauth/callback
     ```
   - Nhấn **Create**
9. Lưu lại **Client ID** và **Client Secret**

> **Lưu ý quan trọng:**
> - Redirect URI phải **chính xác** khớp với domain panel của bạn
> - Nếu panel chạy trên port khác 443, phải bao gồm port trong URI
> - App ở trạng thái **Testing** chỉ cho phép các tài khoản test đã thêm. Publish app nếu cần dùng tài khoản khác

### 2.2. Cấu hình trong ITDLUPanel

Vào **Storage** → Card **Google Drive** → **Install** → **Manage** → **Add Connection**

| Trường | Mô tả | Ví dụ |
|--------|--------|-------|
| **Storage Name** | Tên hiển thị | `Google Drive Backup` |
| **Client ID** | OAuth Client ID | `xxxx.apps.googleusercontent.com` |
| **Client Secret** | OAuth Client Secret | `GOCSPX-xxxx` |
| **Folder ID** | ID thư mục đích (tùy chọn) | `1a2b3c4d5e6f` |

> **Cách lấy Folder ID:** Mở thư mục trên Google Drive trong trình duyệt. Folder ID là phần cuối URL:
> `https://drive.google.com/drive/folders/`**`1a2b3c4d5e6f`**
>
> Để trống Folder ID sẽ lưu vào thư mục gốc (My Drive).

### 2.3. Authorize (Ủy quyền)

Sau khi tạo connection:

1. Nhấn nút **Authorize** trên connection vừa tạo
2. Trình duyệt mở trang đăng nhập Google
3. Chọn tài khoản Google và **cho phép** quyền truy cập
4. Tự động quay về panel với thông báo thành công
5. Nhấn **Test Connection** để xác nhận

> **Quyền yêu cầu:** `drive.file` — chỉ truy cập các file do ứng dụng tạo ra, không đọc được file khác trên Drive.

---

## 3. OneDrive

Sử dụng Microsoft OneDrive để lưu trữ backup thông qua OAuth 2.0 và Microsoft Graph API.

### 3.1. Đăng ký App trên Azure Portal

1. Truy cập [Azure Portal - App registrations](https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)
2. Nhấn **New registration**
3. Điền thông tin:
   - **Name**: `ITDLUPanel Backup`
   - **Supported account types**: `Accounts in any organizational directory and personal Microsoft accounts`
   - **Redirect URI**:
     - Platform: `Web`
     - URI: `https://your-panel-domain:8888/api/v1/cloud-storages/oauth/callback`
4. Nhấn **Register**
5. Lưu lại **Application (client) ID** trên trang Overview

### 3.2. Tạo Client Secret

1. Trong app vừa tạo → **Certificates & secrets**
2. Nhấn **New client secret**
3. Đặt **Description** (vd: `ITDLUPanel`) và chọn **thời hạn** (khuyến nghị 24 months)
4. Nhấn **Add**
5. **Lưu ngay** giá trị **Value** (chỉ hiển thị 1 lần) — đây là Client Secret

> ⚠️ **Quan trọng:** Khi Client Secret hết hạn, bạn cần tạo secret mới và cập nhật trong panel.

### 3.3. Cấu hình API Permissions

1. Vào **API permissions** → **Add a permission**
2. Chọn **Microsoft Graph** → **Delegated permissions**
3. Tìm và thêm:
   - `Files.ReadWrite.All`
   - `offline_access` (để có refresh token)
4. Nhấn **Add permissions**
5. (Tùy chọn) Nhấn **Grant admin consent** nếu bạn là admin

### 3.4. Cấu hình trong ITDLUPanel

Vào **Storage** → Card **OneDrive** → **Install** → **Manage** → **Add Connection**

| Trường | Mô tả | Ví dụ |
|--------|--------|-------|
| **Storage Name** | Tên hiển thị | `OneDrive Backup` |
| **Client ID** | Application (client) ID | `a1b2c3d4-e5f6-...` |
| **Client Secret** | Secret value | `abc123~xxxx` |
| **Folder Path** | Đường dẫn thư mục (tùy chọn) | `/backups` |

> **Folder Path:** Mặc định là `/backups`. Panel sẽ tự tạo thư mục nếu chưa tồn tại.

### 3.5. Authorize (Ủy quyền)

Sau khi tạo connection:

1. Nhấn nút **Authorize** trên connection vừa tạo
2. Trình duyệt mở trang đăng nhập Microsoft
3. Đăng nhập và nhấn **Accept** để cấp quyền
4. Tự động quay về panel với thông báo thành công
5. Nhấn **Test Connection** để xác nhận

---

## 4. Sử dụng Storage cho Backup

Sau khi kết nối storage thành công, bạn có thể sử dụng cho backup tự động:

### 4.1. Backup thủ công

1. Vào **Websites** → chọn site → **Backup** → **Create Backup**
2. Hoặc vào **Databases** → chọn DB → **Backup**
3. Chọn **Remote Storage** (S3/Google Drive/OneDrive)
4. File backup sẽ lưu local + upload lên cloud

### 4.2. Backup tự động (Cron Job)

1. Vào **Cron Jobs** → **Create**
2. Chọn loại:
   - **Backup Website** — sao lưu toàn bộ site
   - **Backup Database** — sao lưu database
3. Trong phần **Remote Storage**, chọn storage đã cấu hình
4. Đặt lịch chạy (vd: mỗi ngày lúc 2:00 AM)
5. Đặt **Max Backups** để tự động xóa bản cũ

### 4.3. Default Storage

Bật **Set as Default** khi tạo connection để tự động sử dụng storage đó cho các backup mới. Mỗi loại storage (S3, Google Drive, OneDrive) chỉ có 1 default.

---

## 5. Xử lý lỗi thường gặp

### Amazon S3

| Lỗi | Nguyên nhân | Giải pháp |
|-----|-------------|-----------|
| `Access Denied` | Sai Access Key hoặc thiếu quyền | Kiểm tra IAM policy có đủ quyền S3 |
| `NoSuchBucket` | Bucket chưa tồn tại | Tạo bucket trên AWS Console |
| `SignatureDoesNotMatch` | Sai Secret Key | Tạo lại Access Key |
| `Connection timeout` | Sai endpoint/region | Kiểm tra endpoint và region |

### Google Drive

| Lỗi | Nguyên nhân | Giải pháp |
|-----|-------------|-----------|
| `redirect_uri_mismatch` | URI callback không khớp | Kiểm tra Redirect URI trong Google Console khớp chính xác với URL panel |
| `access_denied` | User từ chối quyền | Authorize lại và nhấn Allow |
| `invalid_client` | Sai Client ID/Secret | Kiểm tra lại credentials |
| Token hết hạn | Refresh token bị thu hồi | Authorize lại |

### OneDrive

| Lỗi | Nguyên nhân | Giải pháp |
|-----|-------------|-----------|
| `AADSTS700016` | Sai Client ID | Kiểm tra Application ID trong Azure Portal |
| `AADSTS7000215` | Sai Client Secret | Tạo secret mới (secret cũ có thể hết hạn) |
| `redirect_uri_mismatch` | URI callback không khớp | Kiểm tra Redirect URI trong Azure Portal |
| `insufficient_scope` | Thiếu permissions | Thêm `Files.ReadWrite.All` và `offline_access` |

---

## Tóm tắt nhanh

| Storage | Ưu điểm | Dung lượng miễn phí |
|---------|---------|---------------------|
| **Amazon S3** | Tốc độ cao, S3-compatible ecosystem | 5 GB (12 tháng đầu) |
| **Google Drive** | Dễ dùng, phổ biến | 15 GB |
| **OneDrive** | Tích hợp Microsoft 365 | 5 GB |

> 💡 **Khuyến nghị:** Sử dụng Amazon S3 hoặc S3-compatible (Cloudflare R2 miễn phí 10GB/tháng) cho production. Google Drive/OneDrive phù hợp cho các panel nhỏ hoặc dùng thử.
