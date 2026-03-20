# Phase 4: Request Processing Pipeline

> **Thời gian ước tính**: 2-3 tuần  
> **Độ ưu tiên**: Cao  
> **Dependencies**: Phase 3 hoàn thành

---

## 📚 Tài liệu tham khảo

| File | Mô tả |
|------|-------|
| [Request-Processing-Pipeline.md](../Request-Processing-Pipeline.md) | Chi tiết request lifecycle |
| [Security-and-Input-Validation.md](../Security-and-Input-Validation.md) | Input validation |
| [Authentication-and-Session-Management.md](../Authentication-and-Session-Management.md) | Auth flow |

---

## 🎯 Mục tiêu Phase

1. Implement `@app.before_request` hook
2. Implement security validation pipeline
3. Implement input sanitization
4. Implement IP/domain whitelisting
5. Implement static file handling
6. Implement `@app.teardown_request` for logging

---

## 📋 Chi tiết Tasks

### Task 4.1: Before-Request Processing

#### 4.1.1 Main Request Check Function

```python
@app.before_request
def request_check():
    """
    Multi-stage validation pipeline
    Runs before every request
    """
    
    # Stage 1: Get real client IP (CDN/proxy support)
    g.client_ip = get_real_ip()
    
    # Stage 2: HTTP method validation
    if request.method not in ['GET', 'POST', 'HEAD']:
        abort(404)
    
    # Stage 3: URI length check
    if len(request.path) > 256:
        abort(403)
    if len(request.url) > 1024:
        abort(403)
    
    # Stage 4: URI pattern validation
    if not validate_uri_pattern(request.path):
        abort(403)
    
    # Stage 5: POST parameter filtering (specific routes)
    if request.method == 'POST':
        if not validate_post_params():
            abort(403)
    
    # Stage 6: Session ID validation
    session_id = request.cookies.get(app.config.get('SESSION_COOKIE_NAME', 'session'))
    if session_id and not validate_session_id(session_id):
        abort(403)
    
    # Stage 7: Basic authentication (optional layer)
    basic_auth_response = check_basic_auth()
    if basic_auth_response:
        return basic_auth_response
    
    # Stage 8: IP whitelist check
    ip_check_response = check_ip_whitelist()
    if ip_check_response:
        return ip_check_response
    
    # Stage 9: Static file authentication
    if '/static/' in request.path:
        static_auth_response = check_static_auth()
        if static_auth_response:
            return static_auth_response
    
    # Stage 10: Domain whitelist check
    domain_check_response = check_domain_whitelist()
    if domain_check_response:
        return domain_check_response
    
    # Stage 11: Protected path check
    path_check_response = check_protected_paths()
    if path_check_response:
        return path_check_response
```

---

### Task 4.2: Real IP Detection

```python
def get_real_ip():
    """
    Get real client IP from various headers
    Supports CloudFlare, nginx proxy, etc.
    """
    
    # CloudFlare
    cf_ip = request.headers.get('CF-Connecting-IP')
    if cf_ip:
        return cf_ip
    
    # X-Forwarded-For (may contain multiple IPs)
    xff = request.headers.get('X-Forwarded-For')
    if xff:
        # Get first IP (original client)
        return xff.split(',')[0].strip()
    
    # X-Real-IP
    real_ip = request.headers.get('X-Real-IP')
    if real_ip:
        return real_ip
    
    # Fall back to remote_addr
    return request.remote_addr or '127.0.0.1'
```

---

### Task 4.3: URI Validation

#### 4.3.1 URI Pattern Matching

```python
import re

# Compiled regex for performance
uri_pattern = re.compile(
    r'^/static/.*\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|map)$|'
    r'^/[a-zA-Z0-9_./\-]*$'
)

def validate_uri_pattern(path):
    """Validate URI against whitelist pattern"""
    if not path:
        return False
    
    # Check pattern match
    if not uri_pattern.match(path):
        return False
    
    # Additional checks
    # Block path traversal attempts
    if '..' in path:
        return False
    if './' in path:
        return False
    
    return True
```

#### 4.3.2 Session ID Validation

```python
session_id_pattern = re.compile(r'^[\w.\-]+$')

def validate_session_id(session_id):
    """Validate session ID format"""
    if not session_id:
        return True  # No session is valid
    
    if len(session_id) > 128:
        return False
    
    return bool(session_id_pattern.match(session_id))
```

---

### Task 4.4: POST Parameter Filtering

```python
# Routes that require strict parameter validation
FILTERED_ROUTES = [
    '/login', '/safe', '/hook', '/public', '/down',
    '/get_app_bind_status', '/check_bind', '/userRegister', '/userLang'
]

def validate_post_params():
    """Validate POST parameters for filtered routes"""
    
    # Check if current route needs filtering
    needs_filtering = any(
        request.path.startswith(route) 
        for route in FILTERED_ROUTES
    )
    
    if not needs_filtering:
        return True
    
    # Validate each parameter
    for key, value in request.form.items():
        # Key length limit
        if len(key) > 48:
            return False
        
        # Value length limit
        if len(str(value)) > 256:
            return False
        
        # Check for dangerous patterns in key
        if not re.match(r'^[\w\-]+$', key):
            return False
    
    return True
```

---

### Task 4.5: Security Checks

#### 4.5.1 Basic Authentication

```python
from functools import wraps
from flask import Response

def check_basic_auth():
    """Check HTTP Basic Authentication if enabled"""
    
    if not app.config.get('BASIC_AUTH_OPEN'):
        return None
    
    auth = request.authorization
    
    if not auth:
        return send_auth_challenge()
    
    # Verify credentials (hashed)
    username_hash = hashlib.md5(auth.username.encode()).hexdigest()
    password_hash = hashlib.md5(auth.password.encode()).hexdigest()
    
    if (username_hash != app.config.get('BASIC_AUTH_USERNAME') or
        password_hash != app.config.get('BASIC_AUTH_PASSWORD')):
        return send_auth_challenge()
    
    return None

def send_auth_challenge():
    """Send 401 with WWW-Authenticate header"""
    response = Response(
        'Authentication required',
        401,
        {'WWW-Authenticate': 'Basic realm="Panel Login"'}
    )
    return response
```

#### 4.5.2 IP Whitelist Check

```python
def check_ip_whitelist():
    """Check if client IP is allowed"""
    
    whitelist_file = os.path.join(_PATH, 'data/limitip.conf')
    
    if not os.path.exists(whitelist_file):
        return None  # No whitelist = allow all
    
    content = public.readFile(whitelist_file).strip()
    if not content:
        return None
    
    allowed_ips = [ip.strip() for ip in content.split('\n') if ip.strip()]
    
    if not allowed_ips:
        return None
    
    client_ip = g.client_ip
    
    # Check if IP is allowed
    for allowed in allowed_ips:
        if allowed == client_ip:
            return None
        
        # Support CIDR notation
        if '/' in allowed:
            if ip_in_network(client_ip, allowed):
                return None
    
    # IP not in whitelist
    return make_response(
        public.returnJson(False, 'IP not allowed: ' + client_ip),
        403
    )

def ip_in_network(ip, network):
    """Check if IP is in CIDR network"""
    import ipaddress
    try:
        return ipaddress.ip_address(ip) in ipaddress.ip_network(network, strict=False)
    except:
        return False
```

#### 4.5.3 Domain Whitelist Check

```python
def check_domain_whitelist():
    """Check if request domain is allowed"""
    
    whitelist_file = os.path.join(_PATH, 'data/domain.conf')
    
    if not os.path.exists(whitelist_file):
        return None
    
    content = public.readFile(whitelist_file).strip()
    if not content:
        return None
    
    allowed_domains = [d.strip().lower() for d in content.split('\n') if d.strip()]
    
    if not allowed_domains:
        return None
    
    # Get request host
    host = request.host.split(':')[0].lower()
    
    if host in allowed_domains:
        return None
    
    # Check wildcard domains
    for allowed in allowed_domains:
        if allowed.startswith('*.'):
            suffix = allowed[1:]  # Remove *
            if host.endswith(suffix):
                return None
    
    return make_response(
        public.returnJson(False, 'Domain not allowed'),
        403
    )
```

---

### Task 4.6: Static File Handling

```python
def check_static_auth():
    """Check authentication for static files"""
    
    # Some static files don't require auth
    public_patterns = [
        '/static/login.',
        '/static/img/logo',
        '/static/favicon',
    ]
    
    for pattern in public_patterns:
        if pattern in request.path:
            return None
    
    # Require authentication for other static files
    if not session.get('login'):
        abort(401)
    
    return None

def path_safe_check(path):
    """Check path for traversal attempts"""
    
    # Normalize path
    path = path.replace('\\', '/')
    path = re.sub(r'/+', '/', path)
    
    # Block traversal patterns
    dangerous_patterns = ['..', './', '->', '\x00']
    
    for pattern in dangerous_patterns:
        if pattern in path:
            return False
    
    return True

@app.route('/static/<path:filename>')
def serve_static(filename):
    """Serve static files with security checks"""
    
    # Security check
    if not path_safe_check(filename):
        abort(404)
    
    # Build full path
    file_path = os.path.join(app.static_folder, filename)
    
    # Check file exists
    if not os.path.exists(file_path):
        abort(404)
    
    # Check not trying to escape static folder
    real_path = os.path.realpath(file_path)
    if not real_path.startswith(os.path.realpath(app.static_folder)):
        abort(403)
    
    return send_file(file_path)
```

---

### Task 4.7: Input Sanitization

#### 4.7.1 XSS Prevention

```python
import html

def xssdecode(text):
    """Decode and sanitize input for XSS prevention"""
    if not text:
        return ''
    
    if not isinstance(text, str):
        text = str(text)
    
    # URL decode
    try:
        from urllib.parse import unquote
        text = unquote(text)
    except:
        pass
    
    # Remove null bytes
    text = text.replace('\x00', '')
    
    # Normalize paths
    text = text.replace('\\', '/')
    text = re.sub(r'/+', '/', text)
    
    return text

def xsssec(text):
    """Encode output for XSS prevention"""
    if not text:
        return ''
    
    if not isinstance(text, str):
        text = str(text)
    
    # HTML entity encoding
    return html.escape(text)
```

#### 4.7.2 Path Sanitization

```python
def sanitize_path(path):
    """Sanitize file path input"""
    if not path:
        return ''
    
    # Decode
    path = xssdecode(path)
    
    # Normalize
    path = path.replace('\\', '/')
    path = re.sub(r'/+', '/', path)
    
    # Remove dangerous sequences
    path = path.replace('..', '')
    path = path.replace('./', '')
    path = path.replace('->', '')
    
    # Remove leading/trailing slashes for relative paths
    path = path.strip('/')
    
    return path
```

---

### Task 4.8: Teardown Request (Logging)

```python
@app.teardown_request
def request_end(exception=None):
    """
    Post-request processing
    Log request and handle cleanup
    """
    
    # Skip for certain paths
    skip_log_patterns = ['/static/', '/favicon.ico', '/ws_']
    for pattern in skip_log_patterns:
        if pattern in request.path:
            return
    
    # Calculate response time
    if hasattr(g, 'start_time'):
        elapsed = time.time() - g.start_time
    else:
        elapsed = 0
    
    # Log the request
    log_entry = {
        'time': public.getDate(),
        'ip': getattr(g, 'client_ip', request.remote_addr),
        'method': request.method,
        'path': request.path,
        'status': getattr(g, 'response_status', 200),
        'elapsed': round(elapsed * 1000, 2),  # ms
        'user_agent': request.user_agent.string[:100] if request.user_agent else '',
    }
    
    # Log to file (async in production)
    if app.config.get('DEBUG'):
        print(f"[{log_entry['time']}] {log_entry['ip']} {log_entry['method']} "
              f"{log_entry['path']} {log_entry['status']} {log_entry['elapsed']}ms")
    
    # Log errors
    if exception:
        import traceback
        error_log = f"\n[{public.getDate()}] Error: {str(exception)}\n"
        error_log += traceback.format_exc()
        public.writeFile('logs/error.log', error_log, mode='a')

# Start time tracking
@app.before_request
def start_timer():
    g.start_time = time.time()
```

---

## 📦 Deliverables

| Deliverable | Mô tả | Status |
|-------------|-------|--------|
| before_request hook | Multi-stage validation | ⬜ |
| Real IP detection | CDN/proxy support | ⬜ |
| URI validation | Pattern matching | ⬜ |
| POST filtering | Parameter validation | ⬜ |
| Basic auth | Optional auth layer | ⬜ |
| IP whitelist | Access control | ⬜ |
| Domain whitelist | Domain validation | ⬜ |
| XSS prevention | Input/output encoding | ⬜ |
| Request logging | teardown_request | ⬜ |

---

## ✅ Definition of Done

- [ ] Invalid HTTP methods return 404
- [ ] Long URIs return 403
- [ ] Path traversal attempts blocked
- [ ] XSS inputs sanitized
- [ ] IP whitelist enforced when configured
- [ ] All requests logged

---

## 🔗 Navigation

⬅️ [Phase 3: Flask Application Core](./phase-03-flask-application-core.md)  
➡️ [Phase 5: Authentication System](./phase-05-authentication-system.md)
