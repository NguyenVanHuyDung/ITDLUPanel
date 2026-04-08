# ITDLUPanel — Deployment Guide

## Overview

This package contains everything needed to deploy ITDLUPanel to a new server.

**Version:** 4.0.0  
**Published:** 2026-04-08  
**Default installation path:** `/ITDLUPanel/server/panel`

## What's New in v4

### Firewall — Full UFW Support
- **UFW backend integration** — All firewall rules now route through UFW when installed (previously only iptables/firewalld)
- **3-tier priority**: UFW > firewalld > iptables (automatic detection)
- **Enable/Disable** properly activates/deactivates UFW with full rule sync
- **IP blocking** via `ufw deny from <ip>` with proper parsing
- **ICMP block** edits `/etc/ufw/before.rules` instead of raw iptables
- **Software install/uninstall** auto-manages UFW port rules

### Docker Management
- **38 one-click install templates** — Nginx, MySQL, PostgreSQL, Redis, MongoDB, Elasticsearch, GitLab, Jenkins, Grafana, and more
- **Cloud Image browser** — 24 featured Docker Hub images with search
- **Docker Settings** — Configure daemon mirrors, registries, storage driver, log options
- **Font alignment** and UX improvements across all Docker pages

### Notifications System
- **Email (SMTP) + Telegram** notification channels
- **Per-event notification templates** with test buttons
- **Auto-created event rules** for critical events on new channels
- **Card-based UI** for notification channels and event rules

### Cron Job Enhancements
- **30 pre-built templates** (backup, cleanup, monitoring, security, performance, reporting)
- **Storage type fix** — Edit dialog now correctly shows FTP/S3/GDrive/OneDrive destinations
- **Multi-destination backup** — Local+FTP, Local+S3, Local+GDrive, Local+OneDrive

### Logging & Monitoring
- **Color-coded log filters** — Method and status filter buttons with distinct colors
- **Access log statistics** — Computed from all lines via backend awk processing
- **Accurate pagination** — Total line count returned correctly for website logs

### Documentation
- Complete rewrite of SYSTEM_ARCHITECTURE.md, TECHNICAL_SPEC.md, BUILD_ARCHITECTURE.md
- Bilingual README (English + Vietnamese)

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

| Requirement | Minimum           |
| ----------- | ----------------- |
| OS          | Ubuntu 20.04+ / Debian 11+ / AlmaLinux 8+ / Rocky 8+ |
| RAM         | 512 MB            |
| Disk        | 1 GB free         |
| Access      | Root (sudo)       |
| Ports       | 8888 (default)    |

## Quick Deploy

### 1. Transfer to target server

```bash
scp itdlupanel-v4-linux-amd64.tar.gz root@<server-ip>:/tmp/
```

### 2. Extract on target server

```bash
ssh root@<server-ip>
cd /tmp
tar -xzf itdlupanel-v4-linux-amd64.tar.gz
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

> ⚠️ **Change the default password immediately after first login!**

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

## Upgrading from v1, v2, or v3

1. Transfer the v4 package to your server
2. Extract and run with `--update`:

```bash
tar -xzf itdlupanel-v4-linux-amd64.tar.gz
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

On the build machine (requires Go 1.25+ and Node.js 18+):

```bash
cd /path/to/ITDLUPanel
cd publish/v4
bash publish.sh --arch amd64
```

Output: `publish/v4/itdlupanel-v4-linux-amd64.tar.gz`
