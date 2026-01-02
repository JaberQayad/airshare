<div align="center">
  <img src="img/banner.png" alt="AirShare Banner" width="50%">
  
  # 🚀 AirShare
  
  ### Peer-to-peer file transfers in your browser.
  *A modern, clean, and secure implementation inspired by FilePizza.*

  [![Docker Publish](https://github.com/jaberio/airshare/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/jaberio/airshare/actions/workflows/docker-publish.yml)
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

</div>

---

## ✨ Features

- **🛡️ Peer-to-Peer**: Files are transferred directly between devices using WebRTC. We never store your files.
- **♾️ No Size Limits**: Transfer files of any size (limited only by your browser).
- **🔒 Secure**: End-to-end encryption in transit.
- **⚡ Fast & Simple**: Drag and drop, share the link, and you're done.
- **🌙 Dark Mode**: Premium UI with native dark mode support.
- **� Docker Ready**: Optimized for containerized deployments.

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

## �️ Local Development

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

For more complex setups, use the included `docker-compose.yml`:

```bash
docker-compose up -d
```

---

## 🏗️ Technologies

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
