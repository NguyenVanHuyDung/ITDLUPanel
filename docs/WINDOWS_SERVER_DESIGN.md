# ITDLUPanel — Thiết kế trên Windows Server

> **Phiên bản tài liệu:** 1.0 · **Ngày:** 2026-05-03  
> **Tác giả:** ITDLUPanel Team — Đại học Đà Lạt  
> **Phạm vi:** Thiết kế kiến trúc và lộ trình chuyển đổi từ Linux sang Windows Server

---

## Mục lục

1. [Tổng quan](#1-tổng-quan)
2. [Phân tích hiện trạng](#2-phân-tích-hiện-trạng)
3. [Bảng ánh xạ Linux → Windows](#3-bảng-ánh-xạ-linux--windows)
4. [Kiến trúc đề xuất](#4-kiến-trúc-đề-xuất)
5. [Thiết kế từng module](#5-thiết-kế-từng-module)
6. [Lớp trừu tượng hệ điều hành (OS Abstraction Layer)](#6-lớp-trừu-tượng-hệ-điều-hành-os-abstraction-layer)
7. [Backend — Các thay đổi kỹ thuật](#7-backend--các-thay-đổi-kỹ-thuật)
8. [Frontend — Không thay đổi](#8-frontend--không-thay-đổi)
9. [Bảo mật và phân quyền](#9-bảo-mật-và-phân-quyền)
10. [Cài đặt và triển khai](#10-cài-đặt-và-triển-khai)
11. [Lộ trình phát triển](#11-lộ-trình-phát-triển)
12. [Rủi ro và giải pháp](#12-rủi-ro-và-giải-pháp)

---

## 1. Tổng quan

### 1.1 Mục tiêu

Thiết kế phiên bản **ITDLUPanel for Windows Server** — giữ nguyên triết lý *single-binary, zero-dependency* của bản Linux nhưng chạy native trên Windows Server 2019/2022. Panel quản lý toàn bộ vòng đời của một web server Windows: website (IIS), PHP, MySQL, Redis, Docker, tường lửa, lịch sử, SSL, terminal PowerShell.

### 1.2 Yêu cầu phiên bản Windows

| Phiên bản | Hỗ trợ | Ghi chú |
|-----------|--------|---------|
| Windows Server 2022 | ✅ Khuyến nghị | IIS 10.0, WinRM, Container |
| Windows Server 2019 | ✅ Đầy đủ | IIS 10.0 |
| Windows Server 2016 | ⚠️ Giới hạn | Không có Docker native |
| Windows 10/11 Pro | 🔧 Dev only | Không dùng production |

### 1.3 Triết lý thiết kế

```
Giữ nguyên:          Thay thế:               Loại bỏ:
─────────────        ──────────────────       ─────────────────
• Go binary          • systemctl → SCM         • /etc/os-release
• React SPA          • nginx → IIS/Caddy       • /proc filesystem
• SQLite             • bash → PowerShell       • apt/dnf/yum
• JWT + RBAC         • iptables → WFW          • certbot → win-acme
• WebSocket          • PTY → ConPTY            • PureFTPd → FileZilla Server
• REST API           • /var/log → Event Log    • fail2ban → IPBan
• Ant Design         • cron → Task Scheduler   • PHP-FPM → PHP FastCGI
```

---

## 2. Phân tích hiện trạng

### 2.1 Các service Linux hiện có

Bản Linux hiện tại gồm **33 service** chia theo mức độ khó port:

| Mức độ | Service | Lý do |
|--------|---------|-------|
| 🟢 **Dễ** (dùng Go stdlib) | `auth_service`, `user_service`, `role_service`, `jwt`, `totp_service`, `notification_service`, `email_service`, `telegram_service`, `backup_service`, `cron_service` | Không phụ thuộc Linux API |
| 🟢 **Dễ** (gopsutil cross-platform) | `monitor_service`, `metrics_collector`, `site_statistics_service` | `gopsutil/v3` hỗ trợ Windows qua WMI |
| 🟡 **Trung bình** | `file_service`, `log_service`, `settings_service`, `ssl_service`, `cloud_storage_service`, `ftp_storage_service`, `docker_service`, `docker_compose_service`, `docker_cleanup_service` | Cần điều chỉnh path và lệnh |
| 🔴 **Khó** (phụ thuộc Linux sâu) | `site_service`, `software_service`, `firewall_service`, `security_service`, `ftp_service`, `terminal_service`, `database_service`, `redis_service`, `installer/*`, `vhost/*`, `ssl_renewer` | Thay thế toàn bộ |

### 2.2 Các điểm phụ thuộc Linux cứng

```
internal/system/os_detect.go     → /etc/os-release, systemctl, apt/dnf
internal/system/shell.go         → /bin/bash -c
internal/service/vhost/nginx.go  → nginx.conf template
internal/service/vhost/apache.go → apache2.conf template
internal/service/terminal_service.go → creack/pty (Linux PTY)
internal/service/firewall_service.go → iptables/ufw/firewalld
internal/service/installer/*    → apt install / systemctl
internal/service/ssl_service.go  → certbot, /etc/letsencrypt
```

---

## 3. Bảng ánh xạ Linux → Windows

### 3.1 Web Server

| Linux | Windows | Ghi chú |
|-------|---------|---------|
| Nginx | **IIS 10** (khuyến nghị) | Windows native, URL Rewrite module, FastCGI |
| Nginx | **Caddy v2** (thay thế) | Cross-platform, HTTPS tự động, Go-based |
| Apache | IIS + ARR | Application Request Routing thay mod_proxy |
| PHP-FPM | **PHP 8.x CGI/FastCGI** cho IIS | PHP for Windows + IIS handler mapping |
| Let's Encrypt / certbot | **win-acme** (WACS) | ACME v2 client cho Windows, CLI + service |
| `/etc/nginx/sites-available/` | `C:\inetpub\wwwroot\` + IIS Sites | Quản lý qua `Microsoft.Web.Administration` .NET API |

### 3.2 Quản lý Service

| Linux | Windows | API/Tool |
|-------|---------|---------|
| `systemctl start nginx` | `Start-Service W3SVC` | `sc.exe` hoặc PowerShell `*-Service` |
| `systemctl enable` | `Set-Service -StartupType Automatic` | SCM (Service Control Manager) |
| `systemctl status` | `Get-Service` / `QueryServiceStatus` | Win32 API `OpenSCManager` |
| `journalctl` | Windows Event Log | `Get-EventLog` / `Get-WinEvent` |
| `apt install nginx` | **Winget / Chocolatey / Scoop** | `winget install Nginx.Nginx` |

**Lựa chọn package manager:** Dùng **Chocolatey** cho production (ổn định hơn, enterprise-ready, offline mirror).

### 3.3 Tường lửa

| Linux | Windows | Ghi chú |
|-------|---------|---------|
| `iptables` / `ufw` | **Windows Firewall (WFW)** | Quản lý qua `netsh advfirewall` hoặc PowerShell `New-NetFirewallRule` |
| `fail2ban` | **IPBan** | Open-source, tự block IP từ Event Log |
| Port monitoring | `netstat -ano` → `Get-NetTCPConnection` | Tương tự, output khác |

### 3.4 Terminal

| Linux | Windows | Thư viện Go |
|-------|---------|---------|
| PTY (`creack/pty`) | **ConPTY** (Windows 10 1903+) | `github.com/UserExistsError/conpty` |
| `/bin/bash` | `pwsh.exe` / `cmd.exe` | Cấu hình trong panel settings |
| bash session | PowerShell session | Encoding UTF-8 cần set |

### 3.5 Giám sát hệ thống

| Metric | Linux | Windows | gopsutil support |
|--------|-------|---------|-----------------|
| CPU | `/proc/stat` | WMI `Win32_PerfRawData_PerfOS_Processor` | ✅ |
| RAM | `/proc/meminfo` | `GlobalMemoryStatusEx` Win32 API | ✅ |
| Disk I/O | `/proc/diskstats` | `Win32_PerfRawData_PerfDisk_PhysicalDisk` | ✅ |
| Network | `/proc/net/dev` | `Win32_PerfRawData_Tcpip_NetworkInterface` | ✅ |
| Process | `/proc/[pid]/` | `OpenProcess` + `EnumProcesses` | ✅ |

> `github.com/shirou/gopsutil/v3` đã hỗ trợ đầy đủ Windows — **không cần thay đổi `monitor_service.go` và `metrics_collector.go`**.

### 3.6 Cơ sở dữ liệu

| Linux | Windows | Ghi chú |
|-------|---------|---------|
| MySQL/MariaDB | MySQL 8.0 for Windows | Installer MSI, cùng port 3306 |
| Redis | **Redis for Windows** (Memurai / Redis Stack) | Memurai = Redis-compatible MSI |
| phpMyAdmin | phpMyAdmin for IIS | PHP FastCGI + IIS |
| Backup (mysqldump) | `mysqldump.exe` | Path thay đổi: `C:\Program Files\MySQL\...` |

### 3.7 Docker

Docker Desktop / Docker Engine đã hỗ trợ Windows Server 2019/2022 qua **Windows Containers** và **Linux Containers (WSL2)**. `docker_service.go` gần như không cần sửa — chỉ thay đổi socket path:

```
Linux:   unix:///var/run/docker.sock
Windows: npipe:////./pipe/docker_engine
```

### 3.8 FTP

| Linux | Windows | Ghi chú |
|-------|---------|---------|
| PureFTPd | **IIS FTP** (built-in) | Quản lý qua `Microsoft.Web.Administration` |
| PureFTPd | **FileZilla Server** | Có REST API, dễ quản lý hơn |

---

## 4. Kiến trúc đề xuất

```
┌─────────────────────────────────────────────────────────────────┐
│                    Browser (React 19 SPA)                        │
│              [KHÔNG THAY ĐỔI — Ant Design 6]                     │
└──────────────────┬─────────────────────┬────────────────────────┘
                   │  REST API (~160)     │  WebSocket (2)
                   ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│              itdlupanel-windows.exe (Single Binary)              │
│                                                                   │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────────┐     │
│  │   Gin    │→ │  24 Handlers │→ │   OS Abstraction Layer  │     │
│  │  Router  │  │  (REST API)  │  │  ┌──────────────────┐   │     │
│  └──────────┘  └──────────────┘  │  │  OSProvider iface │   │     │
│  ┌──────────┐  ┌──────────────┐  │  │  WindowsProvider  │   │     │
│  │    WS    │→ │  ConPTY Term │  │  │  LinuxProvider    │   │     │
│  │   Hub    │  │  Monitor     │  │  └──────────────────┘   │     │
│  └──────────┘  └──────────────┘  └──────┬─────────────────┘     │
│  ┌────────────────────────────┐         │                         │
│  │   Middleware Stack (11)    │         ▼                         │
│  │  JWT·RBAC·Rate·CSRF·Audit  │  ┌────────────────────────┐     │
│  └────────────────────────────┘  │   SQLite (25 tables)    │     │
│                                   └────────────────────────┘     │
└──────────────────────────┬────────────────────────────────────── ┘
                           │  PowerShell · SCM · WMI · Win32 API
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Windows Server 2019/2022                       │
│   IIS 10 · PHP FastCGI · MySQL 8 · Redis (Memurai) · Docker      │
│   Windows Firewall · Task Scheduler · Event Log · win-acme        │
│   Chocolatey · FileZilla Server (FTP)                             │
└─────────────────────────────────────────────────────────────────┘
```

### 4.1 Thư mục cài đặt

```
C:\ITDLUPanel\
├── itdlupanel.exe          ← Binary chính (~65MB)
├── config\
│   └── panel.json          ← Cấu hình panel
├── data\
│   └── panel.db            ← SQLite database
├── logs\
│   ├── panel.log
│   └── audit.log
├── server\
│   ├── iis\                ← Site configs (XML)
│   ├── php\                ← PHP configs
│   └── mysql\              ← MySQL configs
├── scripts\
│   ├── install\            ← PowerShell install scripts
│   └── helpers\            ← Utility scripts
└── www\                    ← Web root mặc định
```

---

## 5. Thiết kế từng module

### 5.1 Module Website (Site Service)

**Linux:** Tạo file `.conf` cho nginx/apache → `nginx -s reload`  
**Windows:** Tạo IIS Site qua `Microsoft.Web.Administration` API gọi từ PowerShell

```powershell
# Thay thế cho nginx vhost template
Import-Module WebAdministration

# Tạo site
New-WebSite -Name "example.com" -Port 80 -PhysicalPath "C:\www\example.com" -HostHeader "example.com"

# Thêm HTTPS binding
New-WebBinding -Name "example.com" -Protocol https -Port 443 -HostHeader "example.com" -SslFlags 1

# Cấu hình PHP FastCGI handler
Add-WebConfiguration -Filter "/system.webServer/handlers" -PSPath "IIS:\Sites\example.com" -Value @{
    name="PHP_via_FastCGI"; path="*.php"; verb="*";
    modules="FastCgiModule"; scriptProcessor="C:\PHP\php-cgi.exe"
}
```

**Go wrapper** trong `site_service_windows.go`:
```go
func (s *SiteService) createIISSite(site *model.Site) error {
    script := buildPowerShellScript("create-site.ps1", site)
    _, err := system.ExecPowerShell(ctx, script)
    return err
}
```

**Vhost template thay thế:** Không dùng file `.conf` — dùng PowerShell script generator thay cho `vhost/nginx.go`.

### 5.2 Module Quản lý Service

**Linux:** `systemctl start|stop|restart|status <service>`  
**Windows:** `Get-Service`, `Start-Service`, `Stop-Service`, `Restart-Service`

```go
// internal/system/service_windows.go
func ServiceCommand(action, name string) *exec.Cmd {
    switch action {
    case "start":
        return exec.Command("powershell", "-Command", fmt.Sprintf("Start-Service -Name %q", name))
    case "stop":
        return exec.Command("powershell", "-Command", fmt.Sprintf("Stop-Service -Name %q -Force", name))
    case "restart":
        return exec.Command("powershell", "-Command", fmt.Sprintf("Restart-Service -Name %q -Force", name))
    case "status":
        return exec.Command("powershell", "-Command", fmt.Sprintf("(Get-Service -Name %q).Status", name))
    }
    return nil
}
```

**Tên service Windows:**

| Software | Service Name |
|----------|-------------|
| IIS | `W3SVC` |
| MySQL 8.0 | `MySQL80` |
| Redis (Memurai) | `Memurai` |
| FileZilla Server | `FileZilla Server` |
| PHP (không có service, dùng FastCGI) | — |

### 5.3 Module Terminal

**Linux:** `creack/pty` + `/bin/bash`  
**Windows:** `conpty` + `pwsh.exe` (PowerShell 7)

```go
// internal/service/terminal_service_windows.go
import "github.com/UserExistsError/conpty"

func (s *TerminalService) NewSession(cols, rows int) (*TerminalSession, error) {
    cpty, err := conpty.Start("pwsh.exe",
        conpty.ConPtyDimensions(cols, rows),
    )
    if err != nil {
        return nil, err
    }
    return &TerminalSession{pty: cpty}, nil
}
```

**Lưu ý:** ConPTY yêu cầu Windows 10 Build 1903+ / Windows Server 2019+. PowerShell 7 (`pwsh.exe`) cần cài riêng qua Chocolatey: `choco install powershell-core`.

### 5.4 Module Tường lửa

**Linux:** `iptables` / `ufw` / `firewalld`  
**Windows:** Windows Firewall (WFW) qua PowerShell `NetSecurity` module

```powershell
# Thêm rule cho phép port
New-NetFirewallRule -DisplayName "ITDLUPanel-Port-8888" `
    -Direction Inbound -Protocol TCP -LocalPort 8888 -Action Allow

# Chặn IP
New-NetFirewallRule -DisplayName "Block-192.168.1.100" `
    -Direction Inbound -RemoteAddress 192.168.1.100 -Action Block

# Xóa rule
Remove-NetFirewallRule -DisplayName "ITDLUPanel-Port-8888"

# Liệt kê rules
Get-NetFirewallRule | Where-Object { $_.DisplayName -like "ITDLUPanel-*" }
```

**IPBan** (thay fail2ban): Cài `choco install ipban` — tự đọc Windows Event Log và block IP brute-force.

### 5.5 Module SSL

**Linux:** certbot, `/etc/letsencrypt/`  
**Windows:** **win-acme (WACS)** — ACME v2 client mạnh nhất cho Windows

```
C:\win-acme\
├── wacs.exe
├── settings.json
└── certificates\
    └── example.com\
        ├── example.com-crt.pem
        └── example.com-key.pem
```

```go
// internal/service/ssl_service_windows.go
func (s *SSLService) RequestCert(domain string) error {
    _, err := system.ExecWithTimeout(5*time.Minute,
        `C:\win-acme\wacs.exe`,
        "--target", "manual",
        "--host", domain,
        "--validation", "http-01",
        "--webroot", `C:\inetpub\wwwroot\.well-known\acme-challenge`,
        "--store", "pemfiles",
        "--pemfilespath", fmt.Sprintf(`C:\ITDLUPanel\server\ssl\%s`, domain),
        "--installation", "none",
        "--notaskscheduler",
    )
    return err
}
```

WACS tích hợp với IIS để tự động bind certificate vào HTTPS binding.

### 5.6 Module Cài đặt phần mềm (Installer)

**Linux:** `apt install`, `systemctl enable`  
**Windows:** **Chocolatey** packages

```go
// internal/service/installer/windows/nginx_installer.go
func (i *NginxInstaller) Install() error {
    // Option 1: Nginx for Windows (native port)
    _, err := system.ExecWithTimeout(10*time.Minute,
        "choco", "install", "nginx", "-y", "--no-progress",
    )
    return err
}

// internal/service/installer/windows/iis_installer.go
func (i *IISInstaller) Install() error {
    // Enable IIS Windows Feature
    _, err := system.ExecPowerShell(ctx, `
        Install-WindowsFeature Web-Server, Web-CGI, Web-ISAPI-Ext,
            Web-ISAPI-Filter, Web-Mgmt-Console, Web-Scripting-Tools
    `)
    return err
}
```

**Packages Chocolatey tương ứng:**

| Phần mềm | Linux | Chocolatey Package |
|----------|-------|-------------------|
| Web Server | `apt install nginx` | `choco install nginx` hoặc IIS Feature |
| PHP 8.3 | `apt install php8.3-fpm` | `choco install php --version=8.3.0` |
| MySQL 8.0 | `apt install mysql-server` | `choco install mysql` |
| Redis | `apt install redis` | `choco install memurai` |
| phpMyAdmin | `apt install phpmyadmin` | Tải thủ công + deploy IIS |
| Docker | `apt install docker.io` | `choco install docker-desktop` |
| FileZilla Server | `apt install pure-ftpd` | `choco install filezilla.server` |
| PowerShell 7 | N/A | `choco install powershell-core` |
| win-acme | certbot | `choco install win-acme` |

### 5.7 Module Cron Jobs

**Linux:** crontab, `crontab -e`  
**Windows:** Windows Task Scheduler qua `schtasks.exe` hoặc PowerShell `*-ScheduledTask`

```go
// internal/service/cron_service_windows.go
func (s *CronService) CreateTask(job *model.CronJob) error {
    // Chuyển cron expression sang Task Scheduler trigger
    trigger := cronToScheduledTaskTrigger(job.Schedule)
    script := fmt.Sprintf(`
        $action = New-ScheduledTaskAction -Execute "pwsh.exe" -Argument "-Command '%s'"
        $trigger = %s
        Register-ScheduledTask -TaskName "ITDLUPanel-%s" -Action $action -Trigger $trigger -RunLevel Highest
    `, job.Command, trigger, job.ID)
    _, err := system.ExecPowerShell(ctx, script)
    return err
}
```

**Lưu ý:** Task Scheduler không hỗ trợ toàn bộ cron syntax (ví dụ: `*/5 * * * *` cần xử lý riêng). Cần viết bộ converter `cron → TaskScheduler XML`.

### 5.8 Module Giám sát (Monitor)

`gopsutil/v3` đã hỗ trợ Windows — **không cần thay đổi logic**. Chỉ cần kiểm tra một số metric:

```go
// Chạy được nguyên vẹn trên Windows:
cpu.Percent(time.Second, false)        // ✅ WMI
mem.VirtualMemory()                    // ✅ GlobalMemoryStatusEx
disk.Usage("/")                        // ✅ GetDiskFreeSpaceEx (path: "C:\\")
net.IOCounters(true)                   // ✅ GetIfTable
process.Processes()                    // ✅ EnumProcesses

// Cần thay đổi:
disk.Usage("/")     → disk.Usage("C:\\")   // Path Windows
```

### 5.9 Module File Manager

`file_service.go` dùng `os.*` package của Go — **đa số hoạt động cross-platform**. Cần điều chỉnh:

- Path separator: `/` → `\` (Go `filepath.Join` xử lý tự động)
- Permission: `chmod 755` không có trên Windows → dùng ACL (`icacls.exe`)
- Symlink: cần quyền `SeCreateSymbolicLinkPrivilege`
- Archive: `tar`, `gzip` → Go stdlib `archive/tar`, `compress/gzip` ✅ cross-platform

### 5.10 Module Database (MySQL)

`database_service.go` dùng `mysql` CLI → **thay đổi đường dẫn**:

```go
// Linux
const mysqlBin = "/usr/bin/mysql"
const mysqldumpBin = "/usr/bin/mysqldump"

// Windows
const mysqlBin = `C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe`
const mysqldumpBin = `C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe`
```

Hoặc resolve dynamic từ `%PATH%`.

### 5.11 Module Redis

`redis_service.go` dùng `redis-cli` → thay đổi:

```go
// Linux: /usr/bin/redis-cli
// Windows (Memurai): C:\Program Files\Memurai\memurai-cli.exe
// Hoặc Redis Stack: C:\Program Files\Redis\redis-cli.exe
```

API hoàn toàn tương thích — các lệnh Redis giống nhau.

### 5.12 Module Backup / Cloud Storage

`backup_service.go`, `cloud_storage_service.go`, `ftp_storage_service.go` — **không cần thay đổi**:
- Dùng Go `archive/zip`, `io`, `os` → cross-platform
- MinIO/S3, FTP, Google Drive, OneDrive dùng HTTP/API → cross-platform
- Chỉ cần điều chỉnh backup path: `/home/` → `C:\Users\` hoặc `C:\www\`

---

## 6. Lớp trừu tượng hệ điều hành (OS Abstraction Layer)

Đây là thay đổi kiến trúc quan trọng nhất. Thay vì `#ifdef`-style, dùng **interface + build tags**:

### 6.1 Interface OSProvider

```go
// internal/system/provider.go
package system

type OSProvider interface {
    // Service management
    ServiceAction(action, name string) error
    ServiceStatus(name string) (ServiceStatus, error)
    ServiceEnable(name string) error

    // Package management
    PackageInstall(packages ...string) error
    PackageRemove(packages ...string) error
    PackageIsInstalled(pkg string) bool

    // Shell execution
    Shell(ctx context.Context, script string) (*ExecResult, error)
    ShellFile(ctx context.Context, scriptPath string) (*ExecResult, error)

    // Web server
    ReloadWebServer(server string) error
    WriteVhostConfig(domain, content string) error
    RemoveVhostConfig(domain string) error
    EnableSite(domain string) error
    DisableSite(domain string) error

    // Firewall
    FirewallAllow(port int, proto string) error
    FirewallDeny(port int, proto string) error
    FirewallBlockIP(ip string) error
    FirewallUnblockIP(ip string) error
    FirewallListRules() ([]FirewallRule, error)

    // SSL
    RequestCert(domain, email string) error
    RevokeCert(domain string) error
    RenewCert(domain string) error

    // Terminal
    NewTerminal(cols, rows int) (Terminal, error)

    // Paths
    WebRoot() string
    LogDir() string
    ConfigDir() string
    PanelDataDir() string
}
```

### 6.2 Build tags

```go
// internal/system/provider_linux.go
//go:build linux

func NewOSProvider() OSProvider {
    return &LinuxProvider{}
}

// internal/system/provider_windows.go
//go:build windows

func NewOSProvider() OSProvider {
    return &WindowsProvider{}
}
```

### 6.3 Sử dụng trong service

```go
// internal/service/site_service.go — không đổi
type SiteService struct {
    db       *database.DB
    os       system.OSProvider   // inject interface
    ...
}

func (s *SiteService) CreateSite(req CreateSiteRequest) error {
    // Code này chạy giống nhau trên cả Linux và Windows
    err := s.os.WriteVhostConfig(req.Domain, s.buildVhostConfig(req))
    if err != nil { return err }
    return s.os.ReloadWebServer("nginx") // hay "iis"
}
```

### 6.4 Script execution

```go
// internal/system/shell_linux.go
//go:build linux

func (p *LinuxProvider) Shell(ctx context.Context, script string) (*ExecResult, error) {
    return Exec(ctx, "/bin/bash", "-c", script)
}

// internal/system/shell_windows.go
//go:build windows

func (p *WindowsProvider) Shell(ctx context.Context, script string) (*ExecResult, error) {
    // Ghi script ra temp file để tránh injection qua -Command
    f, _ := os.CreateTemp("", "itdlu-*.ps1")
    f.WriteString(script)
    f.Close()
    defer os.Remove(f.Name())

    return Exec(ctx, "powershell.exe",
        "-NoProfile", "-NonInteractive",
        "-ExecutionPolicy", "Bypass",
        "-File", f.Name(),
    )
}
```

---

## 7. Backend — Các thay đổi kỹ thuật

### 7.1 Cấu trúc file thay đổi

```
internal/
├── system/
│   ├── provider.go              ← interface OSProvider (mới)
│   ├── provider_linux.go        ← LinuxProvider (từ code hiện có)
│   ├── provider_windows.go      ← WindowsProvider (mới)
│   ├── os_detect.go             ← giữ nguyên (Linux)
│   ├── os_detect_windows.go     ← mới: WMI-based detection
│   ├── shell.go                 ← giữ nguyên (Linux)
│   └── shell_windows.go         ← mới: PowerShell executor
├── service/
│   ├── vhost/
│   │   ├── nginx.go             ← giữ nguyên
│   │   ├── apache.go            ← giữ nguyên
│   │   └── iis.go               ← mới: IIS XML config generator
│   ├── installer/
│   │   ├── linux/               ← code hiện có
│   │   └── windows/             ← mới: Chocolatey + Windows Feature
│   ├── terminal_service.go      ← giữ nguyên (Linux PTY)
│   ├── terminal_service_windows.go ← mới: ConPTY
│   ├── firewall_service.go      ← giữ nguyên (Linux iptables)
│   └── firewall_service_windows.go ← mới: WFW/NetSecurity
└── ...
```

### 7.2 Dependency mới

```go
// go.mod thêm:
require (
    github.com/UserExistsError/conpty v0.1.2  // ConPTY terminal Windows
)
```

**Không thêm dependency Windows-only khác** — dùng `exec.Command("powershell", ...)` thay vì gọi Win32 API trực tiếp để đơn giản hóa.

### 7.3 Cross-compilation

```makefile
# Makefile

build-linux:
    GOOS=linux GOARCH=amd64 go build -o bin/itdlupanel ./cmd/panel/

build-windows:
    GOOS=windows GOARCH=amd64 go build -o bin/itdlupanel-windows.exe ./cmd/panel/

# Build cả hai từ Linux
release: build-linux build-windows
```

### 7.4 Config panel.json — mở rộng

```json
{
  "panel": {
    "port": 8888,
    "ssl": false
  },
  "platform": {
    "os": "windows",
    "web_server": "iis",
    "web_root": "C:\\www",
    "shell": "pwsh.exe",
    "package_manager": "chocolatey",
    "chocolatey_path": "C:\\ProgramData\\chocolatey\\bin\\choco.exe",
    "wacs_path": "C:\\win-acme\\wacs.exe",
    "mysql_bin": "C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin",
    "redis_bin": "C:\\Program Files\\Memurai",
    "php_bin": "C:\\PHP"
  }
}
```

---

## 8. Frontend — Không thay đổi

React SPA và toàn bộ `web/` **không cần sửa đổi**:

- REST API contract giữ nguyên hoàn toàn
- Ant Design, Recharts, xterm.js, Monaco Editor — cross-browser
- Giao diện sáng/tối, responsive — không phụ thuộc OS
- Embedded vào binary qua `go:embed web/dist`

Chỉ cần cập nhật một số label giao diện (tùy chọn):

| Hiện tại (Linux) | Windows |
|-----------------|---------|
| "Nginx Config" | "IIS / Nginx Config" |
| "apt install" | "Chocolatey Install" |
| "/var/log/nginx/" | "Event Log / nginx logs" |
| "systemctl status" | "Service Status" |

---

## 9. Bảo mật và phân quyền

### 9.1 Chạy panel với quyền gì?

**Khuyến nghị:** Chạy `itdlupanel.exe` dưới tài khoản **Local System** hoặc service account chuyên dụng với các quyền:

| Quyền | Lý do |
|-------|-------|
| `SeServiceLogonRight` | Chạy như Windows Service |
| `SeCreateSymbolicLinkPrivilege` | File Manager tạo symlink |
| `SeTcpipAdminPrivilege` | Quản lý firewall rules |
| `SeBatchLogonRight` | Chạy scheduled tasks |
| Quyền IIS (`IIS_IUSRS`) | Quản lý IIS sites |
| Quyền MySQL admin | Tạo/xóa database |

### 9.2 Cài đặt như Windows Service

```powershell
# Cài ITDLUPanel như Windows Service
New-Service -Name "ITDLUPanel" `
    -BinaryPathName "C:\ITDLUPanel\itdlupanel.exe -config C:\ITDLUPanel\config\panel.json" `
    -DisplayName "ITDLUPanel Server Manager" `
    -StartupType Automatic `
    -Description "Web-based server management panel for DLU"

Start-Service ITDLUPanel
```

Hoặc dùng **NSSM** (Non-Sucking Service Manager): `nssm install ITDLUPanel "C:\ITDLUPanel\itdlupanel.exe"`.

### 9.3 UAC và PowerShell Execution Policy

Panel cần chạy PowerShell với `ExecutionPolicy Bypass` và elevated privileges. Cấu hình khi cài đặt:

```powershell
Set-ExecutionPolicy RemoteSigned -Scope LocalMachine
```

---

## 10. Cài đặt và triển khai

### 10.1 Quy trình cài đặt (Install Script)

```powershell
# install.ps1 — Script cài đặt ITDLUPanel trên Windows Server

#Requires -RunAsAdministrator

Write-Host "=== ITDLUPanel Windows Installer ===" -ForegroundColor Cyan

# 1. Cài Chocolatey
Set-ExecutionPolicy Bypass -Scope Process -Force
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# 2. Kích hoạt IIS + các module cần thiết
Install-WindowsFeature -Name Web-Server, Web-CGI, Web-ISAPI-Ext, Web-ISAPI-Filter,
    Web-Mgmt-Console, Web-Scripting-Tools, Web-Windows-Auth, Web-Basic-Auth,
    Web-URL-Auth, Web-Filtering -IncludeManagementTools

# 3. Cài PHP, MySQL, Redis
choco install php --version=8.3.0 -y
choco install mysql -y
choco install memurai -y      # Redis-compatible
choco install powershell-core -y

# 4. Cài win-acme (Let's Encrypt)
choco install win-acme -y

# 5. Tạo thư mục panel
New-Item -ItemType Directory -Path "C:\ITDLUPanel\config", "C:\ITDLUPanel\data",
    "C:\ITDLUPanel\logs", "C:\ITDLUPanel\www" -Force

# 6. Copy binary
Copy-Item ".\itdlupanel-windows.exe" "C:\ITDLUPanel\itdlupanel.exe"
Copy-Item ".\config\panel.json.example" "C:\ITDLUPanel\config\panel.json"

# 7. Mở port 8888 trong Firewall
New-NetFirewallRule -DisplayName "ITDLUPanel" -Direction Inbound -Protocol TCP -LocalPort 8888 -Action Allow

# 8. Cài như Windows Service
New-Service -Name "ITDLUPanel" `
    -BinaryPathName "C:\ITDLUPanel\itdlupanel.exe -config C:\ITDLUPanel\config\panel.json" `
    -DisplayName "ITDLUPanel Server Manager" -StartupType Automatic
Start-Service ITDLUPanel

Write-Host "✅ Cài đặt hoàn tất! Truy cập: http://localhost:8888" -ForegroundColor Green
```

### 10.2 Phân phối (Publish)

```
publish/
├── itdlupanel-windows-v5.zip
│   ├── itdlupanel-windows.exe    ← ~65MB (binary + frontend embedded)
│   ├── install.ps1               ← Script cài đặt
│   ├── uninstall.ps1
│   └── config\
│       └── panel.json.example
```

---

## 11. Lộ trình phát triển

### Phase 1 — Nền tảng (4-6 tuần)

| Task | Mô tả | Ưu tiên |
|------|-------|---------|
| OS Abstraction Layer | Interface `OSProvider`, `LinuxProvider`, `WindowsProvider` | 🔴 Critical |
| Shell executor Windows | PowerShell script runner, temp file approach | 🔴 Critical |
| Cross-compilation | `GOOS=windows` build thành công, không lỗi | 🔴 Critical |
| OS detection Windows | Đọc registry thay `/etc/os-release` | 🟡 High |
| Service manager Windows | `Get/Start/Stop-Service` wrapper | 🟡 High |
| Firewall Windows | `New/Remove-NetFirewallRule` wrapper | 🟡 High |

### Phase 2 — Web Server & SSL (3-4 tuần)

| Task | Mô tả | Ưu tiên |
|------|-------|---------|
| IIS vhost generator | Thay `vhost/nginx.go` cho Windows | 🔴 Critical |
| IIS site CRUD | Tạo/xóa/sửa site qua PowerShell | 🔴 Critical |
| win-acme integration | Let's Encrypt trên IIS | 🟡 High |
| PHP FastCGI config | Cấu hình PHP handler cho IIS | 🟡 High |
| Caddy option | Caddy as nginx alternative (simpler) | 🟢 Optional |

### Phase 3 — Terminal & Monitor (2-3 tuần)

| Task | Mô tả | Ưu tiên |
|------|-------|---------|
| ConPTY terminal | `UserExistsError/conpty` integration | 🟡 High |
| gopsutil path fix | `disk.Usage("C:\\")` và các path Windows | 🟡 High |
| Event Log reader | Thay journalctl cho `log_service` | 🟢 Medium |
| Task Scheduler | Thay crontab | 🟢 Medium |

### Phase 4 — Installer & Package Manager (3-4 tuần)

| Task | Mô tả | Ưu tiên |
|------|-------|---------|
| Chocolatey installer | Install/remove packages | 🟡 High |
| IIS installer | Enable Windows Feature | 🟡 High |
| MySQL Windows installer | Setup + config | 🟡 High |
| Redis (Memurai) installer | Setup + config | 🟢 Medium |
| Docker Windows | WSL2 + Docker Desktop | 🟢 Medium |
| FileZilla Server FTP | Thay PureFTPd | 🟢 Medium |

### Phase 5 — Testing & Polish (2-3 tuần)

| Task | Mô tả |
|------|-------|
| Integration tests on Windows Server 2022 | VM hoặc bare metal |
| Installer script testing | End-to-end install |
| UI label updates | Cập nhật "nginx" → "IIS/nginx" ở một số chỗ |
| Documentation | Hướng dẫn cài đặt Windows |
| Release binary | `itdlupanel-windows-v1.0.exe` |

**Tổng thời gian ước tính: 14-20 tuần** (với 1-2 developer full-time)

---

## 12. Rủi ro và giải pháp

| Rủi ro | Mức độ | Giải pháp |
|--------|--------|-----------|
| IIS management API phức tạp hơn nginx | 🔴 Cao | Dùng Caddy làm web server thay IIS (đơn giản hơn nhiều, cùng config file với Linux) |
| ConPTY không ổn định trên Server 2019 | 🟡 Trung bình | Fallback sang `cmd.exe` + named pipe; test sớm |
| Chocolatey yêu cầu internet khi cài | 🟡 Trung bình | Tạo Chocolatey local mirror cho môi trường offline |
| PowerShell execution policy bị IT lock | 🟡 Trung bình | Document rõ yêu cầu, hỗ trợ cả `cmd.exe` cho các task đơn giản |
| Go `modernc.org/sqlite` CGO-free có hạn chế | 🟢 Thấp | Đã test Windows, không vấn đề |
| Task Scheduler không hỗ trợ đầy đủ cron syntax | 🟡 Trung bình | Viết cron-to-ScheduledTask converter hoặc dùng Go scheduler nội bộ |
| ACME challenge HTTP-01 cần port 80 mở | 🟡 Trung bình | Hướng dẫn rõ trong installer; hỗ trợ DNS-01 challenge qua win-acme |

### 12.1 Lựa chọn chiến lược: IIS vs Caddy

| | IIS | Caddy v2 |
|--|-----|----------|
| Native Windows | ✅ | ❌ (third-party) |
| Auto HTTPS | ❌ (cần win-acme) | ✅ (built-in ACME) |
| Config format | XML + PowerShell | Caddyfile (đơn giản) |
| Tương đồng với bản Linux | Thấp | **Cao** (gần nginx) |
| Chi phí port code | **Cao** | **Thấp** |
| Thị phần Windows IIS | 80%+ | 5% |

**Khuyến nghị:** Hỗ trợ **cả hai** — Caddy làm default (dễ port, tương đồng nginx), IIS làm option cho môi trường enterprise Windows thuần.

---

## Kết luận

Việc port ITDLUPanel lên Windows Server là **khả thi** nhờ:

1. **Go cross-platform** — binary, HTTP, SQLite, WebSocket, JWT hoạt động nguyên vẹn
2. **gopsutil hỗ trợ Windows** — monitoring không cần viết lại
3. **React frontend không đổi** — chỉ thay API endpoints
4. **~40% service không cần sửa** — auth, backup, cloud storage, notification, email...

Thách thức lớn nhất là **web server management** (IIS vs nginx) và **terminal** (ConPTY vs PTY). Giải pháp clean nhất là dùng **OS Abstraction Layer** với build tags để cả hai phiên bản sống trong cùng một codebase.

Phiên bản Windows nên được phát triển song song với bản Linux, chia sẻ tối đa code qua interface, và release dưới dạng `itdlupanel-windows.exe` — cùng triết lý single-binary, zero-dependency.
