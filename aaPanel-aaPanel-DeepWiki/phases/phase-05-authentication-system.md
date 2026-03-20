# Phase 5: Authentication System

> **Thời gian ước tính**: 2-3 tuần  
> **Độ ưu tiên**: Cao  
> **Dependencies**: Phase 4 hoàn thành

---

## 📚 Tài liệu tham khảo

| File | Mô tả |
|------|-------|
| [Authentication-and-Session-Management.md](../Authentication-and-Session-Management.md) | Chi tiết auth system |
| [CSRF-Protection.md](../CSRF-Protection.md) | CSRF protection |
| [Basic-Authentication-Setup.md](../Basic-Authentication-Setup.md) | Basic auth setup |
| [Security-and-Input-Validation.md](../Security-and-Input-Validation.md) | Security validation |

---

## 🎯 Mục tiêu Phase

1. Implement username/password authentication
2. Implement Two-Factor Authentication (2FA)
3. Implement rate limiting
4. Implement CSRF protection
5. Implement session management
6. Implement QR code authentication (optional)

---

## 📋 Chi tiết Tasks

### Task 5.1: Username/Password Authentication

#### 5.1.1 Create userlogin Class

**File: class/userlogin.py**
```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
User Authentication Module
"""

import os
import sys
import time
import json
import hashlib

sys.path.insert(0, '/www/server/panel')
import public
from flask import session, request, g

class userlogin:
    """Handle user authentication"""
    
    def __init__(self):
        self._cache = public.cache
    
    def request_post(self, get):
        """
        Handle login POST request
        
        Expected params:
        - username: encrypted username
        - password: encrypted password
        - code: 2FA code (optional)
        """
        
        # Rate limiting check
        limit_result = self.limit_address()
        if limit_result:
            return limit_result
        
        # Decrypt credentials
        try:
            username = self.rsa_decrypt(get.username)
            password = self.rsa_decrypt(get.password)
        except Exception as e:
            return public.returnJson(False, 'Decryption failed')
        
        # Validate input
        if not username or not password:
            return public.returnJson(False, 'Username and password required')
        
        if len(username) > 64 or len(password) > 64:
            return public.returnJson(False, 'Invalid credentials length')
        
        # Get user from database
        user = self.get_user(username)
        if not user:
            self.increment_failed_attempts()
            return public.returnJson(False, 'Invalid username or password')
        
        # Verify password
        if not self.verify_password(password, user['password'], user['salt']):
            self.increment_failed_attempts()
            return public.returnJson(False, 'Invalid username or password')
        
        # Check 2FA
        if self.is_2fa_enabled():
            if not get.code:
                return public.returnJson(False, '2FA code required', code=1)
            
            if not self.verify_2fa(get.code):
                return public.returnJson(False, 'Invalid 2FA code')
        
        # Login successful
        self.reset_failed_attempts()
        self._set_login_session(user)
        
        # Log login
        public.WriteLog('Login', f"User {username} logged in from {g.client_ip}")
        
        return public.returnJson(True, 'Login successful')
    
    def get_user(self, username):
        """Get user by username"""
        import db
        sql = db.Sql()
        return sql.table('users').where('username=?', (username,)).find()
    
    def verify_password(self, password, stored_hash, salt):
        """Verify password against stored hash"""
        password_hash = hashlib.md5((password + salt).encode()).hexdigest()
        return password_hash == stored_hash
    
    def rsa_decrypt(self, encrypted_data):
        """Decrypt RSA encrypted data"""
        try:
            from Crypto.PublicKey import RSA
            from Crypto.Cipher import PKCS1_v1_5
            import base64
            
            # Load private key
            key_file = '/www/server/panel/data/private_key.pem'
            if not os.path.exists(key_file):
                # Fallback: return as-is (not encrypted)
                return encrypted_data
            
            private_key = RSA.import_key(public.readFile(key_file))
            cipher = PKCS1_v1_5.new(private_key)
            
            # Decode and decrypt
            encrypted_bytes = base64.b64decode(encrypted_data)
            decrypted = cipher.decrypt(encrypted_bytes, None)
            
            return decrypted.decode('utf-8') if decrypted else encrypted_data
        except:
            return encrypted_data
```

#### 5.1.2 Session Creation

```python
def _set_login_session(self, user):
    """Create login session"""
    
    # Set session data
    session['login'] = True
    session['username'] = user['username']
    session['uid'] = user['id']
    session['login_time'] = time.time()
    
    # Bind to user agent (prevent session hijacking)
    session['login_user_agent'] = hashlib.md5(
        request.user_agent.string.encode()
    ).hexdigest()
    
    # Set session timeout
    timeout_hours = 24
    timeout_file = '/www/server/panel/data/session_timeout.pl'
    if os.path.exists(timeout_file):
        try:
            timeout_hours = int(public.readFile(timeout_file).strip())
        except:
            pass
    
    session['session_timeout'] = time.time() + (timeout_hours * 3600)
    
    # Generate CSRF token
    self.set_request_token()
    
    # Update last login info
    import db
    sql = db.Sql()
    sql.table('users').where('id=?', (user['id'],)).update({
        'login_ip': g.client_ip,
        'login_time': public.getDate()
    })
```

---

### Task 5.2: Two-Factor Authentication (2FA)

#### 5.2.1 TOTP Implementation

```python
import pyotp

def is_2fa_enabled(self):
    """Check if 2FA is enabled"""
    secret_file = '/www/server/panel/data/two_step_auth.txt'
    return os.path.exists(secret_file)

def get_2fa_secret(self):
    """Get 2FA secret key"""
    secret_file = '/www/server/panel/data/two_step_auth.txt'
    if os.path.exists(secret_file):
        return public.readFile(secret_file).strip()
    return None

def verify_2fa(self, code):
    """Verify TOTP code"""
    secret = self.get_2fa_secret()
    if not secret:
        return True  # 2FA not enabled
    
    try:
        totp = pyotp.TOTP(secret)
        
        # Verify with time window (allow 1 code before/after for clock drift)
        if totp.verify(code, valid_window=1):
            # Trust this IP for 24 hours
            self.add_trusted_ip()
            return True
        
        return False
    except:
        return False

def add_trusted_ip(self):
    """Add current IP to trusted IPs for 24 hours"""
    trusted_file = '/www/server/panel/data/two_step_trusted_ips.json'
    
    try:
        if os.path.exists(trusted_file):
            trusted = json.loads(public.readFile(trusted_file))
        else:
            trusted = {}
        
        # Add/update IP with expiry
        trusted[g.client_ip] = time.time() + (24 * 3600)
        
        # Clean expired entries
        current_time = time.time()
        trusted = {ip: exp for ip, exp in trusted.items() if exp > current_time}
        
        public.writeFile(trusted_file, json.dumps(trusted))
    except:
        pass

def is_ip_trusted(self):
    """Check if current IP is trusted for 2FA"""
    trusted_file = '/www/server/panel/data/two_step_trusted_ips.json'
    
    if not os.path.exists(trusted_file):
        return False
    
    try:
        trusted = json.loads(public.readFile(trusted_file))
        expiry = trusted.get(g.client_ip, 0)
        return expiry > time.time()
    except:
        return False

def setup_2fa(self, get):
    """Setup 2FA for user"""
    
    # Generate new secret
    secret = pyotp.random_base32()
    
    # Generate provisioning URI for QR code
    totp = pyotp.TOTP(secret)
    provisioning_uri = totp.provisioning_uri(
        name=session.get('username', 'admin'),
        issuer_name='Web Panel'
    )
    
    # Return for display (don't save until verified)
    return public.returnJson(True, 'Setup 2FA', {
        'secret': secret,
        'qr_uri': provisioning_uri
    })

def enable_2fa(self, get):
    """Enable 2FA after verification"""
    
    secret = get.secret
    code = get.code
    
    if not secret or not code:
        return public.returnJson(False, 'Secret and code required')
    
    # Verify the code works
    totp = pyotp.TOTP(secret)
    if not totp.verify(code, valid_window=1):
        return public.returnJson(False, 'Invalid code')
    
    # Save secret
    public.writeFile('/www/server/panel/data/two_step_auth.txt', secret)
    
    public.WriteLog('Security', '2FA enabled')
    return public.returnJson(True, '2FA enabled successfully')

def disable_2fa(self, get):
    """Disable 2FA"""
    
    # Verify current code first
    if not self.verify_2fa(get.code):
        return public.returnJson(False, 'Invalid 2FA code')
    
    # Remove secret file
    secret_file = '/www/server/panel/data/two_step_auth.txt'
    if os.path.exists(secret_file):
        os.remove(secret_file)
    
    public.WriteLog('Security', '2FA disabled')
    return public.returnJson(True, '2FA disabled')
```

---

### Task 5.3: Rate Limiting

```python
def limit_address(self):
    """
    Rate limiting for login attempts
    Returns error response if rate limited, None otherwise
    """
    
    cache_key = f"login_limit_{g.client_ip}"
    
    # Get current attempt count
    attempt_data = self._cache.get(cache_key)
    
    if attempt_data:
        attempts, block_until = attempt_data
        
        # Check if still blocked
        if block_until and time.time() < block_until:
            remaining = int(block_until - time.time())
            return public.returnJson(
                False, 
                f'Too many failed attempts. Try again in {remaining} seconds'
            )
        
        # Check attempt count
        if attempts >= 5:
            # Block for increasing duration
            block_duration = min(300 * (attempts - 4), 3600)  # Max 1 hour
            block_until = time.time() + block_duration
            
            self._cache.set(cache_key, (attempts, block_until), timeout=3600)
            
            return public.returnJson(
                False,
                f'Account locked. Try again in {block_duration} seconds'
            )
    
    return None

def increment_failed_attempts(self):
    """Increment failed login attempt counter"""
    
    cache_key = f"login_limit_{g.client_ip}"
    
    attempt_data = self._cache.get(cache_key)
    if attempt_data:
        attempts, block_until = attempt_data
        attempts += 1
    else:
        attempts = 1
        block_until = None
    
    # Store with 1 hour TTL
    self._cache.set(cache_key, (attempts, block_until), timeout=3600)

def reset_failed_attempts(self):
    """Reset failed attempts after successful login"""
    
    cache_key = f"login_limit_{g.client_ip}"
    self._cache.delete(cache_key)
```

---

### Task 5.4: CSRF Protection

#### 5.4.1 Token Generation

```python
def set_request_token(self):
    """Generate and set CSRF token"""
    import secrets
    
    # Generate random token
    token = secrets.token_hex(32)
    
    # Store in session
    session['request_token'] = token
    session['request_token_head'] = token[:16]  # For header check
    
    return token

def get_request_token(self):
    """Get current CSRF token"""
    return session.get('request_token', '')
```

#### 5.4.2 Token Validation

**File: BTPanel/__init__.py (add to publicObject)**
```python
def check_csrf():
    """
    Validate CSRF token
    Returns error message on failure, None on success
    """
    
    # Skip for safe methods
    if request.method in ['GET', 'HEAD', 'OPTIONS']:
        return None
    
    # Get token from request
    request_token = request.form.get('request_token') or \
                    request.headers.get('X-CSRF-Token') or \
                    request.args.get('request_token')
    
    if not request_token:
        return 'CSRF token missing'
    
    # Get token from session
    session_token = session.get('request_token')
    
    if not session_token:
        return 'Session expired'
    
    # Compare tokens
    if request_token != session_token:
        return 'Invalid CSRF token'
    
    return None

def check_csrf_websocket(ws, data):
    """Validate CSRF token for WebSocket connections"""
    
    token = data.get('request_token') or data.get('csrf_token')
    session_token = session.get('request_token')
    
    if not token or not session_token:
        return False
    
    return token == session_token
```

---

### Task 5.5: Session Management

#### 5.5.1 Session Validation

```python
def validate_session():
    """
    Validate current session
    Called from before_request
    """
    
    # Check if logged in
    if not session.get('login'):
        return False
    
    # Check session timeout
    timeout = session.get('session_timeout', 0)
    if timeout and time.time() > timeout:
        session.clear()
        return False
    
    # Check user agent binding
    stored_ua = session.get('login_user_agent')
    if stored_ua:
        current_ua = hashlib.md5(request.user_agent.string.encode()).hexdigest()
        if stored_ua != current_ua:
            # User agent changed - possible session hijacking
            session.clear()
            return False
    
    return True
```

#### 5.5.2 Logout

```python
def do_logout(self):
    """Handle logout"""
    
    username = session.get('username', 'unknown')
    
    # Clear session
    session.clear()
    
    # Log logout
    public.WriteLog('Login', f"User {username} logged out")
    
    return public.returnJson(True, 'Logged out')
```

---

### Task 5.6: Login Route

**File: BTPanel/__init__.py**
```python
@app.route('/login', methods=['GET', 'POST'])
def login():
    """Login page and handler"""
    
    if request.method == 'GET':
        # Check if already logged in
        if session.get('login'):
            return redirect(admin_path or '/')
        
        # Render login page
        return render_template('login.html', **{
            'title': 'Login',
            'background': get_login_background(),
        })
    
    # POST - handle login
    from userlogin import userlogin
    login_handler = userlogin()
    
    get = get_input()
    result = login_handler.request_post(get)
    
    return result

@app.route('/logout')
def logout():
    """Logout handler"""
    from userlogin import userlogin
    return userlogin().do_logout()

def get_login_background():
    """Get login page background image"""
    bg_file = '/www/server/panel/data/login_bg.pl'
    if os.path.exists(bg_file):
        return public.readFile(bg_file).strip()
    return '/static/img/login_bg.jpg'
```

---

### Task 5.7: Authentication Decorator

```python
from functools import wraps

def login_required(f):
    """Decorator to require login"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get('login'):
            if request.is_xhr or request.path.startswith('/api/'):
                return public.returnJson(False, 'Login required'), 401
            return redirect('/login')
        
        if not validate_session():
            if request.is_xhr or request.path.startswith('/api/'):
                return public.returnJson(False, 'Session expired'), 401
            return redirect('/login')
        
        return f(*args, **kwargs)
    return decorated_function

def admin_required(f):
    """Decorator to require admin login"""
    @wraps(f)
    @login_required
    def decorated_function(*args, **kwargs):
        # Add additional admin checks here if needed
        return f(*args, **kwargs)
    return decorated_function
```

---

## 📦 Deliverables

| Deliverable | Mô tả | Status |
|-------------|-------|--------|
| userlogin class | Main auth handler | ⬜ |
| RSA encryption | Credential encryption | ⬜ |
| Password hashing | MD5 + salt | ⬜ |
| 2FA (TOTP) | PyOTP integration | ⬜ |
| Rate limiting | IP-based tracking | ⬜ |
| CSRF protection | Token generation/validation | ⬜ |
| Session management | Timeout, UA binding | ⬜ |
| Login/logout routes | /login, /logout | ⬜ |
| Auth decorators | @login_required | ⬜ |

---

## ✅ Definition of Done

- [ ] Login với username/password hoạt động
- [ ] 2FA setup và verify hoạt động
- [ ] Rate limiting block sau 5 fails
- [ ] CSRF tokens được validate
- [ ] Session timeout hoạt động
- [ ] Logout clear session

---

## 🔗 Navigation

⬅️ [Phase 4: Request Processing Pipeline](./phase-04-request-processing-pipeline.md)  
➡️ [Phase 6: Module System & Routing](./phase-06-module-system-routing.md)
