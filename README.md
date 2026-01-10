# 🚀 AirShare
  
  ### Peer-to-peer file transfers in your browser.
  *A modern, clean, and secure implementation inspired by FilePizza.*

  [![Docker Publish](https://github.com/jaberio/airshare/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/jaberio/airshare/actions/workflows/docker-publish.yml)
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
  [![Buy Me A Coffee](https://img.shields.io/badge/Buy_Me_A_Coffee-FFDD00?style=flat&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/Jay_me)

---

## 🎬 Demo

<div align="center">
  <img src="img/demo.gif" alt="AirShare Demo" width="80%">
</div>

---

## ✨ Features

- **🛡️ Peer-to-Peer**: Files are transferred directly between devices using WebRTC. We never store your files.
- **♾️ No Size Limits**: Transfer files of any size (limited only by your browser).
- **🔒 Secure**: End-to-end encryption in transit.
- **⚡ Fast & Simple**: Drag and drop, share the link, and you're done.
- **🌙 Dark Mode**: Premium UI with native dark mode support.
- **🐳 Docker Ready**: Optimized for containerized deployments.

---

## 🚀 Quick Start with Docker (Recommended)

Run the application instantly using GitHub Container Registry:

```bash
docker run -d \
  -p 4111:3000 \
  --name airshare \
  --restart unless-stopped \
  ghcr.io/jaberio/airshare:latest
```

Open your browser and visit: `http://localhost:4111`

---

## � Documentation

Full documentation is available at: **[https://jaberio.github.io/airshare/](https://jaberio.github.io/airshare/)**

- [Getting Started](https://jaberio.github.io/airshare/docs/intro)
- [Installation Guide](https://jaberio.github.io/airshare/docs/installation)
- [Configuration Options](https://jaberio.github.io/airshare/docs/configuration)
- [Development Guide](https://jaberio.github.io/airshare/docs/development)

---

## �💻 Local Development

### 1. Clone & Install
```bash
git clone https://github.com/jaberio/airshare.git
cd airshare
npm install
```

### 2. Configure
Copy the example environment file and adjust as needed:
```bash
cp .env.example .env
```

### 3. Run
```bash
npm start
```
Visit: `http://localhost:3000`

---

## 🐳 Docker Compose

For more complex setups, use the included `docker-compose.yml`. This configuration includes production-ready defaults like restart policies, health checks, and isolated networks.

```bash
docker-compose up -d
```

---

## 🔧 Environment Variables

### General Configuration
- `PORT` - Server port (default: `3000`)
- `NODE_ENV` - Node environment (default: `development`)

### Reverse Proxy Support
- `TRUST_PROXY` - Enable trust proxy for correct client IP detection when running behind a reverse proxy (nginx, Apache, etc.)
  - **Not set** (default): Trust proxy disabled - safe for direct deployments
  - `1` - Trust 1 proxy hop
  - `2` - Trust 2 proxy hops
  - `true` - Trust all proxies (use with caution in controlled environments)

**When to use**: Set `TRUST_PROXY` when your application is behind a reverse proxy to properly handle rate limiting and client IP detection. This resolves `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` errors.

Example with Docker:
```bash
docker run -d \
  -p 4111:3000 \
  -e TRUST_PROXY=1 \
  --name airshare \
  --restart unless-stopped \
  ghcr.io/jaberio/airshare:latest
```

Example with Docker Compose - uncomment in `docker-compose.yml`:
```yaml
environment:
  TRUST_PROXY: 1
```

---

## 📊 Logging

The application automatically logs all server activity to timestamped log files in the `logs/` directory. This is useful for debugging, monitoring, and auditing.

### Log Files
- Location: `logs/` directory (created automatically)
- Format: `YYYY-MM-DD_HH-mm-ss.log`
- Content: All console output (INFO, ERROR, WARN, DEBUG levels) with timestamps

### Log Levels
- **INFO**: General application events (server startup, user connections)
- **ERROR**: Error messages with stack traces
- **WARN**: Warning messages
- **DEBUG**: Debug information

### Example Log Entry
```
[2026-01-10T00:35:43.123Z] [INFO] Server is running on http://localhost:3000
[2026-01-10T00:36:15.456Z] [INFO] User connected: {"id":"dLp6Aw_two9IKQcIAAAB"}
[2026-01-10T00:36:19.789Z] [ERROR] Error reading index.html {"message":"File not found","stack":"..."}
```

### Docker Volume Mounting
To persist logs when running in Docker:

```bash
docker run -d \
  -p 4111:3000 \
  -v airshare-logs:/app/logs \
  --name airshare \
  --restart unless-stopped \
  ghcr.io/jaberio/airshare:latest
```

Or with Docker Compose:
```yaml
services:
  airshare:
    volumes:
      - airshare-logs:/app/logs

volumes:
  airshare-logs:
```

---

- **Frontend**: HTML5, CSS3, Vanilla JavaScript (ES Modules)
- **Backend**: Node.js, Express
- **Real-time**: Socket.io (Signaling), WebRTC (Data Transfer)
- **CI/CD**: GitHub Actions, GHCR.io

---

## 📝 License

Distributed under the MIT License. See `LICENSE` for more information.

---

<div align="center">
  Built with ❤️ for a faster, safer web.
</div>
