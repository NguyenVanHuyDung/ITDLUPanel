# Phase 2: Web Server Core (BT-Panel)

> **Thời gian ước tính**: 2-3 tuần  
> **Độ ưu tiên**: Cao  
> **Dependencies**: Phase 1 hoàn thành

---

## 📚 Tài liệu tham khảo

| File | Mô tả |
|------|-------|
| [Web-Server-(BT-Panel).md](../Web-Server-(BT-Panel).md) | Chi tiết về BT-Panel web server |
| [System-Architecture.md](../System-Architecture.md) | Kiến trúc 3 tầng |
| [Process-Management.md](../Process-Management.md) | Quản lý process modes |
| [Worker-Scaling.md](../Worker-Scaling.md) | Dynamic worker scaling |
| [Network-Binding-Modes.md](../Network-Binding-Modes.md) | TCP/Unix socket binding |
| [Configuration-Management.md](../Configuration-Management.md) | Cấu hình hệ thống |

---

## 🎯 Mục tiêu Phase

1. Tạo main entry point (BT-Panel executable)
2. Implement gevent monkey patching
3. Implement daemonization (double-fork)
4. Tạo custom WSGIServer với error handling
5. Implement single/multi-process modes
6. Implement network binding (TCP/Unix socket)
7. Implement configuration loading

---

## 📋 Chi tiết Tasks

### Task 2.1: Main Entry Point (BT-Panel)

#### 2.1.1 Implement Gevent Monkey Patching

**File: BT-Panel**
```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# BT-Panel - Main Entry Point

# CRITICAL: Monkey patching MUST be first!
from gevent import monkey
monkey.patch_all()

import os
import sys
import time
import signal
import threading

# Set working directory
_PATH = '/www/server/panel'
os.chdir(_PATH)
sys.path.insert(0, _PATH)

# Import after monkey patching
import public
import psutil
from gevent.pywsgi import WSGIServer

# Global variables
is_debug = os.path.exists('data/debug.pl')
is_ssl = False
is_process = os.path.exists('data/is_process.pl')

# Continue with implementation...
```

**Checklist:**
- [ ] Monkey patching là dòng đầu tiên
- [ ] Working directory được set
- [ ] sys.path được cấu hình

#### 2.1.2 Implement Configuration Loading

```python
def load_configuration():
    """Load configuration from .pl files"""
    global HOST, PORT, is_ssl, is_debug, is_process
    
    # Read port
    PORT = 7800
    port_file = 'data/port.pl'
    if os.path.exists(port_file):
        try:
            PORT = int(public.readFile(port_file).strip())
        except:
            PORT = 7800
    
    # Check IPv6
    if os.path.exists('data/ipv6.pl'):
        HOST = '0:0:0:0:0:0:0:0'  # IPv6 all interfaces
    else:
        HOST = '0.0.0.0'  # IPv4 all interfaces
    
    # Check SSL
    is_ssl = (os.path.exists('data/ssl.pl') and 
              os.path.exists('ssl/privateKey.pem') and
              os.path.exists('ssl/certificate.pem'))
    
    # Check debug mode
    is_debug = os.path.exists('data/debug.pl')
    
    # Check process mode
    is_process = os.path.exists('data/is_process.pl')
    
    return {
        'host': HOST,
        'port': PORT,
        'ssl': is_ssl,
        'debug': is_debug,
        'multiprocess': is_process
    }
```

**Configuration Files:**

| File | Mô tả | Default |
|------|-------|---------|
| `data/port.pl` | Port number | 7800 |
| `data/ipv6.pl` | Enable IPv6 (presence) | Disabled |
| `data/ssl.pl` | Enable SSL (presence) | Disabled |
| `data/debug.pl` | Enable debug (presence) | Disabled |
| `data/is_process.pl` | Enable multi-process (presence) | Disabled |

---

### Task 2.2: Process Daemonization

#### 2.2.1 Implement Double-Fork Daemon

```python
def kill_old_process():
    """Kill existing panel process"""
    pid_file = 'logs/panel.pid'
    if os.path.exists(pid_file):
        try:
            old_pid = int(public.readFile(pid_file).strip())
            if old_pid:
                os.kill(old_pid, signal.SIGTERM)
                time.sleep(0.5)
        except (ValueError, ProcessLookupError, PermissionError):
            pass

def daemonize():
    """Double-fork to daemonize process"""
    
    # Kill old process
    kill_old_process()
    
    # First fork
    pid = os.fork()
    if pid > 0:
        # Parent exits
        sys.exit(0)
    
    # Create new session
    os.setsid()
    
    # Second fork
    pid = os.fork()
    if pid > 0:
        # First child writes PID and exits
        pid_file = 'logs/panel.pid'
        public.writeFile(pid_file, str(pid))
        sys.exit(0)
    
    # Second child continues as daemon
    sys.stdout.flush()
    sys.stderr.flush()
    
    # Redirect stdout/stderr to log file
    error_log = open('logs/error.log', 'a+')
    os.dup2(error_log.fileno(), sys.stdout.fileno())
    os.dup2(error_log.fileno(), sys.stderr.fileno())
```

**Checklist:**
- [ ] Old process được kill
- [ ] Double-fork hoạt động
- [ ] PID file được ghi
- [ ] stdout/stderr redirect

#### 2.2.2 System Reboot Detection

```python
def check_system_restarted():
    """Detect system reboot and record"""
    import json
    
    status_file = 'data/reboot_notification.json'
    current_boot_time = psutil.boot_time()
    
    if not os.path.exists(status_file):
        # First run - create status file
        data = {
            'last_reboot_time': current_boot_time,
            'status': 1  # 1 = read/acknowledged
        }
        public.writeFile(status_file, json.dumps(data))
        return False
    
    try:
        data = json.loads(public.readFile(status_file))
        last_reboot_time = data.get('last_reboot_time', 0)
        
        if current_boot_time > last_reboot_time:
            # System was rebooted
            data['last_reboot_time'] = current_boot_time
            data['status'] = 0  # 0 = unread notification
            public.writeFile(status_file, json.dumps(data))
            return True
    except:
        pass
    
    return False
```

---

### Task 2.3: Custom WSGI Server

#### 2.3.1 Create BtWSGIServer Class

```python
class BtWSGIServer(WSGIServer):
    """Custom WSGI server with error handling"""
    
    def wrap_socket_and_handle(self, client_socket, address):
        """Handle socket errors gracefully"""
        try:
            return super().wrap_socket_and_handle(client_socket, address)
        except OSError:
            # Client disconnected abruptly
            pass
    
    def do_read(self):
        """Handle read errors gracefully"""
        try:
            return super().do_read()
        except OSError:
            # Read error, likely client disconnect
            pass
```

#### 2.3.2 Create Server with SSL Support

```python
def create_server(app, config):
    """Create WSGI server with optional SSL"""
    
    host = config['host']
    port = config['port']
    
    if config['ssl']:
        ssl_context = create_ssl_context()
        server = BtWSGIServer(
            (host, port),
            app,
            ssl_context=ssl_context
        )
    else:
        server = BtWSGIServer(
            (host, port),
            app
        )
    
    return server

def create_ssl_context():
    """Create SSL context with TLS 1.2+"""
    import ssl
    
    ssl_context = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
    ssl_context.load_cert_chain(
        certfile='ssl/certificate.pem',
        keyfile='ssl/privateKey.pem'
    )
    
    # Enforce TLS 1.2+
    if hasattr(ssl_context, 'minimum_version'):
        ssl_context.minimum_version = ssl.TLSVersion.TLSv1_2
    else:
        # Legacy Python
        ssl_context.options |= (
            ssl.OP_NO_SSLv2 | 
            ssl.OP_NO_SSLv3 | 
            ssl.OP_NO_TLSv1 | 
            ssl.OP_NO_TLSv1_1
        )
    
    # Strong cipher suites
    ssl_context.set_ciphers(
        'ECDHE-RSA-AES128-GCM-SHA256:HIGH:!aNULL:!MD5:!RC4:!DHE'
    )
    
    # Optional: Client certificate verification
    if os.path.exists('data/ssl_verify_data.pl'):
        ssl_context.load_verify_locations('ssl/ca.pem')
        ssl_context.verify_mode = ssl.CERT_REQUIRED
    
    return ssl_context
```

---

### Task 2.4: Network Binding Modes

#### 2.4.1 Unix Socket Binding

```python
def create_unix_socket_server(app, socket_path='/tmp/panel.sock'):
    """Create server bound to Unix socket"""
    import socket
    
    # Remove existing socket
    if os.path.exists(socket_path):
        os.unlink(socket_path)
    
    # Create Unix socket
    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    sock.bind(socket_path)
    sock.listen(128)
    
    # Set permissions
    os.chmod(socket_path, 0o666)
    
    server = BtWSGIServer(sock, app)
    return server
```

#### 2.4.2 Check Webserver Mode

```python
def should_use_unix_socket():
    """Check if should use Unix socket mode"""
    try:
        import webserver
        return webserver.run_webserver()
    except:
        return False
```

---

### Task 2.5: Process Management

#### 2.5.1 Get Optimal Process Count

```python
def get_process_count():
    """Calculate optimal worker process count"""
    
    # Check manual override
    count_file = 'data/process_count.pl'
    if os.path.exists(count_file):
        try:
            return int(public.readFile(count_file).strip())
        except:
            pass
    
    # Auto-calculate based on resources
    cpu_count = psutil.cpu_count() or 1
    memory_gb = psutil.virtual_memory().total / (1024**3)
    
    # Minimum requirements for multi-process
    if cpu_count < 4 or memory_gb < 4:
        return 1  # Single process mode
    
    # Calculate: min(CPU cores, memory/1GB, 4)
    max_workers = min(cpu_count, int(memory_gb), 4)
    return max(1, max_workers)
```

#### 2.5.2 Single Process Mode

```python
def run_single_process(server):
    """Run in single process mode"""
    print(f"Starting single-process server on {server.address}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.stop()
```

#### 2.5.3 Multi-Process Mode

```python
def run_multi_process(server, max_workers=4):
    """Run in multi-process mode with dynamic scaling"""
    from multiprocessing import Process
    
    process_dict = {}  # {pid: [Process, start_time, psutil.Process]}
    
    def spawn_worker():
        """Spawn a new worker process"""
        p = Process(target=worker_serve, args=(server,), daemon=True)
        p.start()
        process_dict[p.pid] = [p, time.time(), psutil.Process(p.pid)]
        return p.pid
    
    def worker_serve(srv):
        """Worker process main loop"""
        srv.serve_forever()
    
    def check_worker_idle(pid):
        """Check if worker is idle"""
        try:
            proc = process_dict[pid][2]
            cpu = proc.cpu_percent(interval=0.1)
            return cpu < 5  # Less than 5% CPU
        except:
            return False
    
    # Start main worker (always running)
    main_process = Process(target=worker_serve, args=(server,), daemon=True)
    main_process.start()
    main_psutil = psutil.Process(main_process.pid)
    
    print(f"Starting multi-process server with max {max_workers} workers")
    
    # Monitoring loop
    while True:
        try:
            time.sleep(1)
            
            # Check main process CPU
            main_cpu = main_psutil.cpu_percent(interval=1)
            
            # Spawn new worker if main is busy
            if main_cpu > 90 and len(process_dict) < max_workers:
                # Check if all workers are busy
                all_busy = all(
                    not check_worker_idle(pid) 
                    for pid in process_dict
                )
                if all_busy or len(process_dict) == 0:
                    new_pid = spawn_worker()
                    print(f"Spawned worker {new_pid}, total: {len(process_dict) + 1}")
            
            # Kill idle workers
            to_remove = []
            current_time = time.time()
            
            for pid, (proc, start_time, ps_proc) in process_dict.items():
                age = current_time - start_time
                
                # Kill if idle for 5+ seconds and running for 60+ seconds
                if age > 60 and check_worker_idle(pid):
                    idle_start = getattr(proc, '_idle_start', None)
                    if idle_start is None:
                        proc._idle_start = current_time
                    elif current_time - idle_start > 5:
                        to_remove.append(pid)
                else:
                    proc._idle_start = None
            
            for pid in to_remove:
                try:
                    process_dict[pid][0].terminate()
                    del process_dict[pid]
                    print(f"Killed idle worker {pid}")
                except:
                    pass
                    
        except KeyboardInterrupt:
            # Cleanup
            main_process.terminate()
            for pid, (proc, _, _) in process_dict.items():
                proc.terminate()
            break
```

---

### Task 2.6: Background Task Monitoring

#### 2.6.1 Run Task Function

```python
def run_task():
    """Start or restart BT-Task process"""
    task_script = os.path.join(_PATH, 'BT-Task')
    os.chmod(task_script, 0o700)
    python_bin = public.get_python_bin()
    public.ExecShell(f"nohup {python_bin} {task_script} >> logs/task.log 2>&1 &")
```

#### 2.6.2 Daemon Task Thread

```python
def daemon_task():
    """Monitor and restart BT-Task if needed"""
    pid_file = 'logs/task.pid'
    
    while True:
        time.sleep(60)  # Check every 60 seconds
        
        try:
            # Check if PID file exists
            if not os.path.exists(pid_file):
                continue
            
            # Read PID
            pid_content = public.readFile(pid_file).strip()
            if not pid_content:
                run_task()
                continue
            
            pid = int(pid_content)
            
            # Check if process exists
            comm_file = f'/proc/{pid}/comm'
            if not os.path.exists(comm_file):
                run_task()
                continue
            
            # Verify process name
            comm = public.readFile(comm_file).strip()
            if 'BT-Task' not in comm:
                run_task()
                continue
                
        except Exception as e:
            print(f"daemon_task error: {e}")
            run_task()
```

---

### Task 2.7: Main Function

```python
def main():
    """Main entry point"""
    
    # Load configuration
    config = load_configuration()
    print(f"Configuration: {config}")
    
    # Check system reboot
    if check_system_restarted():
        print("System reboot detected")
    
    # Daemonize (unless in debug mode)
    if not config['debug']:
        daemonize()
    
    # Import Flask app after daemonization
    from BTPanel import app
    
    # Launch jobs.py (one-time startup tasks)
    python_bin = public.get_python_bin()
    public.ExecShell(f"nohup {python_bin} class/jobs.py >> logs/jobs.log 2>&1 &")
    
    # Start daemon task monitor
    task_thread = threading.Thread(target=daemon_task, daemon=True)
    task_thread.start()
    
    # Create server
    if should_use_unix_socket():
        server = create_unix_socket_server(app)
    else:
        server = create_server(app, config)
    
    # Run server
    if config['multiprocess']:
        max_workers = get_process_count()
        run_multi_process(server, max_workers)
    else:
        run_single_process(server)

if __name__ == '__main__':
    main()
```

---

## 📦 Deliverables

| Deliverable | Mô tả | Status |
|-------------|-------|--------|
| BT-Panel executable | Main entry point script | ⬜ |
| Gevent integration | Monkey patching, WSGIServer | ⬜ |
| Daemonization | Double-fork, PID management | ⬜ |
| Configuration loading | .pl file parsing | ⬜ |
| Single-process mode | Basic serve_forever() | ⬜ |
| Multi-process mode | Dynamic worker scaling | ⬜ |
| Network binding | TCP and Unix socket | ⬜ |
| SSL support | TLS 1.2+ configuration | ⬜ |
| Task monitoring | daemon_task thread | ⬜ |

---

## ✅ Definition of Done

- [ ] `./BT-Panel` khởi động không lỗi
- [ ] PID file được tạo tại `logs/panel.pid`
- [ ] Server bind thành công trên port 7800
- [ ] SSL hoạt động khi enable
- [ ] Multi-process mode spawn workers đúng
- [ ] daemon_task thread chạy
- [ ] Có thể stop bằng kill PID

---

## 🔗 Navigation

⬅️ [Phase 1: Foundation Setup](./phase-01-foundation-setup.md)  
➡️ [Phase 3: Flask Application Core](./phase-03-flask-application-core.md)
