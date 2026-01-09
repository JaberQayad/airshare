---
sidebar_position: 2
---

# Installation

Get AirShare running on your system with Docker, Docker Compose, or local Node.js development.

## Quick Start with Docker (Recommended)

The easiest way to get started is using Docker:

```bash
docker run -d \
  -p 4111:3000 \
  --name airshare \
  --restart unless-stopped \
  ghcr.io/jaberio/airshare:v1.0.0
```

Then open your browser and visit: `http://localhost:4111`

### Using Docker Compose

For more complex setups with production-ready defaults:

```bash
docker-compose up -d
```

## Local Development

### Requirements

- [Node.js](https://nodejs.org/) version 18.0 or above
- npm or yarn package manager

### Steps

1. **Clone the repository**
   ```bash
   git clone https://github.com/jaberio/airshare.git
   cd airshare
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment** (optional)
   ```bash
   cp .env.example .env
   # Edit .env as needed
   ```

4. **Start the server**
   ```bash
   npm start
   ```

5. **Open in browser**
   Visit: `http://localhost:3000`

### Development Mode

For development with auto-reload:

```bash
npm run dev
```

## Deployment

### Render.com

AirShare includes a `render.yaml` configuration file for easy deployment on Render.com. 
Just connect your GitHub repository to Render and it will automatically deploy.

### Manual Deployment

1. Build the Docker image:
   ```bash
   docker build -t airshare:latest .
   ```

2. Push to your registry:
   ```bash
   docker tag airshare:latest your-registry/airshare:latest
   docker push your-registry/airshare:latest
   ```

3. Deploy to your platform of choice (Kubernetes, Docker Swarm, Cloud Run, etc.)

## Verification

To verify the installation:

1. Visit the application in your browser
2. Try uploading a file and sharing the link
3. In another browser tab, open the shared link
4. Verify the file transfer works correctly

Congratulations! AirShare is now running on your system.
