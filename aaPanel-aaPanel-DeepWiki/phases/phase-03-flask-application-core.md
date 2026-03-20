# Phase 3: Flask Application Core

> **Thời gian ước tính**: 2-3 tuần  
> **Độ ưu tiên**: Cao  
> **Dependencies**: Phase 2 hoàn thành

---

## 📚 Tài liệu tham khảo

| File | Mô tả |
|------|-------|
| [Flask-Application-Core.md](../Flask-Application-Core.md) | Chi tiết Flask initialization |
| [Configuration-Management.md](../Configuration-Management.md) | Cấu hình hệ thống |
| [Authentication-and-Session-Management.md](../Authentication-and-Session-Management.md) | Session management |
| [Debug-Mode.md](../Debug-Mode.md) | Debug mode configuration |

---

## 🎯 Mục tiêu Phase

1. Khởi tạo Flask application
2. Tích hợp Flask extensions (Compress, Sock, Session)
3. Implement custom session storage (SimpleCacheSession)
4. Configure security settings (secret key, cookies)
5. Implement admin path customization
6. Setup debug mode với file watching

---

## 📋 Chi tiết Tasks

### Task 3.1: Flask Application Initialization

#### 3.1.1 Create Flask App Instance

**File: BTPanel/__init__.py**
```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
BTPanel - Flask Application Core
"""

import os
import sys
import re
import hashlib
import json

# Add project path
_PATH = '/www/server/panel'
sys.path.insert(0, _PATH)

from flask import Flask, request, session, g, redirect, abort
from flask import render_template, send_file, make_response
from flask_compress import Compress

# Try to import WebSocket support
try:
    from flask_sock import Sock
    sockets = None
except ImportError:
    from flask_sockets import Sockets as Sock
    sockets = None

import public

# Get template folder from config
def get_template_folder():
    """Get template folder path"""
    template_name = 'default'
    template_file = os.path.join(_PATH, 'data/templates.pl')
    if os.path.exists(template_file):
        template_name = public.readFile(template_file).strip() or 'default'
    return os.path.join(_PATH, 'BTPanel/templates', template_name)

# Initialize Flask app
app = Flask(
    __name__,
    template_folder=get_template_folder(),
    static_folder=os.path.join(_PATH, 'BTPanel/static')
)

# Initialize extensions
Compress(app)

# WebSocket support
try:
    from flask_sock import Sock
    sockets = Sock(app)
except ImportError:
    try:
        from flask_sockets import Sockets
        sockets = Sockets(app)
    except:
        sockets = None
```

**Checklist:**
- [ ] Flask app được khởi tạo
- [ ] Template folder động
- [ ] Static folder đúng path
- [ ] Extensions được import

---

### Task 3.2: Flask Extensions Integration

#### 3.2.1 Response Compression

```python
# Already initialized above
Compress(app)

# Optional: Configure compression settings
app.config['COMPRESS_MIMETYPES'] = [
    'text/html',
    'text/css',
    'text/xml',
    'application/json',
    'application/javascript'
]
app.config['COMPRESS_LEVEL'] = 6
app.config['COMPRESS_MIN_SIZE'] = 500
```

#### 3.2.2 WebSocket Support

```python
# WebSocket initialization with fallback
def init_websocket(app):
    """Initialize WebSocket support"""
    global sockets
    
    try:
        from flask_sock import Sock
        sockets = Sock(app)
        print("Using flask_sock for WebSocket")
    except ImportError:
        try:
            from flask_sockets import Sockets
            sockets = Sockets(app)
            print("Using flask_sockets for WebSocket")
        except ImportError:
            sockets = None
            print("WebSocket support not available")
    
    return sockets

sockets = init_websocket(app)
```

---

### Task 3.3: Session Management

#### 3.3.1 SimpleCacheSession Implementation

```python
from cachelib import SimpleCache
from flask_session import Session

class SimpleCacheSession(SimpleCache):
    """Custom session storage with capacity limit"""
    
    def __init__(self, threshold=1000, default_timeout=86400):
        """
        Args:
            threshold: Maximum number of entries
            default_timeout: Default TTL in seconds (24 hours)
        """
        super().__init__(threshold=threshold, default_timeout=default_timeout)
        self._threshold = threshold
        self._default_timeout = default_timeout
    
    def set(self, key, value, timeout=None):
        """Set with automatic cleanup"""
        if timeout is None:
            timeout = self._default_timeout
        return super().set(key, value, timeout)

# Create session storage
session_cache = SimpleCacheSession(threshold=1000, default_timeout=86400)
```

#### 3.3.2 Session Configuration

```python
import psutil

def configure_session(app):
    """Configure Flask session"""
    
    # Generate secret key from system info
    system_info = str(os.uname()) + str(psutil.boot_time())
    secret_key = hashlib.md5(system_info.encode()).hexdigest()
    
    app.secret_key = secret_key
    
    # Session configuration
    app.config['SESSION_TYPE'] = 'cachelib'
    app.config['SESSION_CACHELIB'] = session_cache
    app.config['SESSION_PERMANENT'] = True
    app.config['SESSION_USE_SIGNER'] = True
    app.config['SESSION_KEY_PREFIX'] = 'BT_:'
    app.config['SESSION_COOKIE_NAME'] = hashlib.md5(secret_key.encode()).hexdigest()[:16]
    app.config['PERMANENT_SESSION_LIFETIME'] = 86400 * 30  # 30 days
    
    # SSL-specific settings
    is_ssl = os.path.exists(os.path.join(_PATH, 'data/ssl.pl'))
    if is_ssl:
        app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
        app.config['SESSION_COOKIE_SECURE'] = True
    else:
        app.config['SESSION_COOKIE_SAMESITE'] = None
        app.config['SESSION_COOKIE_SECURE'] = False
    
    # Initialize session
    Session(app)

configure_session(app)
```

---

### Task 3.4: Security Configuration

#### 3.4.1 Secret Key Generation

```python
def generate_secret_key():
    """Generate deterministic secret key from system"""
    import psutil
    
    # Combine system-specific data
    uname = str(os.uname())
    boot_time = str(psutil.boot_time())
    
    # Create stable hash
    data = uname + boot_time
    return hashlib.md5(data.encode()).hexdigest()

app.secret_key = generate_secret_key()
```

#### 3.4.2 Admin Path Configuration

```python
def get_admin_path():
    """Get custom admin path with validation"""
    
    # Reserved paths that cannot be used as admin path
    reserved_paths = [
        '/login', '/site', '/ftp', '/database', '/firewall',
        '/files', '/crontab', '/config', '/plugin', '/task',
        '/ajax', '/system', '/ssl', '/download', '/upload',
        '/static', '/public', '/hook', '/api', '/v2',
        '/webssh', '/sock_shell', '/ws_panel',
        '/error', '/logout', '/safe', '/soft', '/control',
        '/project', '/docker', '/dns', '/mail', '/waf'
    ]
    
    admin_path = '/'
    path_file = os.path.join(_PATH, 'data/admin_path.pl')
    
    if os.path.exists(path_file):
        custom_path = public.readFile(path_file).strip()
        if custom_path:
            # Ensure path starts with /
            if not custom_path.startswith('/'):
                custom_path = '/' + custom_path
            
            # Check against reserved paths
            if custom_path.lower() in [p.lower() for p in reserved_paths]:
                admin_path = '/bt'  # Fallback
            else:
                admin_path = custom_path
    
    return admin_path

admin_path = get_admin_path()
route_path = admin_path if admin_path != '/' else ''
```

#### 3.4.3 URI and Session Validation Patterns

```python
# URI validation pattern
# Allows: static files or alphanumeric paths
uri_match = re.compile(
    r'^/static/.*\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|map)$|'
    r'^/[\w./-]*$'
)

# Session ID validation pattern
# Allows: alphanumeric, dots, hyphens
session_id_match = re.compile(r'^[\w.-]+$')
```

---

### Task 3.5: Application Configuration

#### 3.5.1 Debug Mode Configuration

```python
def configure_debug_mode(app):
    """Configure debug mode settings"""
    
    is_debug = os.path.exists(os.path.join(_PATH, 'data/debug.pl'))
    
    app.config['DEBUG'] = is_debug
    
    if is_debug:
        # Enable detailed error pages
        app.config['PROPAGATE_EXCEPTIONS'] = True
        app.config['PRESERVE_CONTEXT_ON_EXCEPTION'] = True
        
        # Setup file watching for auto-reload
        try:
            import pyinotify
            
            class FileChangeHandler(pyinotify.ProcessEvent):
                def process_IN_MODIFY(self, event):
                    if event.pathname.endswith('.py'):
                        print(f"File changed: {event.pathname}")
                        # Trigger reload
            
            # Note: Full implementation requires integration with BT-Panel
        except ImportError:
            pass

configure_debug_mode(app)
```

#### 3.5.2 Basic Auth Configuration

```python
def configure_basic_auth(app):
    """Configure optional HTTP Basic Authentication"""
    
    config_file = os.path.join(_PATH, 'config/basic_auth.json')
    
    if os.path.exists(config_file):
        try:
            config = json.loads(public.readFile(config_file))
            app.config['BASIC_AUTH_OPEN'] = config.get('open', False)
            app.config['BASIC_AUTH_USERNAME'] = config.get('username', '')
            app.config['BASIC_AUTH_PASSWORD'] = config.get('password', '')
        except:
            app.config['BASIC_AUTH_OPEN'] = False
    else:
        app.config['BASIC_AUTH_OPEN'] = False

configure_basic_auth(app)
```

---

### Task 3.6: Global Cache System

#### 3.6.1 SimpleCache Implementation

```python
from cachelib import SimpleCache

# Global cache instance
cache = SimpleCache(threshold=5000, default_timeout=300)

# Common cache keys
"""
Cache Key Reference:
- p_token: Panel token (MAC-based), permanent
- dologin: Logout flag, session-based
- bt_home_node: Home node update flag, 3600s
- codeStr: Verification code, 180s
- codeOut: Code generation throttle, 0.1s
- login_token_{ip}: Temporary login token, 120s
- limit_{ip}: Rate limit counter, varies
"""
```

#### 3.6.2 Common Objects

```python
# Common request object wrapper
class RequestParamWrapper:
    """Wrapper for request parameters"""
    
    def __init__(self):
        self._data = {}
    
    def __getattr__(self, name):
        if name.startswith('_'):
            return object.__getattribute__(self, name)
        return self._data.get(name, '')
    
    def __setattr__(self, name, value):
        if name.startswith('_'):
            object.__setattr__(self, name, value)
        else:
            self._data[name] = value
    
    def get(self, name, default=''):
        return self._data.get(name, default)
    
    def set(self, name, value):
        self._data[name] = value

def get_input():
    """Get unified request parameters"""
    params = RequestParamWrapper()
    
    # Get from request.form (POST)
    for key, value in request.form.items():
        params.set(key, value)
    
    # Get from request.args (GET)
    for key, value in request.args.items():
        if not params.get(key):
            params.set(key, value)
    
    # Get action from query string
    if not params.action:
        params.action = request.args.get('action', '')
    
    return params
```

---

### Task 3.7: Error Handlers

```python
@app.errorhandler(404)
def error_404(error):
    """Handle 404 Not Found"""
    if request.path.startswith('/api/') or request.is_xhr:
        return public.returnJson(False, 'Not Found'), 404
    return render_template('error/404.html'), 404

@app.errorhandler(403)
def error_403(error):
    """Handle 403 Forbidden"""
    if request.path.startswith('/api/') or request.is_xhr:
        return public.returnJson(False, 'Forbidden'), 403
    return render_template('error/403.html'), 403

@app.errorhandler(405)
def error_405(error):
    """Handle 405 Method Not Allowed"""
    return public.returnJson(False, 'Method Not Allowed'), 405

@app.errorhandler(500)
def error_500(error):
    """Handle 500 Internal Server Error"""
    # Log the error
    import traceback
    public.writeFile(
        'logs/error.log',
        f"{public.getDate()}: {traceback.format_exc()}\n",
        mode='a'
    )
    
    if request.path.startswith('/api/') or request.is_xhr:
        return public.returnJson(False, 'Internal Server Error'), 500
    return render_template('error/500.html'), 500
```

---

### Task 3.8: Template Helpers

```python
@app.context_processor
def inject_globals():
    """Inject global variables into templates"""
    return {
        'admin_path': admin_path,
        'panel_name': 'Web Panel',
        'version': '1.0.0',
        'language': public.GetLanguage(),
        'is_ssl': os.path.exists(os.path.join(_PATH, 'data/ssl.pl')),
    }

@app.template_filter('json')
def json_filter(obj):
    """Convert object to JSON string"""
    return json.dumps(obj)

@app.template_filter('date')
def date_filter(timestamp, format='%Y-%m-%d %H:%M:%S'):
    """Format timestamp"""
    import time
    return time.strftime(format, time.localtime(timestamp))
```

---

## 📦 Deliverables

| Deliverable | Mô tả | Status |
|-------------|-------|--------|
| BTPanel/__init__.py | Flask app initialization | ⬜ |
| Flask extensions | Compress, Sock, Session | ⬜ |
| SimpleCacheSession | Custom session storage | ⬜ |
| Security config | Secret key, cookies | ⬜ |
| Admin path | Customizable admin URL | ⬜ |
| Debug mode | File watching, detailed errors | ⬜ |
| Error handlers | 404, 403, 405, 500 | ⬜ |
| Template helpers | Context processor, filters | ⬜ |

---

## ✅ Definition of Done

- [ ] `from BTPanel import app` không lỗi
- [ ] Session hoạt động (set/get)
- [ ] Compression hoạt động
- [ ] Error handlers trả response đúng
- [ ] Admin path có thể customize
- [ ] Debug mode bật/tắt được

---

## 🔗 Navigation

⬅️ [Phase 2: Web Server Core](./phase-02-web-server-core.md)  
➡️ [Phase 4: Request Processing Pipeline](./phase-04-request-processing-pipeline.md)
