# 📋 PROJECT PLAN: XÂY DỰNG WEB PANEL QUẢN LÝ SERVER

> **Dự án**: Xây dựng Web Panel tương tự aaPanel  
> **Ngày tạo**: February 2, 2026  
> **Thời gian ước tính**: 8-12 tháng

---

## 🎯 Tổng quan dự án

Dựa trên phân tích hệ thống aaPanel, dưới đây là kế hoạch chi tiết để xây dựng một Web Panel với đầy đủ chức năng quản lý server Linux.

### Các chức năng chính

| Chức năng | Mô tả |
|-----------|-------|
| **Web Hosting** | Tạo/quản lý websites, virtual hosts, SSL certificates |
| **File Management** | Browse, edit, upload, download, compress files |
| **Database Management** | MySQL, PostgreSQL, MongoDB, Redis |
| **FTP Management** | Tạo và quản lý FTP accounts |
| **System Security** | Firewall, SSH security, IP filtering |
| **Task Scheduling** | Cron job management |
| **Software Management** | Cài đặt Nginx, Apache, PHP, etc. |
| **Plugin System** | Extensible architecture |
| **Monitoring** | System resource monitoring |

---

## PHASE 1: THIẾT LẬP NỀN TẢNG (Foundation Setup)
**Thời gian ước tính: 2-3 tuần**

### 1.1 Chuẩn bị môi trường phát triển

| Task ID | Task | Chi tiết | Độ ưu tiên |
|---------|------|----------|------------|
| 1.1.1 | Thiết lập Python environment | Python 3.8+, virtualenv, pip | Cao |
| 1.1.2 | Cài đặt Flask framework | Flask, Flask extensions (flask-compress, flask-sock, flask-session) | Cao |
| 1.1.3 | Cài đặt Gevent | gevent, gevent.pywsgi cho async I/O | Cao |
| 1.1.4 | Thiết lập SQLite database | Tạo database schema cơ bản | Cao |
| 1.1.5 | Cài đặt development tools | pytest, black, flake8, mypy | Trung bình |

### 1.2 Tạo cấu trúc thư mục dự án

```
/www/server/panel/
├── BT-Panel              # Main entry point
├── BT-Task               # Background task processor
├── BTPanel/
│   ├── __init__.py       # Flask app initialization
│   ├── app.py            # App configuration
│   ├── static/           # CSS, JS, images
│   ├── templates/        # HTML templates
│   └── languages/        # Translation files
├── class/                # Feature modules (v1)
├── class_v2/             # Feature modules (v2)
├── plugin/               # Plugin directory
├── config/               # JSON config files
├── data/                 # Runtime config (.pl files)
├── ssl/                  # SSL certificates
└── logs/                 # Log files
```

| Task ID | Task | Chi tiết |
|---------|------|----------|
| 1.2.1 | Tạo thư mục gốc `/www/server/panel/` | Root directory cho toàn bộ dự án |
| 1.2.2 | Tạo thư mục `BTPanel/` | Flask application package |
| 1.2.3 | Tạo thư mục `class/` và `class_v2/` | Module directories |
| 1.2.4 | Tạo thư mục `data/`, `config/`, `logs/` | Configuration và log directories |
| 1.2.5 | Tạo thư mục `ssl/`, `plugin/` | SSL và plugin directories |

---

## PHASE 2: WEB SERVER CORE (BT-Panel)
**Thời gian ước tính: 2-3 tuần**

### 2.1 Main Entry Point (BT-Panel)

| Task ID | Task | Chi tiết |
|---------|------|----------|
| 2.1.1 | Implement gevent monkey patching | `from gevent import monkey; monkey.patch_all()` |
| 2.1.2 | Implement double-fork daemonization | Tạo daemon process, tách khỏi terminal |
| 2.1.3 | Implement PID file management | Ghi/đọc `logs/panel.pid` |
| 2.1.4 | Implement configuration loading | Đọc các file `.pl` từ `data/` |
| 2.1.5 | Create BtWSGIServer class | Custom WSGIServer extending gevent.pywsgi.WSGIServer |
| 2.1.6 | Implement error handling | Xử lý OSError, client disconnect |

### 2.2 Process Management

| Task ID | Task | Chi tiết |
|---------|------|----------|
| 2.2.1 | Implement single-process mode | `serve_forever()` cho low-traffic |
| 2.2.2 | Implement multi-process mode | Dynamic worker scaling |
| 2.2.3 | Create `get_process_count()` function | Tính số worker dựa trên CPU/RAM |
| 2.2.4 | Implement worker spawning logic | Spawn khi CPU > 90% |
| 2.2.5 | Implement worker killing logic | Kill idle workers (>5s idle, >60s age) |
| 2.2.6 | Implement process tracking dictionary | `process_dict{pid: [Process, timestamp, psutil.Process]}` |

### 2.3 Network Binding

| Task ID | Task | Chi tiết |
|---------|------|----------|
| 2.3.1 | Implement TCP socket binding | Bind to `HOST:PORT` |
| 2.3.2 | Implement Unix socket binding | Bind to `/tmp/panel.sock` |
| 2.3.3 | Implement IPv6 support | Kiểm tra `data/ipv6.pl` |
| 2.3.4 | Implement port configuration | Đọc từ `data/port.pl`, default 7800 |

---

## PHASE 3: FLASK APPLICATION CORE
**Thời gian ước tính: 2-3 tuần**

### 3.1 Flask Initialization

| Task ID | Task | Chi tiết |
|---------|------|----------|
| 3.1.1 | Create Flask app instance | `app = Flask(__name__, template_folder=...)` |
| 3.1.2 | Integrate Flask-Compress | Response compression |
| 3.1.3 | Integrate Flask-Sock/Sockets | WebSocket support |
| 3.1.4 | Implement SimpleCacheSession | Custom in-memory session storage |
| 3.1.5 | Generate secret key | Based on `os.uname()` + `psutil.boot_time()` |

### 3.2 Session Management

| Task ID | Task | Chi tiết |
|---------|------|----------|
| 3.2.1 | Configure SESSION_TYPE | memcached-style storage |
| 3.2.2 | Implement SimpleCacheSession class | 1000 entries, 24-hour TTL |
| 3.2.3 | Configure session cookies | SameSite, Secure flags |
| 3.2.4 | Implement 30-day session lifetime | `PERMANENT_SESSION_LIFETIME` |
| 3.2.5 | Implement session prefix | `BT_:` prefix cho session keys |

### 3.3 Debug Mode

| Task ID | Task | Chi tiết |
|---------|------|----------|
| 3.3.1 | Implement debug detection | Kiểm tra `data/debug.pl` |
| 3.3.2 | Setup pyinotify file watching | Auto-reload on file change |
| 3.3.3 | Configure debug logging | Enhanced error messages |

---

## PHASE 4: REQUEST PROCESSING PIPELINE
**Thời gian ước tính: 2-3 tuần**

### 4.1 Before-Request Processing

| Task ID | Task | Chi tiết |
|---------|------|----------|
| 4.1.1 | Implement `request_check()` function | `@app.before_request` decorator |
| 4.1.2 | Implement real IP detection | CF-Connecting-IP, X-Forwarded-For, X-Real-IP |
| 4.1.3 | Implement HTTP method validation | Only GET, POST, HEAD allowed |
| 4.1.4 | Implement URI length check | Max 256 chars path, 1024 URL |
| 4.1.5 | Implement URI pattern matching | Regex validation |
| 4.1.6 | Implement POST parameter filtering | Key/value length limits |
| 4.1.7 | Implement session ID validation | Alphanumeric, dots, hyphens only |

### 4.2 Security Validation

| Task ID | Task | Chi tiết |
|---------|------|----------|
| 4.2.1 | Implement path traversal protection | Block `..`, `./`, `//` |
| 4.2.2 | Implement XSS prevention | `public.xssdecode()`, `public.xsssec()` |
| 4.2.3 | Implement IP whitelist check | Allow/deny IP addresses |
| 4.2.4 | Implement domain whitelist check | Validate request domain |
| 4.2.5 | Implement static file auth | Require auth for static assets |

### 4.3 Admin Path Security

| Task ID | Task | Chi tiết |
|---------|------|----------|
| 4.3.1 | Read admin path from `data/admin_path.pl` | Custom admin URL |
| 4.3.2 | Implement reserved path blacklist | 35 reserved paths |
| 4.3.3 | Auto-remap conflicts to `/bt` | Fallback path |

---

## PHASE 5: AUTHENTICATION SYSTEM
**Thời gian ước tính: 2-3 tuần**

### 5.1 Username/Password Authentication

| Task ID | Task | Chi tiết |
|---------|------|----------|
| 5.1.1 | Create `userlogin` class | Main auth handler |
| 5.1.2 | Implement RSA encryption | Credential encryption |
| 5.1.3 | Implement password hashing | MD5 + salt |
| 5.1.4 | Create users table schema | id, username, password, salt |
| 5.1.5 | Implement `request_post()` method | Credential verification |
| 5.1.6 | Implement `_set_login_session()` | Session creation |

### 5.2 Two-Factor Authentication (2FA)

| Task ID | Task | Chi tiết |
|---------|------|----------|
| 5.2.1 | Integrate PyOTP library | TOTP verification |
| 5.2.2 | Store 2FA secret key | `/www/server/panel/data/two_step_auth.txt` |
| 5.2.3 | Implement TOTP verification | Time-based codes |
| 5.2.4 | Implement IP-based trusted devices | 24-hour trust |
| 5.2.5 | Implement time synchronization | Handle clock drift |

### 5.3 Rate Limiting

| Task ID | Task | Chi tiết |
|---------|------|----------|
| 5.3.1 | Implement `limit_address()` function | IP-based tracking |
| 5.3.2 | Set 5 failed attempts limit | Before blocking |
| 5.3.3 | Implement exponential backoff | Increasing block duration |
| 5.3.4 | Cache-based storage | Rate limit data |

### 5.4 CSRF Protection

| Task ID | Task | Chi tiết |
|---------|------|----------|
| 5.4.1 | Implement `check_csrf()` function | Token validation |
| 5.4.2 | Generate CSRF tokens | `set_request_token()` |
| 5.4.3 | Validate tokens on state changes | POST requests |
| 5.4.4 | Implement WebSocket CSRF check | `check_csrf_websocket()` |

### 5.5 Basic Authentication (Optional Layer)

| Task ID | Task | Chi tiết |
|---------|------|----------|
| 5.5.1 | Read config from `config/basic_auth.json` | Username, password hashed |
| 5.5.2 | Implement HTTP Basic Auth header | 401 challenge |
| 5.5.3 | Enable/disable via config | `BASIC_AUTH_OPEN` flag |

---

## PHASE 6: MODULE SYSTEM & ROUTING
**Thời gian ước tính: 2-3 tuần**

### 6.1 Route Definitions

| Task ID | Task | Chi tiết |
|---------|------|----------|
| 6.1.1 | Define `/site` route | Website management |
| 6.1.2 | Define `/ftp` route | FTP management |
| 6.1.3 | Define `/database` route | Database management |
| 6.1.4 | Define `/firewall` route | Firewall management |
| 6.1.5 | Define `/files` route | File management |
| 6.1.6 | Define `/crontab` route | Cron job management |
| 6.1.7 | Define `/config` route | Configuration |
| 6.1.8 | Define `/plugin` route | Plugin management |
| 6.1.9 | Define `/task` route | Task management |
| 6.1.10 | Define `/ajax` route | AJAX requests |
| 6.1.11 | Define `/system` route | System info |

### 6.2 Universal Dispatcher (publicObject)

| Task ID | Task | Chi tiết |
|---------|------|----------|
| 6.2.1 | Implement `publicObject()` function | Universal dispatcher |
| 6.2.2 | Implement CSRF validation | `check_csrf()` call |
| 6.2.3 | Implement `get_input()` function | Request parameter parsing |
| 6.2.4 | Implement path sanitization | Clean path, filename, sfile, dfile |
| 6.2.5 | Implement site path checking | `site_path_check()` |
| 6.2.6 | Implement `run_exec` class | Method invocation |
| 6.2.7 | Implement method whitelist (defs) | Allowed methods tuple |

### 6.3 V2 API Routes

| Task ID | Task | Chi tiết |
|---------|------|----------|
| 6.3.1 | Create `/v2/*` route prefix | Modern API |
| 6.3.2 | Implement GET for template rendering | Page display |
| 6.3.3 | Implement POST for API calls | Data operations |

---

## PHASE 7: BACKGROUND TASK SYSTEM (BT-Task)
**Thời gian ước tính: 1-2 tuần**

### 7.1 BT-Task Process

| Task ID | Task | Chi tiết |
|---------|------|----------|
| 7.1.1 | Create BT-Task executable | Entry point script |
| 7.1.2 | Implement `task.main()` | Task processing loop |
| 7.1.3 | Write PID to `logs/task.pid` | Process tracking |

### 7.2 Daemon Task Monitoring

| Task ID | Task | Chi tiết |
|---------|------|----------|
| 7.2.1 | Implement `daemon_task()` function | Monitoring thread |
| 7.2.2 | 60-second check interval | Health check cycle |
| 7.2.3 | PID file existence check | `logs/task.pid` |
| 7.2.4 | Process existence check | `/proc/{pid}/comm` |
| 7.2.5 | Process name validation | Contains "BT-Task" |
| 7.2.6 | Implement `run_task()` | Auto-restart mechanism |

### 7.3 Jobs Initialization

| Task ID | Task | Chi tiết |
|---------|------|----------|
| 7.3.1 | Create `jobs.py` | One-time startup tasks |
| 7.3.2 | Launch via `nohup` | Background execution |

---

## PHASE 8: WEBSOCKET SUPPORT
**Thời gian ước tính: 2 tuần**

### 8.1 WebSocket Infrastructure

| Task ID | Task | Chi tiết |
|---------|------|----------|
| 8.1.1 | Initialize Sock object | `sockets = Sock(app)` |
| 8.1.2 | Implement fallback to flask_sockets | Compatibility |

### 8.2 SSH Terminal (/webssh)

| Task ID | Task | Chi tiết |
|---------|------|----------|
| 8.2.1 | Create `/webssh` endpoint | SSH terminal access |
| 8.2.2 | Implement SSH connection | Host, port, username, password/pkey |
| 8.2.3 | Create `ssh_terminal` class | Terminal session management |
| 8.2.4 | Implement localhost handling | Auto-retrieve saved credentials |

### 8.3 Command Execution (/sock_shell)

| Task ID | Task | Chi tiết |
|---------|------|----------|
| 8.3.1 | Create `/sock_shell` endpoint | Real-time command execution |
| 8.3.2 | Implement `sock_recv()` thread | Command executor |
| 8.3.3 | Implement PID tracking | `sock_pids` dictionary |
| 8.3.4 | Implement `kill_closed()` cleanup | Orphan process cleanup |

### 8.4 Panel Events (/ws_panel)

| Task ID | Task | Chi tiết |
|---------|------|----------|
| 8.4.1 | Create `/ws_panel` endpoint | Generic panel method invocation |
| 8.4.2 | Implement `ws_panel_thread()` | Threaded processing |
| 8.4.3 | Module blacklist | Protect sensitive modules |

---

## PHASE 9: FEATURE MODULES
**Thời gian ước tính: 6-8 tuần**

### 9.1 Website Management (`panelSite`)

| Task ID | Task | Chi tiết |
|---------|------|----------|
| 9.1.1 | Create `panelSite` class | Main site management |
| 9.1.2 | Implement `AddSite()` | Create website |
| 9.1.3 | Implement `DeleteSite()` | Remove website |
| 9.1.4 | Generate Nginx configuration | Virtual host config |
| 9.1.5 | Generate Apache configuration | Virtual host config |
| 9.1.6 | Generate OpenLiteSpeed configuration | Virtual host config |
| 9.1.7 | Implement `AddDomain()` | Domain management |
| 9.1.8 | Implement domain import/export | Bulk operations |
| 9.1.9 | Implement SSL certificate integration | ACME v2 |
| 9.1.10 | Create sites database table | id, name, path, status, etc. |
| 9.1.11 | Create domains database table | id, pid, name, port |

### 9.2 Database Management (`database`)

| Task ID | Task | Chi tiết |
|---------|------|----------|
| 9.2.1 | Create `database` class | Main DB management |
| 9.2.2 | Implement `AddDatabase()` | Create database |
| 9.2.3 | Implement `DeleteDatabase()` | Remove database |
| 9.2.4 | Implement `ResDatabasePassword()` | Password reset |
| 9.2.5 | Implement `ToBackup()` | Database backup |
| 9.2.6 | Implement `InputSql()` | Database restore |
| 9.2.7 | Support MySQL, PostgreSQL, MongoDB, Redis | Multiple DB types |
| 9.2.8 | Implement recycle bin | Recovery feature |
| 9.2.9 | Remote database support | External DB servers |
| 9.2.10 | Create databases table schema | id, name, username, password, etc. |

### 9.3 FTP Management (`ftp`)

| Task ID | Task | Chi tiết |
|---------|------|----------|
| 9.3.1 | Create `ftp` class | Main FTP management |
| 9.3.2 | Implement `AddUser()` | Create FTP account |
| 9.3.3 | Implement `DeleteUser()` | Remove FTP account |
| 9.3.4 | Implement `SetUserPassword()` | Password management |
| 9.3.5 | Implement `SetStatus()` | Enable/disable account |
| 9.3.6 | Implement `setPort()` | FTP port configuration |
| 9.3.7 | Implement `set_user_home()` | Home directory |
| 9.3.8 | Integrate Pure-FTPd | FTP server |
| 9.3.9 | Implement logging | Login/action logs |
| 9.3.10 | Create ftps table schema | id, name, password, path, etc. |

### 9.4 Firewall Management (`firewalls`)

| Task ID | Task | Chi tiết |
|---------|------|----------|
| 9.4.1 | Create `firewalls` class | Main firewall management |
| 9.4.2 | Implement `GetList()` | Get firewall rules |
| 9.4.3 | Implement `AddDropAddress()` | Block IP |
| 9.4.4 | Implement `DelDropAddress()` | Unblock IP |
| 9.4.5 | Implement `AddAcceptPort()` | Open port |
| 9.4.6 | Implement `DelAcceptPort()` | Close port |
| 9.4.7 | Implement `FirewallReload()` | Reload config |
| 9.4.8 | Implement `SetFirewallStatus()` | Enable/disable |
| 9.4.9 | Implement SSH configuration | `SetSshPort()`, `SetSshStatus()` |
| 9.4.10 | Implement `SetPing()` | ICMP control |
| 9.4.11 | Integrate iptables/firewalld | System firewall |

### 9.5 File Management (`files`)

| Task ID | Task | Chi tiết |
|---------|------|----------|
| 9.5.1 | Create `files` class | Main file management |
| 9.5.2 | Implement directory listing | Browse files |
| 9.5.3 | Implement file create/edit | Text editing |
| 9.5.4 | Implement file upload/download | Transfer files |
| 9.5.5 | Implement compress/decompress | ZIP, TAR, GZIP |
| 9.5.6 | Implement file search | Search content/name |
| 9.5.7 | Implement permissions management | chmod, chown |
| 9.5.8 | Implement file copy/move/delete | Basic operations |
| 9.5.9 | Implement recycle bin | Recovery feature |

### 9.6 Cron Job Management (`crontab`)

| Task ID | Task | Chi tiết |
|---------|------|----------|
| 9.6.1 | Create `crontab` class | Main cron management |
| 9.6.2 | Implement add cron job | Create scheduled task |
| 9.6.3 | Implement delete cron job | Remove task |
| 9.6.4 | Implement edit cron job | Modify schedule |
| 9.6.5 | Support task types | Backup, script, URL |
| 9.6.6 | Implement cron log | Task execution history |
| 9.6.7 | Create crontabs table schema | id, name, schedule, command, etc. |

### 9.7 System Monitoring (`system`)

| Task ID | Task | Chi tiết |
|---------|------|----------|
| 9.7.1 | Create `system` class | System info module |
| 9.7.2 | Implement CPU monitoring | Usage percentage |
| 9.7.3 | Implement memory monitoring | RAM usage |
| 9.7.4 | Implement disk monitoring | Storage space |
| 9.7.5 | Implement network monitoring | Traffic stats |
| 9.7.6 | Implement process list | Running processes |
| 9.7.7 | Implement service status | Service management |
| 9.7.8 | Implement reboot detection | `check_system_restarted()` |

### 9.8 Configuration Management (`config`)

| Task ID | Task | Chi tiết |
|---------|------|----------|
| 9.8.1 | Create `config` class | Panel configuration |
| 9.8.2 | Implement panel settings | Language, timezone, etc. |
| 9.8.3 | Implement user management | Add/edit admin users |
| 9.8.4 | Implement security settings | 2FA, IP whitelist |
| 9.8.5 | Implement backup settings | Auto backup config |

---

## PHASE 10: PLUGIN SYSTEM
**Thời gian ước tính: 2 tuần**

### 10.1 Plugin Architecture

| Task ID | Task | Chi tiết |
|---------|------|----------|
| 10.1.1 | Define plugin directory structure | `plugin/{name}/{name}_main.py` |
| 10.1.2 | Implement plugin discovery | Scan plugin directories |
| 10.1.3 | Implement dynamic module loading | `__import__()` |
| 10.1.4 | Create PluginLoader class | `plugin_run()` method |

### 10.2 Plugin Management

| Task ID | Task | Chi tiết |
|---------|------|----------|
| 10.2.1 | Create `panelPlugin` class | Plugin management |
| 10.2.2 | Implement `install_plugin()` | Install from repository |
| 10.2.3 | Implement `uninstall_plugin()` | Remove plugin |
| 10.2.4 | Implement `getPluginList()` | List installed |
| 10.2.5 | Implement `get_cloud_list()` | Cloud repository |
| 10.2.6 | Implement `export_zip()`/`input_zip()` | Import/export |
| 10.2.7 | Implement `check_deps()` | Dependency check |

### 10.3 Plugin Static Resources

| Task ID | Task | Chi tiết |
|---------|------|----------|
| 10.3.1 | Implement static file serving | `/{plugin}/static/{file}` |
| 10.3.2 | Path validation | Prevent traversal |
| 10.3.3 | Template rendering | Plugin templates |

---

## PHASE 11: SSL/TLS CONFIGURATION
**Thời gian ước tính: 1 tuần**

### 11.1 SSL Enablement

| Task ID | Task | Chi tiết |
|---------|------|----------|
| 11.1.1 | Check `data/ssl.pl` existence | Enable flag |
| 11.1.2 | Load certificate and key | `ssl/certificate.pem`, `ssl/privateKey.pem` |
| 11.1.3 | Create SSL context | `ssl.create_default_context()` |

### 11.2 TLS Configuration

| Task ID | Task | Chi tiết |
|---------|------|----------|
| 11.2.1 | Set minimum TLS version | TLSv1.2+ |
| 11.2.2 | Configure cipher suites | Strong ciphers |
| 11.2.3 | Implement client verification (optional) | Mutual TLS |
| 11.2.4 | Load CA certificate | `ssl/ca.pem` |

---

## PHASE 12: INTERNATIONALIZATION (i18n)
**Thời gian ước tính: 1 tuần**

### 12.1 Server-Side Translation

| Task ID | Task | Chi tiết |
|---------|------|----------|
| 12.1.1 | Setup gettext | Python translation |
| 12.1.2 | Implement `GetMsg()` | Message translation |
| 12.1.3 | Implement `GetLan()` | Template translation |
| 12.1.4 | Create JSON language files | `public.json`, `log.json`, `template.json` |

### 12.2 Client-Side Translation

| Task ID | Task | Chi tiết |
|---------|------|----------|
| 12.2.1 | Create `lan.js` | JavaScript translation |
| 12.2.2 | Create language JSON files | `en.json`, `zh.json`, `cht.json` |
| 12.2.3 | Implement `lan.get()` function | UI translation |

### 12.3 Language Configuration

| Task ID | Task | Chi tiết |
|---------|------|----------|
| 12.3.1 | Implement `GetLanguage()` | Get current language |
| 12.3.2 | Store language in config | `config/config.json` |
| 12.3.3 | Support English, Chinese (Simplified/Traditional) | Initial languages |

---

## PHASE 13: FRONTEND DEVELOPMENT
**Thời gian ước tính: 4-6 tuần**

### 13.1 Base Templates

| Task ID | Task | Chi tiết |
|---------|------|----------|
| 13.1.1 | Create base layout template | Header, sidebar, footer |
| 13.1.2 | Create login page | Authentication UI |
| 13.1.3 | Create dashboard | Overview page |
| 13.1.4 | Create 404/500 error pages | Error handling |

### 13.2 Feature Pages

| Task ID | Task | Chi tiết |
|---------|------|----------|
| 13.2.1 | Create website management page | Site list, add/edit forms |
| 13.2.2 | Create database management page | DB list, operations |
| 13.2.3 | Create FTP management page | FTP accounts |
| 13.2.4 | Create firewall management page | Rules, SSH settings |
| 13.2.5 | Create file manager page | File browser UI |
| 13.2.6 | Create cron job page | Task scheduler UI |
| 13.2.7 | Create system monitoring page | Charts, stats |
| 13.2.8 | Create settings page | Configuration UI |
| 13.2.9 | Create plugin management page | Plugin store |

### 13.3 JavaScript/CSS

| Task ID | Task | Chi tiết |
|---------|------|----------|
| 13.3.1 | Setup CSS framework | Custom or Bootstrap |
| 13.3.2 | Create AJAX utilities | API calls |
| 13.3.3 | Implement WebSocket client | Real-time features |
| 13.3.4 | Create terminal component | xterm.js integration |
| 13.3.5 | Create file editor component | CodeMirror/Monaco |
| 13.3.6 | Create chart components | Chart.js for monitoring |

---

## PHASE 14: TESTING
**Thời gian ước tính: 2-3 tuần**

### 14.1 Unit Tests

| Task ID | Task | Chi tiết |
|---------|------|----------|
| 14.1.1 | Test authentication module | Login, 2FA, rate limiting |
| 14.1.2 | Test security validation | XSS, path traversal |
| 14.1.3 | Test database operations | CRUD operations |
| 14.1.4 | Test file operations | Upload, download, permissions |
| 14.1.5 | Test firewall operations | Rules management |

### 14.2 Integration Tests

| Task ID | Task | Chi tiết |
|---------|------|----------|
| 14.2.1 | Test request pipeline | Full request lifecycle |
| 14.2.2 | Test WebSocket connections | Terminal, events |
| 14.2.3 | Test plugin system | Install, execute, uninstall |
| 14.2.4 | Test background tasks | BT-Task operations |

### 14.3 Security Tests

| Task ID | Task | Chi tiết |
|---------|------|----------|
| 14.3.1 | Test CSRF protection | Token validation |
| 14.3.2 | Test SQL injection | Input sanitization |
| 14.3.3 | Test XSS prevention | Output encoding |
| 14.3.4 | Test path traversal | Directory escaping |
| 14.3.5 | Test authentication bypass | Session hijacking |

---

## PHASE 15: DEPLOYMENT
**Thời gian ước tính: 1-2 tuần**

### 15.1 Deployment Scripts

| Task ID | Task | Chi tiết |
|---------|------|----------|
| 15.1.1 | Create installation script | Auto-setup |
| 15.1.2 | Create systemd service file | Panel service |
| 15.1.3 | Create update script | Version upgrade |
| 15.1.4 | Create uninstall script | Clean removal |

### 15.2 Documentation

| Task ID | Task | Chi tiết |
|---------|------|----------|
| 15.2.1 | Write installation guide | Step-by-step |
| 15.2.2 | Write user manual | Feature documentation |
| 15.2.3 | Write API documentation | Developer reference |
| 15.2.4 | Write plugin development guide | Extension guide |

### 15.3 Production Configuration

| Task ID | Task | Chi tiết |
|---------|------|----------|
| 15.3.1 | Configure production settings | Disable debug |
| 15.3.2 | Setup SSL certificates | HTTPS |
| 15.3.3 | Configure firewall rules | Security hardening |
| 15.3.4 | Setup log rotation | Log management |
| 15.3.5 | Configure backup automation | Data protection |

---

## 📊 TỔNG KẾT

| Phase | Thời gian ước tính | Số Tasks |
|-------|-------------------|----------|
| Phase 1: Foundation Setup | 2-3 tuần | 10 |
| Phase 2: Web Server Core | 2-3 tuần | 16 |
| Phase 3: Flask Application Core | 2-3 tuần | 13 |
| Phase 4: Request Processing Pipeline | 2-3 tuần | 14 |
| Phase 5: Authentication System | 2-3 tuần | 18 |
| Phase 6: Module System & Routing | 2-3 tuần | 17 |
| Phase 7: Background Task System | 1-2 tuần | 9 |
| Phase 8: WebSocket Support | 2 tuần | 13 |
| Phase 9: Feature Modules | 6-8 tuần | 58 |
| Phase 10: Plugin System | 2 tuần | 10 |
| Phase 11: SSL/TLS Configuration | 1 tuần | 6 |
| Phase 12: Internationalization | 1 tuần | 9 |
| Phase 13: Frontend Development | 4-6 tuần | 17 |
| Phase 14: Testing | 2-3 tuần | 13 |
| Phase 15: Deployment | 1-2 tuần | 10 |
| **TỔNG CỘNG** | **32-46 tuần (~8-12 tháng)** | **~223 tasks** |

---

## 🔧 CÔNG NGHỆ SỬ DỤNG

| Layer | Technology |
|-------|------------|
| **Backend** | Python 3.8+, Flask, Gevent |
| **Database** | SQLite (metadata), MySQL/PostgreSQL (managed) |
| **Web Server** | gevent.pywsgi.WSGIServer |
| **WebSocket** | flask-sock / flask-sockets |
| **Session** | Flask-Session, SimpleCacheSession |
| **Authentication** | RSA encryption, MD5+salt hashing, PyOTP (2FA) |
| **Frontend** | HTML5, CSS3, JavaScript, xterm.js |
| **Process Management** | gevent, multiprocessing |
| **System Integration** | iptables/firewalld, Pure-FTPd, Nginx/Apache/OLS |

---

## 📦 DATABASE SCHEMA

### Core Tables

```sql
-- Users table
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    salt TEXT NOT NULL,
    email TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sites table
CREATE TABLE sites (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    status INTEGER DEFAULT 1,
    ps TEXT,
    type_id INTEGER DEFAULT 0,
    addtime TEXT,
    project_type TEXT
);

-- Domains table
CREATE TABLE domains (
    id INTEGER PRIMARY KEY,
    pid INTEGER NOT NULL,
    name TEXT NOT NULL,
    port INTEGER DEFAULT 80,
    addtime TEXT,
    FOREIGN KEY (pid) REFERENCES sites(id)
);

-- Databases table
CREATE TABLE databases (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    username TEXT NOT NULL,
    password TEXT NOT NULL,
    accept TEXT DEFAULT 'localhost',
    ps TEXT,
    addtime TEXT
);

-- FTP accounts table
CREATE TABLE ftps (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    password TEXT NOT NULL,
    path TEXT NOT NULL,
    status INTEGER DEFAULT 1,
    ps TEXT,
    addtime TEXT
);

-- Crontabs table
CREATE TABLE crontabs (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT,
    where1 TEXT,
    where_hour INTEGER,
    where_minute INTEGER,
    echo TEXT,
    addtime TEXT,
    status INTEGER DEFAULT 1,
    save INTEGER DEFAULT 3,
    backupTo TEXT,
    sName TEXT,
    sBody TEXT,
    sType TEXT,
    urladdress TEXT
);

-- Firewall rules table
CREATE TABLE firewall (
    id INTEGER PRIMARY KEY,
    port TEXT NOT NULL,
    ps TEXT,
    addtime TEXT
);

-- Logs table
CREATE TABLE logs (
    id INTEGER PRIMARY KEY,
    type TEXT,
    log TEXT,
    addtime TEXT
);

-- Backup table
CREATE TABLE backup (
    id INTEGER PRIMARY KEY,
    type INTEGER,
    name TEXT,
    pid INTEGER,
    filename TEXT,
    size INTEGER,
    addtime TEXT
);
```

---

## ⚠️ LƯU Ý QUAN TRỌNG

### Bảo mật
- ✅ Luôn validate input, sanitize output
- ✅ Sử dụng CSRF tokens cho mọi POST request
- ✅ Hash passwords với salt
- ✅ Không expose stack traces ở production
- ✅ Implement rate limiting

### Performance
- ✅ Sử dụng caching (SimpleCache)
- ✅ Lazy loading modules
- ✅ Connection pooling cho database
- ✅ Gzip compression

### Logging
- ✅ Log tất cả authentication events
- ✅ Log tất cả admin actions
- ✅ Implement log rotation

### Compatibility
- ✅ Hỗ trợ Ubuntu 18.04+
- ✅ Hỗ trợ CentOS 7+
- ✅ Hỗ trợ Debian 9+

### Modularity
- ✅ Thiết kế module độc lập
- ✅ Plugin architecture cho extensibility
- ✅ API versioning (v1, v2)

---

## 🚀 QUICK START DEVELOPMENT

```bash
# 1. Clone repository
git clone https://github.com/your-org/web-panel.git
cd web-panel

# 2. Create virtual environment
python3 -m venv venv
source venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Initialize database
python scripts/init_db.py

# 5. Run development server
python BT-Panel --debug

# 6. Access panel
# Open http://localhost:7800 in browser
```

---

## 📝 CHANGELOG

| Version | Date | Changes |
|---------|------|---------|
| 0.1.0 | TBD | Initial release with core features |
| 0.2.0 | TBD | Plugin system |
| 0.3.0 | TBD | WebSocket support |
| 1.0.0 | TBD | Production ready |

---

*Document generated based on aaPanel architecture analysis*
