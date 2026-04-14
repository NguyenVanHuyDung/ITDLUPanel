# ITDLUPanel — Documentation (2026-04-14)

> **Panel Version**: 4.0.0 · **Go**: 1.25.0 · **React**: 19 · **Node**: 18+

---

## Documents

| Document | Description | Size |
|----------|-------------|------|
| [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md) | System architecture, tech stack, project structure, backend/frontend design, security, build pipeline | Full |
| [DESIGN_ARCHITECTURE.md](./DESIGN_ARCHITECTURE.md) | Design philosophy, request lifecycle, service wiring, WebSocket architecture, metrics, frontend patterns | Full |
| [API_REFERENCE.md](./API_REFERENCE.md) | Complete API reference with ~173 REST endpoints + 2 WebSocket endpoints, request/response examples | Full |
| [FEATURES.md](./FEATURES.md) | Functional specification of all 20 feature modules with detailed capability tables | Full |
| [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) | Complete schema reference for all 30 tables with column definitions, indexes, and migration history | Full |

---

## Quick Summary

### What is ITDLUPanel?

A **single-binary Linux server management panel** built for Dalat University's IT Department. It manages:

- **Websites** — Nginx/Apache/OLS, PHP 5.6–8.4, domains, SSL, reverse proxy
- **Databases** — MySQL/MariaDB, PostgreSQL, Redis with phpMyAdmin/pgAdmin
- **Docker** — Containers, images, networks, volumes, compose (38 one-click apps)
- **Files** — Browser, editor (Monaco), upload/download, compress/extract
- **Security** — Firewall (UFW), Fail2ban, SSH hardening, 2FA (TOTP)
- **Monitoring** — Real-time CPU/RAM/disk/network, process manager, history charts
- **Backups** — Site + DB backups to local, FTP, S3, Google Drive, OneDrive
- **Terminal** — Web-based PTY terminal via WebSocket

### Key Numbers

| Metric | Count |
|--------|-------|
| REST API Endpoints | ~173 |
| WebSocket Endpoints | 2 |
| Database Tables | 30 |
| Backend Services | 33 |
| Frontend Pages | 17 |
| Zustand Stores | 5 |
| Supported Software | 14 installers |
| Middleware Layers | 11 |
| RBAC Permissions | 30+ granular |

### Default Credentials

```
URL:      https://<server-ip>:8888
Username: admin
Password: admin@123456
```

---

## Changes Since Last Documentation (2026-03-29)

### New Features
- **Menu Visibility Settings** — Toggle sidebar menu items on/off from Settings → Menu tab
- **10-Year SSL Certificate** — Default self-signed certificate validity changed from 1 year to 10 years
- **pgAdmin Integration** — pgAdmin button in PostgreSQL database tab + PgAdminManageModal
- **PostgreSQL UI Rewrite** — Full CRUD interface matching MariaDB's design (toolbar, batch actions, search)

### Fixes
- Fixed Redis tab UI jitter when switching database tabs
- Fixed tab labels showing "MySQL" instead of "MariaDB" for MariaDB installations
- Enhanced SSL tab in Settings to show full certificate details (type badge, valid from/until, SANs)

### Technical
- Upgraded Go from 1.18.1 to 1.25.0
- Frontend build uses `npx vite build` directly (bypassing `tsc -b` for pre-existing TS errors)
