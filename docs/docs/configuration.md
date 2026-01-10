---
sidebar_position: 3
---

# Configuration

Configure AirShare through environment variables to customize its behavior for your deployment. All settings are optional—sensible defaults work for most installations.

## Server Configuration

### PORT
The network port where AirShare listens for HTTP requests.

- **Default**: `3000`
- **Type**: Integer
- **Example**: `PORT=8080`

### NODE_ENV
Node.js execution environment, affects logging and optimizations.

- **Default**: `development`
- **Values**: `development` | `production`
- **Example**: `NODE_ENV=production`

### MAX_FILE_SIZE
Maximum file size (in bytes) that can be transferred. Larger files are rejected at upload.

- **Default**: `107374182400` (100GB)
- **Type**: Integer (bytes)
- **Example**: `MAX_FILE_SIZE=5368709120` (5GB for mobile-friendly deployments)

---

## WebRTC Streaming & Backpressure (Enterprise)

### MAX_IN_MEMORY_SIZE
Threshold (in bytes) above which large files stream to disk instead of buffering in RAM. Critical for handling multi-gigabyte files on memory-constrained systems.

- **Default**: `209715200` (200MB)
- **Type**: Integer (bytes)
- **Behavior**:
  - File size ≤ 200MB → In-memory buffering (fast)
  - File size > 200MB → File System Access API streaming (Chrome/Edge) + in-memory fallback (Firefox/Safari with warning)
- **Tuning**:
  - Lower on systems with `<2GB` RAM: `MAX_IN_MEMORY_SIZE=104857600` (100MB)
  - Higher on beefy servers: `MAX_IN_MEMORY_SIZE=524288000` (500MB)

### DEFAULT_CHUNK_SIZE
Initial chunk size (in bytes) for WebRTC data transfer. Adapts automatically based on network conditions.

- **Default**: `131072` (128KB)
- **Type**: Integer (bytes)
- **Range**: Adaptive from MIN to MAX_CHUNK_SIZE
- **Tuning**:
  - Slow networks (LTE): `DEFAULT_CHUNK_SIZE=65536` (64KB)
  - Fast networks (Fiber): `DEFAULT_CHUNK_SIZE=262144` (256KB)

### MIN_CHUNK_SIZE
Minimum chunk size when backpressure events trigger (network congestion detected).

- **Default**: `32768` (32KB)
- **Type**: Integer (bytes)
- **Impact**: Prevents excessive fragmentation under load; lower = more chunks but better flow control

### MAX_CHUNK_SIZE
Maximum chunk size when connection is stable (no backpressure events for 10 seconds).

- **Default**: `262144` (256KB)
- **Type**: Integer (bytes)
- **Impact**: Higher = more throughput on good connections, but more memory per chunk

### BUFFER_HIGH_WATER
Threshold (in bytes) that pauses the sender when WebRTC's DataChannel buffer exceeds this value. Prevents RAM exhaustion on sender side.

- **Default**: `1048576` (1MB)
- **Type**: Integer (bytes)
- **Behavior**: When DataChannel bufferedAmount > BUFFER_HIGH_WATER, sender pauses; resumes on `bufferedamountlow` event
- **Tuning**:
  - Memory-constrained: `BUFFER_HIGH_WATER=524288` (512KB)
  - High-bandwidth: `BUFFER_HIGH_WATER=2097152` (2MB)

### BUFFER_LOW_WATER
Threshold (in bytes) that resumes the sender after backpressure. Typically 25% of BUFFER_HIGH_WATER.

- **Default**: `262144` (256KB)
- **Type**: Integer (bytes)
- **Behavior**: When DataChannel bufferedAmount drops below this, sender resumes if paused
- **Note**: Must be < BUFFER_HIGH_WATER

---

## Signaling & Room Management (Enterprise)

### MAX_PEERS_PER_ROOM
Maximum number of peers allowed in a single room. Enforces 1 sender + 1 receiver model.

- **Default**: `2`
- **Type**: Integer
- **Values**: Recommended `2` (don't change)
- **Behavior**: 3rd peer attempting to join gets "Room is full" error
- **Scalability**: 100 concurrent transfers = 100 independent rooms (each with 2 peers)

### ROOM_TTL_MS
Room time-to-live in milliseconds. Abandoned rooms are auto-cleaned to prevent memory leaks.

- **Default**: `1800000` (30 minutes)
- **Type**: Integer (milliseconds)
- **Cleanup**: Every 10 minutes, rooms older than TTL are deleted
- **Tuning**:
  - Long-running transfers: `ROOM_TTL_MS=3600000` (60 minutes)
  - Aggressive cleanup: `ROOM_TTL_MS=600000` (10 minutes)

### MAX_SIGNAL_PAYLOAD_BYTES
Maximum size (in bytes) for any signaling message (SDP offers/answers, ICE candidates). Prevents DoS attacks from oversized payloads.

- **Default**: `65536` (64KB)
- **Type**: Integer (bytes)
- **Typical signal sizes**: 1-5KB (WebRTC protocol)
- **Note**: Don't change unless you have unusual WebRTC configurations

---

## ICE & Network Configuration

### ICE_SERVERS
Custom STUN/TURN servers for NAT traversal. Enables connectivity through corporate firewalls and ISP-level NAT.

- **Default**: `[{"urls":"stun:stun.l.google.com:19302"}]`
- **Type**: JSON string (array of objects)
- **Format**:
  ```json
  [
    {"urls": "stun:stun.l.google.com:19302"},
    {"urls": "turn:your-turn-server.com:3478", "username": "user", "credential": "pass"}
  ]
  ```
- **Example with TURN server**:
  ```bash
  export ICE_SERVERS='[{"urls":"stun:stun.l.google.com:19302"},{"urls":"turn:turnserver.example.com:3478","username":"airshare","credential":"secret123"}]'
  ```

---

## UI & Branding Configuration

### APP_TITLE
Browser tab title and main heading text.

- **Default**: `AirShare`
- **Type**: String
- **Example**: `APP_TITLE="CompanyFile"`

### THEME_COLOR
Primary UI color (hex code) for buttons, links, and accents. Applies to both light and dark themes.

- **Default**: `#6366f1` (Indigo)
- **Type**: Hex color code
- **Example**: `THEME_COLOR="#3b82f6"` (Blue)
- **Popular options**:
  - `#6366f1` - Indigo (default)
  - `#3b82f6` - Blue
  - `#10b981` - Green
  - `#f59e0b` - Amber
  - `#ef4444` - Red

### DONATE_URL
External URL for donation link. If set, displays a "Support" link in the UI.

- **Default**: Not set (no link shown)
- **Type**: URL string
- **Example**: `DONATE_URL="https://buymeacoffee.com/Jay_me"`

### TERMS_URL
External URL for terms of service. If set, displays a "Terms" link in the footer.

- **Default**: Not set (no link shown)
- **Type**: URL string
- **Example**: `TERMS_URL="https://company.com/terms"`

### UMAMI_ID
Tracking ID for [Umami Analytics](https://umami.is/). Enables privacy-focused usage analytics.

- **Default**: Not set (analytics disabled)
- **Type**: UUID string
- **Example**: `UMAMI_ID="12345678-1234-1234-1234-123456789012"`

---

## Reverse Proxy Support

### TRUST_PROXY
Enable trust proxy to correctly detect client IPs when running behind Nginx, Apache, or other reverse proxies. **Required** for accurate rate limiting behind a proxy.

- **Default**: Not set (disabled)
- **Supported values**:
  - `1` - Trust 1 proxy hop (common for Nginx/Apache)
  - `2` - Trust 2 proxy hops (load balancer + reverse proxy)
  - `true` - Trust all proxies (use only in controlled environments)
- **When needed**: Set this when you see `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` errors

**Example: Single Nginx Reverse Proxy**
```bash
export TRUST_PROXY=1
```

**Example: Docker Compose behind Nginx**
```yaml
environment:
  TRUST_PROXY: 1
```

**Example: Nginx Configuration**
```nginx
location / {
    proxy_pass http://airshare:3000;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Host $host;
}
```

---

## Configuration Files

### .env File (Development)
Create a `.env` file in the project root with your custom variables:

```bash
# Server
PORT=3000
NODE_ENV=development

# WebRTC Streaming & Backpressure
MAX_IN_MEMORY_SIZE=209715200
DEFAULT_CHUNK_SIZE=131072
MIN_CHUNK_SIZE=32768
MAX_CHUNK_SIZE=262144
BUFFER_HIGH_WATER=1048576
BUFFER_LOW_WATER=262144

# Signaling & Room Management
MAX_PEERS_PER_ROOM=2
ROOM_TTL_MS=1800000
MAX_SIGNAL_PAYLOAD_BYTES=65536

# ICE Servers
ICE_SERVERS=[{"urls":"stun:stun.l.google.com:19302"}]

# UI & Branding
APP_TITLE=AirShare
THEME_COLOR=#6366f1
DONATE_URL=https://buymeacoffee.com/Jay_me
TERMS_URL=https://company.com/terms
UMAMI_ID=
```

### docker-compose.yml (Production)
Environment variables for containerized deployment:

```yaml
environment:
  PORT: 3000
  NODE_ENV: production
  MAX_IN_MEMORY_SIZE: 209715200
  DEFAULT_CHUNK_SIZE: 131072
  MIN_CHUNK_SIZE: 32768
  MAX_CHUNK_SIZE: 262144
  BUFFER_HIGH_WATER: 1048576
  BUFFER_LOW_WATER: 262144
  MAX_PEERS_PER_ROOM: 2
  ROOM_TTL_MS: 1800000
  MAX_SIGNAL_PAYLOAD_BYTES: 65536
  # TRUST_PROXY: 1  # Uncomment if behind reverse proxy
```

---

## Deployment Scenarios

### Small Team (10-50 users)
```bash
PORT=3000
NODE_ENV=production
MAX_IN_MEMORY_SIZE=209715200
DEFAULT_CHUNK_SIZE=131072
```

### Enterprise (1000+ concurrent users)
```bash
PORT=3000
NODE_ENV=production
MAX_IN_MEMORY_SIZE=209715200
DEFAULT_CHUNK_SIZE=262144          # Higher throughput
MIN_CHUNK_SIZE=65536
MAX_CHUNK_SIZE=524288
BUFFER_HIGH_WATER=2097152          # 2MB
BUFFER_LOW_WATER=524288
ROOM_TTL_MS=1200000                # 20 min for faster cleanup
TRUST_PROXY=1                       # Behind load balancer
```

### Restricted Networks (Mobile/LTE)
```bash
PORT=3000
NODE_ENV=production
MAX_IN_MEMORY_SIZE=104857600        # 100MB for small RAM
DEFAULT_CHUNK_SIZE=65536            # 64KB for low bandwidth
MIN_CHUNK_SIZE=16384                # Smaller minimum
MAX_CHUNK_SIZE=131072               # Smaller maximum
BUFFER_HIGH_WATER=524288            # 512KB
BUFFER_LOW_WATER=131072             # 128KB
```

---

## Troubleshooting Configuration

| Problem | Solution |
|---------|----------|
| "Room is full" errors | Verify `MAX_PEERS_PER_ROOM` isn't too low (default: 2) |
| OOM errors on large files | Lower `MAX_IN_MEMORY_SIZE` or enable File System Access API |
| Slow transfers | Increase `DEFAULT_CHUNK_SIZE` and `MAX_CHUNK_SIZE` |
| Rate limit blocking | Set `TRUST_PROXY` if behind reverse proxy |
| Connection fails (firewalls) | Add TURN server to `ICE_SERVERS` |
| Memory not releasing | Check `ROOM_TTL_MS` for abandoned room cleanup |

---

## See Also

- 📋 [Environment Reference Guide](../plans/ENV_REFERENCE.md) - Tuning recommendations
- 🛠️ [Development Guide](./development.md) - Modifying configuration code
- 📊 [Architecture Decisions](../plans/ARCHITECTURE.md) - Why these defaults exist
