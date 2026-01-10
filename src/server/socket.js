const logger = require("./logger");
const config = require("./config");

// Room registry with TTL tracking
const roomRegistry = new Map(); // { roomId: { createdAt, peers: Set<socketId> } }

// WebSocket rate limiting - track events per socket
const socketRateLimits = new Map();
const RATE_LIMIT_WINDOW = 1000; // 1 second
const RATE_LIMIT_MAX = 10; // Max 10 events per second

const ROOM_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

function isValidRoomId(roomId) {
  return typeof roomId === "string" && ROOM_ID_REGEX.test(roomId);
}

function inRoom(socket, roomId) {
  return socket.rooms && socket.rooms.has(roomId);
}

// Check and enforce rate limit for socket
function checkRateLimit(socketId) {
  const now = Date.now();
  
  if (!socketRateLimits.has(socketId)) {
    socketRateLimits.set(socketId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }

  const limit = socketRateLimits.get(socketId);
  
  if (now > limit.resetTime) {
    socketRateLimits.set(socketId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (limit.count >= RATE_LIMIT_MAX) {
    return false;
  }

  limit.count++;
  return true;
}

// Validate payload size
function isPayloadValid(data) {
  try {
    const json = typeof data === 'string' ? data : JSON.stringify(data);
    return json.length <= config.maxSignalPayloadBytes;
  } catch {
    return false;
  }
}

// Clean up expired rooms periodically (every 10 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [roomId, info] of roomRegistry.entries()) {
    if (now - info.createdAt > config.roomTtlMs) {
      roomRegistry.delete(roomId);
    }
  }
}, 600000); // 10 minutes

module.exports = (io) => {
  io.on("connection", (socket) => {
    logger.info("socket_connected", { socketId: socket.id });

    socket.on("create-room", (roomId) => {
      try {
        if (!isValidRoomId(roomId)) {
          logger.warn("invalid_room_id_on_create", { socketId: socket.id, roomId });
          socket.emit("app-error", { message: "Invalid room ID" });
          return;
        }

        if (roomRegistry.has(roomId)) {
          logger.warn("room_already_exists", { socketId: socket.id, roomId });
          socket.emit("app-error", { message: "Room already exists" });
          return;
        }

        // Create room with TTL tracking
        roomRegistry.set(roomId, {
          createdAt: Date.now(),
          peers: new Set([socket.id])
        });

        socket.join(roomId);
        socket.emit("room-created", { roomId });
        logger.info("room_created", { socketId: socket.id, roomId });
      } catch (err) {
        logger.error("create_room_failed", { socketId: socket.id, roomId, error: err.message });
        socket.emit("app-error", { message: "Failed to create room" });
      }
    });

    socket.on("join-room", (roomId) => {
      try {
        if (!isValidRoomId(roomId)) {
          logger.warn("invalid_room_id_on_join", { socketId: socket.id, roomId });
          socket.emit("app-error", { message: "Invalid room ID" });
          return;
        }

        if (!roomRegistry.has(roomId)) {
          socket.emit("room-not-found", { roomId });
          return;
        }

        const roomInfo = roomRegistry.get(roomId);
        
        // Enforce max 2 peers per room
        if (roomInfo.peers.size >= config.maxPeersPerRoom) {
          logger.warn("room_full", { socketId: socket.id, roomId, peerCount: roomInfo.peers.size });
          socket.emit("app-error", { message: "Room is full" });
          return;
        }

        roomInfo.peers.add(socket.id);
        socket.join(roomId);

        // Notify sender that peer joined
        socket.to(roomId).emit("peer-joined", { peerId: socket.id, roomId });
        socket.emit("room-joined", { roomId });

        logger.info("room_joined", { socketId: socket.id, roomId, peerCount: roomInfo.peers.size });
      } catch (err) {
        logger.error("join_room_failed", { socketId: socket.id, roomId, error: err.message });
        socket.emit("app-error", { message: "Failed to join room" });
      }
    });

    // Generic relay with validation + membership check + payload size limit
    function relay(eventName) {
      return (data = {}) => {
        try {
          // Validate payload size
          if (!isPayloadValid(data)) {
            logger.warn("payload_too_large", { socketId: socket.id, eventName });
            socket.emit("app-error", { message: "Payload too large" });
            return;
          }

          // Skip rate limiting for data-heavy events
          const isDataHeavy = ['offer', 'answer'].includes(eventName);
          if (!isDataHeavy && !checkRateLimit(socket.id)) {
            logger.warn("rate_limit_exceeded", { socketId: socket.id, eventName });
            socket.emit("app-error", { message: "Too many requests" });
            return;
          }

          // Extract and validate roomId
          let roomId = data.roomId;
          if (typeof roomId === "object" && roomId !== null && roomId.roomId) {
            roomId = roomId.roomId;
          }

          if (!isValidRoomId(roomId)) {
            logger.warn("invalid_room_id_on_signal", { socketId: socket.id, eventName, roomId });
            socket.emit("app-error", { message: "Invalid room ID" });
            return;
          }

          // Enforce membership: sender must be in the room
          if (!inRoom(socket, roomId)) {
            logger.warn("signal_from_non_member", { socketId: socket.id, eventName, roomId });
            socket.emit("app-error", { message: "Not a member of this room" });
            return;
          }

          // Log signal relay
          logger.info("signal_relayed", { 
            socketId: socket.id, 
            eventName, 
            roomId,
            hasData: !!data[eventName.toLowerCase()],
            dataSize: JSON.stringify(data).length
          });

          // Relay to other peers in room with sender ID
          socket.to(roomId).emit(eventName, { ...data, from: socket.id });
        } catch (err) {
          logger.error("signal_relay_failed", { socketId: socket.id, eventName, error: err.message });
          socket.emit("app-error", { message: "Signaling failed" });
        }
      };
    }

    socket.on("offer", relay("offer"));
    socket.on("answer", relay("answer"));
    socket.on("candidate", relay("candidate"));

    socket.on("disconnect", (reason) => {
      logger.info("socket_disconnected", { socketId: socket.id, reason });
      socketRateLimits.delete(socket.id);

      // Remove socket from all rooms in registry
      for (const [roomId, info] of roomRegistry.entries()) {
        info.peers.delete(socket.id);
        if (info.peers.size === 0) {
          roomRegistry.delete(roomId);
        }
      }
    });
  });
}