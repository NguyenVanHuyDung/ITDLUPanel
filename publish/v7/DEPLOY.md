# ITDLUPanel — Deployment Guide

## Overview

This package contains everything needed to deploy ITDLUPanel to a new server.

**Version:** 7.0.0  
**Published:** 2026-06-27  
**Default installation path:** `/ITDLUPanel/server/panel`

## What's New in v7

### Docker Auto-Cleanup
- **Scheduled cleanup rules** — Define rules to automatically clean up unused Docker resources
- **Configurable actions** — Remove dangling images, stopped containers, unused volumes, build cache
- **Execution history** — Track cleanup runs with detailed logs
- **Dry-run mode** — Preview what would be deleted before applying

### Docker Image Management
- **Upload local images** — Upload Docker images directly from panel
- **Drag-and-drop support** — Easy image upload with progress tracking

### Backup System Enhancements
- **Full/Incremental strategy** — Choose between full tar.gz or rsync-based incremental snapshots
- **Incremental snapshots** — Fast backups using rsync + hardlinks (only changes stored)
- **Cloud storage integration** — Upload backups to Google Drive, S3, FTP, OneDrive
- **Async + resumable uploads** — Reliable large file uploads with progress tracking
- **Backup encryption** — Protect backups with AES-256-GCM encryption

### Notification System
- **Multi-channel notifications** — Email, Telegram, Discord, Slack, Webhook
- **Event-driven alerts** — Get notified about critical server events
- **Customizable rules** — Configure which events trigger which notifications

### Web Application Firewall (WAF)
- **HAProxy + Coraza integration** — Full-featured WAF module
- **OWASP rule sets** — Pre-configured protection against SQL injection, XSS, LFI, RCE
- **Custom rules** — Create and manage your own WAF rules
- **Request logging** — Full audit trail with IP geolocation

### Cron Job Templates
- **Pre-built templates** — Common cron jobs ready to use
- **Backup scheduling** — Automated backup jobs

### User Interface Improvements
- **Realtime monitor section** — Live server metrics dashboard
- **Fixed font rendering** — Consistent typography
- **Wildcard certificate display** — Better SSL certificate handling
- **Dashboard storage warnings** — Prompts when storage providers not installed

### Infrastructure
- **Ubuntu 24.04 support** — Latest LTS compatibility
- **PostgreSQL enhancements** — Auto-seed local PostgreSQL in pgAdmin
- **Go 1.26.2 upgrade** — Updated toolchain

## Package Contents

```
itdlupanel/
├── itdlupanel              # Panel binary (Go, single file)
├── deploy.sh               # Automated deployment script
├── itdlupanel.service      # systemd unit file
├── config/
│   └── panel.json          # Default configuration
├── data/                   # Database directory (auto-created)
├── DEPLOY.md               # This file
└── DEPLOY.vi.md            # Vietnamese version
```

## Requirements

| Requirement | Minimum |
|---|---|
| OS | Ubuntu 20.04+ / Debian 11+ / AlmaLinux 8+ / Rocky 8+ |
| RAM | 512 MB |
| Disk | 1 GB free |
| Access | Root (sudo) |
| Ports | 8888 (default) |

## Quick Deploy

### 1. Transfer to target server

```bash
scp itdlupanel-v7-linux-amd64.tar.gz root@<server-ip>:/tmp/
```

### 2. Extract on target server

```bash
ssh root@<server-ip>
cd /tmp
tar -xzf itdlupanel-v7-linux-amd64.tar.gz
```

### 3. Run deployment

```bash
cd /tmp/itdlupanel
bash deploy.sh
```

The script will:
- Create directory structure at `/ITDLUPanel/`
- Install binary to `/ITDLUPanel/server/panel/`
- Generate a secure JWT secret
- Install and enable systemd service
- Open firewall port (UFW/firewalld)
- Start the panel

### 4. Access the panel

```
http://<server-ip>:8888
Username: admin
Password: admin@123456
```

> **Warning:** Change the default password immediately after first login!

## Deploy Options

```bash
# Custom port
bash deploy.sh --port 9999

# Install without starting
bash deploy.sh --no-start

# Update existing installation (preserves config & data)
bash deploy.sh --update
```

## Directory Structure (After Deploy)

```
/ITDLUPanel/
├── server/
│   ├── panel/                    # Panel application
│   │   ├── itdlupanel           # Binary
│   │   ├── config/panel.json    # Configuration
│   │   └── data/panel.db        # SQLite database
│   ├── vhost/                   # Nginx/Apache vhost configs
│   ├── nginx/                   # Nginx symlinks
│   ├── php/                     # PHP symlinks
│   └── mysql/                   # MySQL symlinks
├── backup/                      # Backup storage
├── logs/                        # Panel & error logs
│   ├── panel.log
│   └── panel-error.log
└── wwwroot/                     # Website document roots
```

## Management Commands

After deployment, use the `itdlupanel` command:

```bash
itdlupanel start            # Start the panel
itdlupanel stop             # Stop the panel
itdlupanel restart          # Restart the panel
itdlupanel status           # Show status (PID, port, version)
itdlupanel logs             # Tail panel logs (live)
itdlupanel version          # Show version
itdlupanel reset-password   # Reset admin password
```

## Configuration

Config file: `/ITDLUPanel/server/panel/config/panel.json`

```json
{
  "server": {
    "host": "0.0.0.0",
    "port": 8888,
    "ssl": false,
    "ssl_cert": "",
    "ssl_key": ""
  },
  "database": {
    "path": "data/panel.db"
  },
  "auth": {
    "jwt_secret": "<auto-generated>",
    "access_token_ttl": 900,
    "refresh_token_ttl": 604800,
    "bcrypt_cost": 12
  },
  "paths": {
    "base": "/ITDLUPanel",
    "backup": "/ITDLUPanel/backup",
    "logs": "/ITDLUPanel/logs",
    "wwwroot": "/ITDLUPanel/wwwroot",
    "vhost": "/ITDLUPanel/server/vhost"
  }
}
```

After editing config, restart the panel:

```bash
itdlupanel restart
```

## Upgrading from v1–v6

1. Transfer the v7 package to your server
2. Extract and run with `--update`:

```bash
tar -xzf itdlupanel-v7-linux-amd64.tar.gz
cd itdlupanel
bash deploy.sh --update
```

This preserves your configuration and database. The previous binary is automatically backed up.

## Uninstalling

```bash
# Stop and disable service
systemctl stop itdlupanel
systemctl disable itdlupanel

# Remove service file
rm -f /etc/systemd/system/itdlupanel.service
systemctl daemon-reload

# Remove management script
rm -f /usr/local/bin/itdlupanel

# Remove all data (CAUTION: removes websites, databases, backups)
rm -rf /ITDLUPanel
```

## Troubleshooting

**Panel won't start:**
```bash
# Check logs
journalctl -u itdlupanel -n 50
cat /ITDLUPanel/logs/panel-error.log

# Check port conflict
ss -tlnp | grep 8888
```

**Can't access panel:**
```bash
# Check firewall
ufw status        # Ubuntu
firewall-cmd --list-ports  # CentOS/Alma

# Check service
systemctl status itdlupanel
```

**Reset admin password:**
```bash
itdlupanel reset-password -password "NewSecurePassword123!"
itdlupanel restart
```

## Building from Source

On the build machine (requires Go 1.23+ and Node.js 18+):

```bash
cd /path/to/ITDLUPanel
cd publish/v7
bash publish.sh --arch amd64
```

Output: `publish/v7/itdlupanel-v7-linux-amd64.tar.gz`
