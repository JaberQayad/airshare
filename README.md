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
  -p 3000:3000 \
  --name airshare \
  --restart unless-stopped \
  ghcr.io/jaberio/airshare:latest
```

Open your browser and visit: `http://localhost:3000`

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
# Recommended: dev server + client bundler (watch)
npm run dev

# Or: one-time client build then run server
# npm run build:client
# npm start
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

### Server Configuration
- `PORT` - Server port (default: `3000`)
- `NODE_ENV` - Node environment (default: `development`)

### PeerJS Configuration
- `PEERJS_HOST` - PeerJS server hostname (default: `0.peerjs.com` - cloud server)
- `PEERJS_PORT` - PeerJS server port (default: `443`)
- `PEERJS_SECURE` - Use secure connection wss:// (default: `true`)

### File Transfer Settings
- `MAX_FILE_SIZE` - Maximum file size in bytes (default: `107374182400` = 100GB)
- `CHUNK_SIZE` - Size of each data chunk transferred (default: `16384` = 16KB)

### UI & Branding
- `APP_TITLE` - Application title (default: `AirShare`)
- `THEME_COLOR` - Primary theme color hex code (default: `#6366f1`)
- `DONATE_URL` - URL for donation link in footer (optional)
- `TERMS_URL` - URL for terms of service link in footer (optional)

**For detailed configuration options, see the [Configuration Guide](https://jaberio.github.io/airshare/docs/configuration).**

---

## � Security

AirShare implements multiple security layers:

- **🔐 End-to-End Encryption**: Files encrypted with AES-256-GCM before transfer
- **🛡️ Client-Side Processing**: All encryption happens in your browser
- **🚫 No Server Storage**: Files never touch our servers - direct P2P transfer
- **🔒 Secure Headers**: Helmet.js with frameguard, noSniff, XSS filter
- **👤 Non-root Docker**: Runs as unprivileged user (nodejs:1001)
- **🎯 Password Protection**: Optional encryption key for shared links

**See [SECURITY.md](SECURITY.md) for full security documentation and reporting vulnerabilities.**

---

## 🛠️ Tech Stack
- **Frontend**: HTML5, CSS3, Vanilla JavaScript (ES Modules)
- **Backend**: Node.js, Express (Static file serving)
- **Real-time**: PeerJS (WebRTC abstraction with cloud signaling)
- **Encryption**: Web Crypto API (AES-256-GCM)
- **Security**: Helmet.js, CORS
- **CI/CD**: GitHub Actions, GHCR.io

---

## 📝 License

Distributed under the MIT License. See `LICENSE` for more information.

---

<div align="center">
  Built with ❤️ for a faster, safer web.
</div>
