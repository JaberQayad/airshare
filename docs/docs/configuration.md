---
sidebar_position: 3
---

# Configuration

Configure AirShare through environment variables. All settings are optional—sensible defaults work for most installations.

## Server Configuration

### PORT
The network port where AirShare listens for HTTP requests.

- **Default**: `3000`
- **Type**: Integer
- **Example**: `PORT=8080`

### NODE_ENV
Node.js execution environment.

- **Default**: `development`
- **Values**: `development` | `production`
- **Example**: `NODE_ENV=production`

---

## PeerJS Configuration

### PEERJS_HOST
PeerJS server hostname for WebRTC signaling.

- **Default**: `0.peerjs.com` (cloud server)
- **Type**: String
- **Example**: `PEERJS_HOST=your-peerjs-server.com`
- **Note**: For production, consider self-hosting PeerJS server

### PEERJS_PORT
PeerJS server port.

- **Default**: `443`
- **Type**: Integer
- **Example**: `PEERJS_PORT=9000`

### PEERJS_SECURE
Use secure connection (wss://) for PeerJS.

- **Default**: `true`
- **Type**: Boolean
- **Example**: `PEERJS_SECURE=false`

---

## File Transfer Settings

### MAX_FILE_SIZE
Maximum file size (in bytes) that can be transferred.

- **Default**: `107374182400` (100GB)
- **Type**: Integer (bytes)
- **Example**: `MAX_FILE_SIZE=5368709120` (5GB)

### CHUNK_SIZE
Size of each data chunk transferred over WebRTC.

- **Default**: `16384` (16KB)
- **Type**: Integer (bytes)
- **Example**: `CHUNK_SIZE=32768` (32KB)
- **Note**: Larger chunks = faster transfers but more memory

---

## UI & Branding

### APP_TITLE
Application title shown in browser tab.

- **Default**: `AirShare`
- **Type**: String
- **Example**: `APP_TITLE=My File Share`

### THEME_COLOR
Primary theme color for the application.

- **Default**: `#6366f1` (indigo)
- **Type**: Color hex code
- **Example**: `THEME_COLOR=#10b981` (green)

### DONATE_URL
URL for donation/support link in footer.

- **Default**: None
- **Type**: URL string
- **Example**: `DONATE_URL=https://buymeacoffee.com/username`

### TERMS_URL
URL for terms of service/privacy policy.

- **Default**: None
- **Type**: URL string
- **Example**: `TERMS_URL=https://yourdomain.com/terms`

---

## Production Deployment Tips

### Using Cloud PeerJS (Default)
The default configuration uses the free cloud PeerJS server (`0.peerjs.com`). This is perfect for:
- Development
- Small deployments
- Testing

### Self-Hosting PeerJS
For production or high-traffic deployments, consider running your own PeerJS server:

```bash
npm install peer
npx peerjs --port 9000 --key peerjs
```

Then update your `.env`:
```
PEERJS_HOST=your-server.com
PEERJS_PORT=9000
PEERJS_SECURE=true
```

Learn more: [PeerJS Server Documentation](https://github.com/peers/peerjs-server)

---

## Docker Environment Variables

When using Docker, pass environment variables with `-e` flag:

```bash
docker run -d \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e APP_TITLE="My AirShare" \
  -e DONATE_URL="https://buymeacoffee.com/username" \
  -e TERMS_URL="https://yourdomain.com/terms" \
  --name airshare \
  ghcr.io/jaberio/airshare:latest
```

Or use Docker Compose (recommended) - see [Installation Guide](./installation.md).
