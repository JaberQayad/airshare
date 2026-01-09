---
sidebar_position: 3
---

# Configuration

Configure AirShare through environment variables to customize its behavior for your deployment.

## General Configuration

### PORT
Server port where AirShare listens.

- **Default**: `3000`
- **Example**: `export PORT=8080`

### NODE_ENV
Node.js environment mode.

- **Default**: `development`
- **Values**: `development`, `production`
- **Example**: `export NODE_ENV=production`

## Reverse Proxy Support

### TRUST_PROXY
Enable trust proxy for correct client IP detection when running behind a reverse proxy (nginx, Apache, etc.).

This is **required** to resolve `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` errors from express-rate-limit when behind a reverse proxy.

- **Default**: Not set (disabled)
- **Supported values**:
  - `1` - Trust 1 proxy hop
  - `2` - Trust 2 proxy hops
  - `true` - Trust all proxies (use with caution in controlled environments)

**Example with Docker:**
```bash
docker run -d \
  -p 4111:3000 \
  -e TRUST_PROXY=1 \
  --name airshare \
  --restart unless-stopped \
  ghcr.io/jaberio/airshare:v1.0.0
```

**Example with Docker Compose:**
```yaml
environment:
  TRUST_PROXY: 1
```

**When to use:**
Set `TRUST_PROXY` when your application is behind a reverse proxy to properly handle rate limiting and client IP detection.

## Advanced Configuration

### MAX_FILE_SIZE
Maximum file size in bytes that can be transferred.

- **Default**: `2147483648` (2GB)
- **Example**: `export MAX_FILE_SIZE=5368709120` (5GB)

### CHUNK_SIZE
WebRTC chunk size in bytes for data transfer.

- **Default**: `16384` (16KB)
- **Example**: `export CHUNK_SIZE=32768` (32KB)
- **Note**: Larger chunks may be faster but consume more memory

### MAX_BUFFERED_AMOUNT
Maximum buffered data in bytes for WebRTC connection.

- **Default**: `65536` (64KB)
- **Example**: `export MAX_BUFFERED_AMOUNT=131072` (128KB)

### ICE_SERVERS
Custom STUN/TURN servers for WebRTC connectivity.

- **Default**: `[{"urls":"stun:stun.l.google.com:19302"}]`
- **Format**: JSON string
- **Example**:
  ```bash
  export ICE_SERVERS='[
    {"urls":"stun:stun.l.google.com:19302"},
    {"urls":"turn:your-turn-server.com","username":"user","credential":"pass"}
  ]'
  ```

## UI Customization

### APP_TITLE
Browser tab and header title.

- **Default**: `AirShare`
- **Example**: `export APP_TITLE="MyFile Share"`

### THEME_COLOR
Primary UI theme color as hex value.

- **Default**: `#6366f1` (Indigo)
- **Example**: `export THEME_COLOR="#3b82f6"` (Blue)

### DONATE_URL
Custom donation link displayed in the UI.

- **Default**: Not set
- **Example**: `export DONATE_URL="https://buymeacoffee.com/Jay_me"`

### TERMS_URL
Custom terms of service page link.

- **Default**: Not set
- **Example**: `export TERMS_URL="https://example.com/terms"`

### UMAMI_ID
Analytics tracking ID for Umami analytics service.

- **Default**: Not set
- **Example**: `export UMAMI_ID="12345678-1234-1234-1234-123456789012"`

## Environment Variables File

Create a `.env` file in the project root for local development:

```bash
PORT=3000
NODE_ENV=production
TRUST_PROXY=1
MAX_FILE_SIZE=2147483648
CHUNK_SIZE=16384
MAX_BUFFERED_AMOUNT=65536
APP_TITLE=AirShare
THEME_COLOR=#6366f1
DONATE_URL=https://buymeacoffee.com/Jay_me
```

The application will automatically load variables from the `.env` file if it exists.

## Example: Production Deployment with Nginx

When deploying behind Nginx:

1. **Set TRUST_PROXY**:
   ```bash
   export TRUST_PROXY=1
   ```

2. **Configure Nginx to forward headers**:
   ```nginx
   location / {
       proxy_pass http://airshare:3000;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
       proxy_set_header Host $host;
   }
   ```

3. **Verify rate limiting works**:
   The rate limiter will now correctly detect client IPs through the proxy.
