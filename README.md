# ITDLUPanel

**Linux Server Management Panel** — A modern, lightweight web panel for managing Linux servers, built for educational and production environments at ITDLU (Information Technology, Duy Tan University).

![Go](https://img.shields.io/badge/Go-1.22+-00ADD8?logo=go&logoColor=white)
![React](https://img.shields.io/badge/React-18+-61DAFB?logo=react&logoColor=black)
![License](https://img.shields.io/badge/License-MIT-green)

---

## Features

- 🖥️ **Dashboard** — Real-time system metrics (CPU, RAM, disk, network)
- 🌐 **Website Management** — Nginx virtual host management with SSL
- 📁 **File Manager** — Web-based file browser with editor
- 🗄️ **Database Management** — MySQL/MariaDB database and user management
- 🔒 **Firewall** — iptables/firewalld rule management
- 📊 **Process Monitor** — View and manage running processes
- ⏰ **Cron Jobs** — Schedule and manage cron tasks
- 🐳 **Docker** — Container management (optional)
- 🔑 **SSH Terminal** — Web-based terminal access
- 📋 **Logs** — System and application log viewer

## Quick Install

```bash
curl -sSL https://install.itdlupanel.com | bash
```

> Supported: Ubuntu 22/24, AlmaLinux 8/9, CentOS Stream 8/9

## Screenshots

<!-- TODO: Add screenshots -->
_Coming soon_

## Tech Stack

| Layer    | Technology                       |
|----------|----------------------------------|
| Backend  | Go (Gin, GORM, JWT)             |
| Frontend | React 18, TypeScript, Vite       |
| UI       | Ant Design / Tailwind CSS        |
| Database | SQLite (embedded)                |
| Auth     | JWT with refresh tokens          |
| Realtime | WebSocket (terminal, metrics)    |

## Development Setup

### Prerequisites

- **Go** 1.22+
- **Node.js** 20+ with npm
- **Git**

### Getting Started

```bash
# Clone the repository
git clone https://github.com/ITDLUPanel/panel.git
cd panel

# Install frontend dependencies
cd web && npm install && cd ..

# Run in development mode
make dev
```

The panel will be available at `http://localhost:8888`.

### Project Structure

```
ITDLUPanel/
├── cmd/panel/          # Application entry point
├── internal/           # Go backend (app, handlers, models, services)
│   ├── app/            # Application bootstrap
│   ├── handler/        # HTTP handlers
│   ├── model/          # Database models
│   ├── service/        # Business logic
│   └── middleware/      # Auth, logging middleware
├── web/                # React frontend (Vite + TypeScript)
│   └── src/
│       ├── components/ # Reusable UI components
│       ├── pages/      # Page components
│       ├── api/        # API client
│       └── store/      # State management
├── config/             # Configuration files
├── scripts/            # Install, build, service scripts
├── docs/               # API documentation
└── Makefile            # Build targets
```

## Build

### Local Build

```bash
make build
```

### Cross-Compile (linux/amd64 + linux/arm64)

```bash
bash scripts/build.sh
```

### Docker

```bash
docker build -t itdlupanel .
docker run -d -p 8888:8888 --name panel itdlupanel
```

## Service Management

```bash
# Using the management script
itdlupanel start
itdlupanel stop
itdlupanel restart
itdlupanel status
itdlupanel update
itdlupanel version

# Or using systemctl directly
systemctl start itdlupanel
systemctl status itdlupanel
```

## API Documentation

See [docs/](docs/) for API documentation.

**Base URL:** `http://your-server:8888/api`

Authentication via `Authorization: Bearer <token>` header.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow Go conventions (`gofmt`, `golangci-lint`)
- Write tests for new features
- Keep commits atomic and well-described
- Frontend follows ESLint configuration

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  Built with ❤️ at <strong>ITDLU</strong> — Information Technology, Duy Tan University
</p>
