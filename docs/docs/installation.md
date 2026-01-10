---
sidebar_position: 2
---

# Installation

Get AirShare up and running on your system with Docker, Docker Compose, or local Node.js development. Choose the method that best fits your needs.

## 🐳 Quick Start with Docker (Recommended)

The easiest way to run AirShare with production-ready defaults:

```bash
docker run -d \
  -p 4111:3000 \
  --name airshare \
  --restart unless-stopped \
  ghcr.io/jaberio/airshare:latest
```

Then open your browser: **http://localhost:4111**

### Behind a Reverse Proxy?
If you're running behind Nginx/Apache, add `TRUST_PROXY`:
```bash
docker run -d \
  -p 4111:3000 \
  -e TRUST_PROXY=1 \
  --name airshare \
  --restart unless-stopped \
  ghcr.io/jaberio/airshare:latest
```

---

## 🐳 Docker Compose (Multi-container Production Setup)

For complex setups with volumes, networks, and additional services:

```bash
git clone https://github.com/jaberio/airshare.git
cd airshare
docker-compose up -d
```

This includes:
- ✅ Auto-restart on failure
- ✅ Production environment variables
- ✅ Isolated network
- ✅ Enterprise defaults (streaming, backpressure, room management)

Then open: **http://localhost:4111**

### Customizing docker-compose.yml

Edit environment variables for your deployment:

```yaml
services:
  airshare:
    environment:
      PORT: 3000
      NODE_ENV: production
      MAX_IN_MEMORY_SIZE: 209715200      # Stream files >200MB to disk
      MAX_PEERS_PER_ROOM: 2              # 1 sender + 1 receiver
      ROOM_TTL_MS: 1800000               # Clean up abandoned rooms after 30 min
      TRUST_PROXY: 1                     # If behind reverse proxy
```

See [Configuration Guide](./configuration.md) for all available options.

---

## 💻 Local Development

### Requirements

- **Node.js** 18.0 or later ([install here](https://nodejs.org/))
- **npm** or **yarn** package manager

### Step-by-Step Setup

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
Copy the example configuration:
```bash
cp .env.example .env
# Edit .env to customize (see Configuration Guide)
```

**4. Start the Server**

For development (auto-reload on file changes):
```bash
npm run dev
```

For production:
```bash
npm start
```

**5. Open in Browser**
Visit: **http://localhost:3000**

### Development Commands

```bash
npm start       # Production mode
npm run dev     # Development mode with auto-reload
npm test        # Run tests (if available)
npm run build   # Build documentation
```

---

## 🚀 Deployment Options

### Render.com (Easy Cloud Deployment)

AirShare includes a `render.yaml` configuration for instant deployment:

1. Push your code to GitHub
2. Connect your repository to [Render.com](https://render.com/)
3. Render automatically deploys using the included configuration
4. Your instance is live with auto-SSL

### Docker Registry (Container Registries)

**Build and Push to Your Registry**
```bash
# Build image
docker build -t airshare:latest .

# Tag with your registry
docker tag airshare:latest your-registry/airshare:latest

# Push
docker push your-registry/airshare:latest

# Deploy (example on your own server)
docker run -d \
  -p 4111:3000 \
  your-registry/airshare:latest
```

### Kubernetes

Create a deployment file `airshare-deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: airshare
spec:
  replicas: 3
  selector:
    matchLabels:
      app: airshare
  template:
    metadata:
      labels:
        app: airshare
    spec:
      containers:
      - name: airshare
        image: ghcr.io/jaberio/airshare:latest
        ports:
        - containerPort: 3000
        env:
        - name: PORT
          value: "3000"
        - name: NODE_ENV
          value: "production"
        - name: MAX_PEERS_PER_ROOM
          value: "2"
        - name: ROOM_TTL_MS
          value: "1800000"
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
```

Deploy:
```bash
kubectl apply -f airshare-deployment.yaml
```

### Traditional VPS (Ubuntu/Debian)

**1. SSH into your server**
```bash
ssh user@your-server.com
```

**2. Install Node.js**
```bash
curl -sL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**3. Clone and setup**
```bash
git clone https://github.com/jaberio/airshare.git
cd airshare
npm install
```

**4. Run with PM2 (process manager)**
```bash
sudo npm install -g pm2
pm2 start src/server/index.js --name airshare
pm2 startup
pm2 save
```

**5. Configure Nginx reverse proxy**
```nginx
server {
    listen 80;
    server_name airshare.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable SSL with Let's Encrypt:
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d airshare.yourdomain.com
```

---

## ✅ Verification

After installation, verify everything works:

**1. Server is Running**
- Visit the web interface (http://localhost:port)
- You should see the AirShare UI

**2. Basic Transfer Test**
- Select a file (try a small one first)
- Share the generated link with another browser tab/device
- Receiver accepts the connection
- File transfers successfully

**3. Check Server Logs**
```bash
# Docker
docker logs airshare

# Local development
# Look for "Server running on port 3000"
```

**4. Verify Configuration**
Check that enterprise features are active:
```bash
# Look for these in server logs (set NODE_ENV=production):
# "Room TTL cleanup interval: 10 minutes"
# "Max peers per room: 2"
# "Max signal payload: 64KB"
```

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| Port already in use | Change `PORT` env var or kill existing process |
| "Cannot GET /" errors | Check server started successfully, check logs |
| Connection fails between peers | Verify ICE servers reachable (firewall/NAT), check browser console |
| "Room is full" error | Verify `MAX_PEERS_PER_ROOM=2`, check for zombie connections |
| Rate limiting blocks you | Set `TRUST_PROXY=1` if behind reverse proxy |
| Out of memory on large files | Set `MAX_IN_MEMORY_SIZE` lower or use streaming-capable browser |

---

## 📦 System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **CPU** | 1 core | 2+ cores |
| **RAM** | 512 MB | 2+ GB |
| **Storage** | 100 MB | 1+ GB (for logs) |
| **Network** | 10 Mbps | 100+ Mbps |
| **Node.js** | 18.0 | 20+ LTS |

---

## 🔒 Security Considerations

- ✅ **HTTPS Required for Production**: Use reverse proxy with SSL (Let's Encrypt free)
- ✅ **Keep Updated**: Pull latest image periodically: `docker pull ghcr.io/jaberio/airshare:latest`
- ✅ **Monitor Logs**: Set up log aggregation for error tracking
- ✅ **Rate Limiting**: Default 100 requests/15min per IP (tunable)
- ✅ **CORS Enabled**: Restrict with `NODE_ENV=production`

---

## 📚 Next Steps

- ⚙️ [Configuration Guide](./configuration.md) - Customize for your needs
- 🛠️ [Development Guide](./development.md) - Contribute or extend
- 🐳 [Docker Troubleshooting](../plans/LIMITATIONS.md) - Common issues
3. In another browser tab, open the shared link
4. Verify the file transfer works correctly

Congratulations! AirShare is now running on your system.
