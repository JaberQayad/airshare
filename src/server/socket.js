const logger = require("./logger");

// If you truly need to know "rooms that were created", track them explicitly.
// Otherwise, "room not found" is not reliable in Socket.IO.
const createdRooms = new Set();

// WebSocket rate limiting - track events per socket
const socketRateLimits = new Map();
const RATE_LIMIT_WINDOW = 1000; // 1 second
const RATE_LIMIT_MAX = 10; // Max 10 events per second

const ROOM_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

function isValidRoomId(roomId) {
  return typeof roomId === "string" && ROOM_ID_REGEX.test(roomId);
}

function inRoom(socket, roomId) {
  // socket.rooms is a Set that always contains socket.id plus joined rooms
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
  
  // Reset if window expired
  if (now > limit.resetTime) {
    socketRateLimits.set(socketId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }

  // Check if limit exceeded
  if (limit.count >= RATE_LIMIT_MAX) {
    return false;
  }

  limit.count++;
  return true;
}

module.exports = (io) => {
  io.on("connection", (socket) => {
    logger.info("socket_connected", {
      socketId: socket.id,
      // Engine.IO has some handshake info if you want it:
      // ip: socket.handshake.address,
    });

    socket.on("create-room", (roomId) => {
      try {
        if (!isValidRoomId(roomId)) {
          logger.warn("invalid_room_id_on_create", { socketId: socket.id, roomId });
          socket.emit("app-error", { message: "Invalid room ID" });
          return;
        }

        socket.join(roomId);
        createdRooms.add(roomId);

        socket.emit("room-created", { roomId });
        logger.info("room_created", { socketId: socket.id, roomId });
      } catch (err) {
        logger.error("create_room_failed", { socketId: socket.id, roomId, err });
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

        // Reliable "not found" only if you track created rooms yourself
        if (!createdRooms.has(roomId)) {
          socket.emit("room-not-found", { roomId });
          return;
        }

        socket.join(roomId);

        // Notify others + ack to joiner
        socket.to(roomId).emit("peer-joined", { peerId: socket.id, roomId });
        socket.emit("room-joined", { roomId });

        logger.info("room_joined", { socketId: socket.id, roomId });
      } catch (err) {
        logger.error("join_room_failed", { socketId: socket.id, roomId, err });
        socket.emit("app-error", { message: "Failed to join room" });
      }
    });

    // Generic relay with validation + membership check + backpressure handling
    function relay(eventName) {
      return (data = {}) => {
        try {
          // Skip rate limiting for data-heavy events (offer/answer contain SDP which can be large)
          const isDataHeavy = ['offer', 'answer'].includes(eventName);
          if (!isDataHeavy && !checkRateLimit(socket.id)) {
            logger.warn("rate_limit_exceeded", { socketId: socket.id, eventName });
            socket.emit("app-error", { message: "Too many requests" });
            return;
          }

          // Extract roomId - handle both direct string and nested object format
          let roomId = data.roomId;
          if (typeof roomId === "object" && roomId !== null && roomId.roomId) {
            roomId = roomId.roomId;
          }

          if (!isValidRoomId(roomId)) {
            logger.warn("invalid_room_id_on_signal", { socketId: socket.id, eventName, roomId });
            socket.emit("app-error", { message: "Invalid room ID" });
            return;
          }

          if (!inRoom(socket, roomId)) {
            logger.warn("signal_from_non_member", { socketId: socket.id, eventName, roomId });
            socket.emit("app-error", { message: "Not a member of this room" });
            return;
          }

          // Relay the data with backpressure handling
          const targetSockets = io.sockets.adapter.rooms.get(roomId);
          if (targetSockets && targetSockets.size > 0) {
            // Use setImmediate to avoid blocking the event loop during large transfers
            setImmediate(() => {
              socket.to(roomId).emit(eventName, { ...data, from: socket.id });
            });
          }
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

      // Clean up rate limit tracking
      socketRateLimits.delete(socket.id);

      // Optional: cleanup empty rooms from registry
      // Note: requires checking adapter rooms; with multiple nodes you need a shared store.
      for (const roomId of createdRooms) {
        const room = io.sockets.adapter.rooms.get(roomId);
        if (!room || room.size === 0) createdRooms.delete(roomId);
      }
    });
  });
};
