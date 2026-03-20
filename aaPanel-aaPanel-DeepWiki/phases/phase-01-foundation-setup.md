# Phase 1: Foundation Setup - Thiết lập nền tảng

> **Thời gian ước tính**: 2-3 tuần  
> **Độ ưu tiên**: Cao  
> **Dependencies**: Không có

---

## 📚 Tài liệu tham khảo

| File | Mô tả |
|------|-------|
| [Overview.md](../Overview.md) | Tổng quan hệ thống aaPanel |
| [System-Architecture.md](../System-Architecture.md) | Kiến trúc 3 tầng của hệ thống |
| [Development-Setup.md](../Development-Setup.md) | Hướng dẫn thiết lập môi trường phát triển |
| [Configuration-Files-Reference.md](../Configuration-Files-Reference.md) | Tham khảo các file cấu hình |

---

## 🎯 Mục tiêu Phase

1. Thiết lập môi trường phát triển Python hoàn chỉnh
2. Cài đặt tất cả dependencies cần thiết
3. Tạo cấu trúc thư mục dự án chuẩn
4. Thiết lập database schema cơ bản
5. Cấu hình development tools

---

## 📋 Chi tiết Tasks

### Task 1.1: Thiết lập Python Environment

#### 1.1.1 Cài đặt Python 3.8+
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install python3.8 python3.8-venv python3.8-dev python3-pip

# CentOS/RHEL
sudo yum install python38 python38-devel python38-pip
```

**Checklist:**
- [ ] Python 3.8+ đã cài đặt
- [ ] pip đã cập nhật phiên bản mới nhất
- [ ] python3 command hoạt động

#### 1.1.2 Tạo Virtual Environment
```bash
# Tạo thư mục dự án
sudo mkdir -p /www/server/panel
cd /www/server/panel

# Tạo virtual environment
python3 -m venv venv
source venv/bin/activate

# Verify
which python
python --version
```

**Checklist:**
- [ ] Virtual environment đã tạo
- [ ] Có thể activate/deactivate
- [ ] pip trong venv hoạt động

---

### Task 1.2: Cài đặt Flask Framework & Extensions

#### 1.2.1 Core Dependencies
```bash
pip install flask==2.3.3
pip install flask-compress==1.14
pip install flask-session==0.5.0
pip install Werkzeug==2.3.7
```

#### 1.2.2 WebSocket Support
```bash
pip install flask-sock==0.6.0
# Fallback
pip install flask-sockets==0.2.1
```

#### 1.2.3 Async I/O
```bash
pip install gevent==23.9.1
pip install greenlet==3.0.1
```

**File: requirements.txt**
```
# Core Framework
flask==2.3.3
flask-compress==1.14
flask-session==0.5.0
Werkzeug==2.3.7

# WebSocket
flask-sock==0.6.0
flask-sockets==0.2.1

# Async I/O
gevent==23.9.1
greenlet==3.0.1

# System Monitoring
psutil==5.9.6

# Security
pyotp==2.9.0
pycryptodome==3.19.0

# Database
# SQLite built-in

# Utilities
chardet==5.2.0
requests==2.31.0

# File Watching (Debug)
pyinotify==0.9.6

# Development
pytest==7.4.3
black==23.11.0
flake8==6.1.0
mypy==1.7.0
```

**Checklist:**
- [ ] Flask và extensions đã cài
- [ ] Gevent hoạt động
- [ ] WebSocket library có sẵn
- [ ] requirements.txt đã tạo

---

### Task 1.3: Cài đặt Gevent cho Async I/O

#### 1.3.1 Verify Gevent Installation
```python
# test_gevent.py
from gevent import monkey
monkey.patch_all()

import gevent
from gevent.pywsgi import WSGIServer

def test_greenlet():
    def task(n):
        return n * 2
    
    jobs = [gevent.spawn(task, i) for i in range(5)]
    gevent.joinall(jobs)
    results = [job.value for job in jobs]
    print(f"Results: {results}")
    assert results == [0, 2, 4, 6, 8]
    print("Gevent working correctly!")

if __name__ == "__main__":
    test_greenlet()
```

**Checklist:**
- [ ] Monkey patching hoạt động
- [ ] Greenlets có thể spawn
- [ ] WSGIServer có thể import

---

### Task 1.4: Thiết lập SQLite Database

#### 1.4.1 Tạo Database Schema
**File: scripts/init_db.py**
```python
#!/usr/bin/env python3
import sqlite3
import os

DB_PATH = '/www/server/panel/data/default.db'

def init_database():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Users table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            salt TEXT NOT NULL,
            email TEXT,
            login_ip TEXT,
            login_time TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Sites table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS sites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            path TEXT NOT NULL,
            status INTEGER DEFAULT 1,
            ps TEXT,
            type_id INTEGER DEFAULT 0,
            addtime TEXT,
            project_type TEXT
        )
    ''')
    
    # Domains table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS domain (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pid INTEGER NOT NULL,
            name TEXT NOT NULL,
            port INTEGER DEFAULT 80,
            addtime TEXT,
            FOREIGN KEY (pid) REFERENCES sites(id) ON DELETE CASCADE
        )
    ''')
    
    # Databases table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS databases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pid INTEGER DEFAULT 0,
            sid INTEGER DEFAULT 0,
            name TEXT NOT NULL,
            username TEXT NOT NULL,
            password TEXT NOT NULL,
            accept TEXT DEFAULT 'localhost',
            ps TEXT,
            addtime TEXT,
            type TEXT DEFAULT 'MySQL',
            db_type INTEGER DEFAULT 0
        )
    ''')
    
    # FTP accounts table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS ftps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pid INTEGER DEFAULT 0,
            name TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            path TEXT NOT NULL,
            status INTEGER DEFAULT 1,
            ps TEXT,
            addtime TEXT
        )
    ''')
    
    # Crontabs table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS crontab (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT,
            where1 TEXT,
            where_hour INTEGER DEFAULT 0,
            where_minute INTEGER DEFAULT 0,
            echo TEXT,
            addtime TEXT,
            status INTEGER DEFAULT 1,
            save INTEGER DEFAULT 3,
            backupTo TEXT,
            sName TEXT,
            sBody TEXT,
            sType TEXT DEFAULT 'toShell',
            urladdress TEXT
        )
    ''')
    
    # Firewall rules table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS firewall (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            port TEXT NOT NULL,
            ps TEXT,
            addtime TEXT
        )
    ''')
    
    # Logs table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT,
            log TEXT,
            addtime TEXT
        )
    ''')
    
    # Backup table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS backup (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type INTEGER DEFAULT 0,
            name TEXT,
            pid INTEGER DEFAULT 0,
            filename TEXT,
            size INTEGER DEFAULT 0,
            addtime TEXT
        )
    ''')
    
    # Config table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS config (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            value TEXT
        )
    ''')
    
    # Insert default admin user (password: admin123, change immediately!)
    import hashlib
    salt = 'default_salt_change_me'
    password = hashlib.md5(('admin123' + salt).encode()).hexdigest()
    
    try:
        cursor.execute('''
            INSERT INTO users (username, password, salt) 
            VALUES (?, ?, ?)
        ''', ('admin', password, salt))
    except sqlite3.IntegrityError:
        pass  # User already exists
    
    # Insert default configs
    default_configs = [
        ('language', 'en'),
        ('webserver', 'nginx'),
        ('backup_path', '/www/backup'),
        ('sites_path', '/www/wwwroot'),
    ]
    
    for name, value in default_configs:
        try:
            cursor.execute('''
                INSERT INTO config (name, value) VALUES (?, ?)
            ''', (name, value))
        except sqlite3.IntegrityError:
            pass
    
    conn.commit()
    conn.close()
    
    print(f"Database initialized at {DB_PATH}")
    print("Default admin user created: admin / admin123")
    print("⚠️  CHANGE PASSWORD IMMEDIATELY!")

if __name__ == "__main__":
    init_database()
```

**Checklist:**
- [ ] Database file đã tạo
- [ ] Tất cả tables đã có
- [ ] Default admin user đã tạo
- [ ] Foreign keys hoạt động

---

### Task 1.5: Cài đặt Development Tools

#### 1.5.1 Code Quality Tools
```bash
pip install pytest black flake8 mypy
```

#### 1.5.2 Tạo Configuration Files

**File: pyproject.toml**
```toml
[tool.black]
line-length = 100
target-version = ['py38']
include = '\.pyi?$'
exclude = '''
/(
    \.git
    | \.venv
    | venv
    | __pycache__
    | \.mypy_cache
)/
'''

[tool.mypy]
python_version = "3.8"
warn_return_any = true
warn_unused_configs = true
ignore_missing_imports = true

[tool.pytest.ini_options]
testpaths = ["tests"]
python_files = "test_*.py"
python_functions = "test_*"
```

**File: .flake8**
```ini
[flake8]
max-line-length = 100
exclude = .git,__pycache__,venv,.venv
ignore = E501,W503
```

**File: .gitignore**
```
# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
venv/
.venv/
*.egg-info/
dist/
build/

# IDE
.idea/
.vscode/
*.swp
*.swo

# Project specific
data/*.db
logs/*.log
ssl/*.pem
config/*.json
!config/example.json

# OS
.DS_Store
Thumbs.db
```

**Checklist:**
- [ ] pytest hoạt động
- [ ] black format code được
- [ ] flake8 lint được
- [ ] .gitignore đã cấu hình

---

### Task 1.6: Tạo cấu trúc thư mục dự án

```bash
#!/bin/bash
# scripts/create_structure.sh

BASE_DIR="/www/server/panel"

# Create directories
mkdir -p $BASE_DIR/{BTPanel,class,class_v2,plugin,config,data,ssl,logs,scripts,tests}
mkdir -p $BASE_DIR/BTPanel/{static,templates,languages}
mkdir -p $BASE_DIR/BTPanel/static/{js,css,img,language}
mkdir -p $BASE_DIR/BTPanel/templates/{default,error}
mkdir -p $BASE_DIR/BTPanel/languages/all

# Create __init__.py files
touch $BASE_DIR/BTPanel/__init__.py
touch $BASE_DIR/class/__init__.py
touch $BASE_DIR/class_v2/__init__.py

# Create placeholder config files
echo "7800" > $BASE_DIR/data/port.pl
echo "" > $BASE_DIR/data/admin_path.pl

# Set permissions
chmod 755 $BASE_DIR
chmod 700 $BASE_DIR/data
chmod 700 $BASE_DIR/ssl
chmod 755 $BASE_DIR/logs

echo "Project structure created at $BASE_DIR"
```

**Cấu trúc thư mục hoàn chỉnh:**
```
/www/server/panel/
├── BT-Panel                    # Main entry point (to be created)
├── BT-Task                     # Background task processor (to be created)
├── BTPanel/
│   ├── __init__.py             # Flask app initialization
│   ├── app.py                  # App configuration
│   ├── static/
│   │   ├── js/
│   │   ├── css/
│   │   ├── img/
│   │   └── language/
│   ├── templates/
│   │   ├── default/
│   │   └── error/
│   └── languages/
│       └── all/
├── class/                      # Feature modules (v1)
│   ├── __init__.py
│   ├── public.py               # Public utilities
│   ├── db.py                   # Database wrapper
│   ├── panelSite.py            # Site management
│   ├── database.py             # Database management
│   ├── ftp.py                  # FTP management
│   ├── firewalls.py            # Firewall management
│   ├── files.py                # File management
│   ├── crontab.py              # Cron management
│   ├── config.py               # Config management
│   ├── system.py               # System info
│   ├── ajax.py                 # AJAX handlers
│   └── userlogin.py            # Authentication
├── class_v2/                   # Feature modules (v2)
│   └── __init__.py
├── plugin/                     # Plugins directory
├── config/                     # JSON config files
│   └── example.json
├── data/                       # Runtime config (.pl files)
│   ├── port.pl
│   └── admin_path.pl
├── ssl/                        # SSL certificates
├── logs/                       # Log files
├── scripts/                    # Utility scripts
│   ├── init_db.py
│   └── create_structure.sh
├── tests/                      # Test files
│   └── __init__.py
├── requirements.txt
├── pyproject.toml
├── .flake8
└── .gitignore
```

**Checklist:**
- [ ] Tất cả thư mục đã tạo
- [ ] Permissions đúng
- [ ] __init__.py files có
- [ ] Placeholder configs có

---

## 📦 Deliverables

| Deliverable | Mô tả | Status |
|-------------|-------|--------|
| Python Environment | Python 3.8+ với venv | ⬜ |
| Dependencies | Tất cả packages trong requirements.txt | ⬜ |
| Project Structure | Cấu trúc thư mục hoàn chỉnh | ⬜ |
| Database | SQLite với schema cơ bản | ⬜ |
| Dev Tools | pytest, black, flake8, mypy | ⬜ |
| Configuration | pyproject.toml, .flake8, .gitignore | ⬜ |

---

## ✅ Definition of Done

- [ ] `python --version` trả về 3.8+
- [ ] `pip list` hiện tất cả dependencies
- [ ] Cấu trúc thư mục đúng theo spec
- [ ] `python scripts/init_db.py` tạo database thành công
- [ ] `pytest` chạy không lỗi
- [ ] `black --check .` pass
- [ ] `flake8` không có errors

---

## 🔗 Phase tiếp theo

➡️ [Phase 2: Web Server Core](./phase-02-web-server-core.md)
