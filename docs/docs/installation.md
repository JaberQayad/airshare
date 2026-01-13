---
sidebar_position: 2
---

# Installation

Get AirShare up and running with Docker, Docker Compose, or local Node.js development.

## 🐳 Quick Start with Docker (Recommended)

The easiest way to run AirShare:

```bash
docker run -d \
  -p 3000:3000 \
  --name airshare \
  --restart unless-stopped \
  ghcr.io/jaberio/airshare:latest
```

Then open: **http://localhost:3000**

### With Custom Configuration

```bash
docker run -d \
  -p 3000:3000 \
  -e APP_TITLE="My AirShare" \
  -e DONATE_URL="https://buymeacoffee.com/username" \
  -e TERMS_URL="https://yourdomain.com/terms" \
  --name airshare \
  --restart unless-stopped \
  ghcr.io/jaberio/airshare:latest
```

---

## 🐳 Docker Compose (Recommended for Production)

For production deployments with easy configuration:

**1. Create `docker-compose.yml`:**

```yaml
version: "3.8"

services:
  airshare:
    image: ghcr.io/jaberio/airshare:latest
    container_name: airshare
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      # Server Configuration
      PORT: 3000
      NODE_ENV: production
      
      # PeerJS Configuration
      PEERJS_HOST: 0.peerjs.com
      PEERJS_PORT: 443
      PEERJS_SECURE: true
      
      # File Transfer Settings
      MAX_FILE_SIZE: 107374182400
      CHUNK_SIZE: 16384
      
      # UI & Branding
      APP_TITLE: AirShare
      THEME_COLOR: '#6366f1'
      DONATE_URL: 'https://buymeacoffee.com/username'
      TERMS_URL: 'https://yourdomain.com/terms'

    networks:
      - airshare_net

networks:
  airshare_net:
    driver: bridge
```

**2. Start the service:**

```bash
docker-compose up -d
```

**3. View logs:**

```bash
docker-compose logs -f
```

**4. Stop the service:**

```bash
docker-compose down
```

---

## 💻 Local Development

### Requirements

- **Node.js** 18.0 or later ([download](https://nodejs.org/))
- **npm** package manager

### Setup Steps

**1. Clone the Repository**
```bash
git clone https://github.com/jaberio/airshare.git
cd airshare
```

**2. Install Dependencies**
```bash
npm install
```

**3. Configure Environment (Optional)**
```bash
cp .env.example .env
# Edit .env with your preferences
```

**4. Start Development Server**
```bash
npm run dev
```

Or for production:
```bash
npm start
```

**5. Open in Browser**

Visit: **http://localhost:3000**

---

## 🚀 Production Deployment

### Self-Hosted PeerJS Server (Recommended)

For high-traffic deployments, run your own PeerJS server:

**1. Install PeerJS Server:**
```bash
npm install -g peer
```

**2. Start PeerJS Server:**
```bash
peerjs --port 9000 --key peerjs --path /myapp
```

**3. Update `.env`:**
```env
PEERJS_HOST=your-server.com
PEERJS_PORT=9000
PEERJS_SECURE=true
```

**4. Configure Reverse Proxy (Nginx example):**
```nginx
upstream peerjs {
    server localhost:9000;
}

server {
    listen 443 ssl http2;
    server_name your-server.com;

    location /myapp {
        proxy_pass http://peerjs;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

Learn more: [PeerJS Server Documentation](https://github.com/peers/peerjs-server)

---

## 🔧 Verifying Installation

After installation, verify AirShare is working:

1. **Health Check:** Visit `http://localhost:3000/health`
   - Should return: `{"status":"ok","message":"AirShare is running"}`

2. **Web Interface:** Visit `http://localhost:3000`
   - Should see the AirShare file transfer interface

3. **Test Transfer:**
   - Select a file
   - Copy the share link
   - Open in another browser/device
   - Verify file transfers successfully

---

## 📦 Building from Source

To build your own Docker image:

```bash
git clone https://github.com/jaberio/airshare.git
cd airshare
docker build -t airshare:custom .
docker run -d -p 3000:3000 airshare:custom
```

---

## 🆘 Troubleshooting

### Port Already in Use

```bash
# Find process using port 3000
lsof -i :3000  # Mac/Linux
netstat -ano | findstr :3000  # Windows

# Kill the process or use different port
docker run -p 8080:3000 ...
```

### Connection Issues

- Ensure PeerJS server is accessible
- Check firewall rules for WebRTC ports
- Verify browser supports WebRTC (Chrome, Firefox, Safari, Edge)

### Performance Issues

- Consider self-hosting PeerJS server
- Increase `CHUNK_SIZE` for faster local networks
- Use wired connection for large file transfers

For more help, see [Configuration Guide](./configuration.md) or [open an issue](https://github.com/jaberio/airshare/issues).
