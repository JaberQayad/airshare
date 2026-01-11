const logger = require("./logger");
const config = require("./config");

// Room registry with TTL tracking
const roomRegistry = new Map(); // { roomId: { createdAt, peers: Set<socketId> } }

// Pending join requests (receiver tabs that have the link but aren't in the room yet)
// Map<socketId, roomId>
const pendingJoinRequests = new Map();

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
        if (!checkRateLimit(socket.id)) {
          logger.warn("rate_limit_exceeded", { socketId: socket.id, eventName: "create-room" });
          socket.emit("app-error", { message: "Too many requests" });
          return;
        }

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
        if (!checkRateLimit(socket.id)) {
          logger.warn("rate_limit_exceeded", { socketId: socket.id, eventName: "join-room" });
          socket.emit("app-error", { message: "Too many requests" });
          return;
        }

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

    // Receiver "lobby" flow: request to join without consuming a room slot yet.
    socket.on("request-join", (roomId) => {
      try {
        if (!checkRateLimit(socket.id)) {
          logger.warn("rate_limit_exceeded", { socketId: socket.id, eventName: "request-join" });
          socket.emit("app-error", { message: "Too many requests" });
          return;
        }

        if (!isValidRoomId(roomId)) {
          logger.warn("invalid_room_id_on_request_join", { socketId: socket.id, roomId });
          socket.emit("app-error", { message: "Invalid room ID" });
          return;
        }

        if (!roomRegistry.has(roomId)) {
          socket.emit("room-not-found", { roomId });
          return;
        }

        // If already in room (e.g., refresh after approval), no-op.
        if (inRoom(socket, roomId)) {
          socket.emit("room-joined", { roomId });
          return;
        }

        pendingJoinRequests.set(socket.id, roomId);

        // Notify existing peers (sender) that someone wants to join.
        // Note: requester isn't in the room yet, but can still emit to the room.
        socket.to(roomId).emit("peer-join-request", { peerId: socket.id, roomId });
        socket.emit("join-requested", { roomId });

        logger.info("join_requested", { socketId: socket.id, roomId });
      } catch (err) {
        logger.error("request_join_failed", { socketId: socket.id, roomId, error: err.message });
        socket.emit("app-error", { message: "Failed to request join" });
      }
    });

    // Sender approves a pending receiver to actually join the room.
    socket.on("peer-accepted", ({ roomId, peerId } = {}) => {
      try {
        if (!checkRateLimit(socket.id)) {
          logger.warn("rate_limit_exceeded", { socketId: socket.id, eventName: "peer-accepted" });
          socket.emit("app-error", { message: "Too many requests" });
          return;
        }

        if (!isValidRoomId(roomId) || typeof peerId !== "string") {
          socket.emit("app-error", { message: "Invalid accept payload" });
          return;
        }

        // Only allow acceptance from an existing room member.
        if (!inRoom(socket, roomId)) {
          socket.emit("app-error", { message: "Not a member of this room" });
          return;
        }

        if (!roomRegistry.has(roomId)) {
          socket.emit("room-not-found", { roomId });
          return;
        }

        const requestedRoom = pendingJoinRequests.get(peerId);
        if (requestedRoom !== roomId) {
          socket.emit("app-error", { message: "No pending request for this peer" });
          return;
        }

        const targetSocket = io.sockets.sockets.get(peerId);
        if (!targetSocket) {
          pendingJoinRequests.delete(peerId);
          socket.emit("app-error", { message: "Peer disconnected" });
          return;
        }

        const roomInfo = roomRegistry.get(roomId);
        if (roomInfo.peers.size >= config.maxPeersPerRoom) {
          targetSocket.emit("app-error", { message: "Room is full" });
          socket.emit("app-error", { message: "Room is full" });
          return;
        }

        pendingJoinRequests.delete(peerId);
        roomInfo.peers.add(peerId);
        targetSocket.join(roomId);

        // Notify sender(s) that the peer actually joined.
        io.to(roomId).emit("peer-joined", { peerId, roomId });
        targetSocket.emit("room-joined", { roomId });

        logger.info("peer_accepted_and_joined", { socketId: socket.id, peerId, roomId, peerCount: roomInfo.peers.size });
      } catch (err) {
        logger.error("peer_accepted_failed", { socketId: socket.id, roomId, peerId, error: err.message });
        socket.emit("app-error", { message: "Failed to accept peer" });
      }
    });

    // Sender rejects a pending receiver.
    socket.on("peer-rejected", ({ roomId, peerId } = {}) => {
      try {
        if (!checkRateLimit(socket.id)) {
          logger.warn("rate_limit_exceeded", { socketId: socket.id, eventName: "peer-rejected" });
          socket.emit("app-error", { message: "Too many requests" });
          return;
        }

        if (!isValidRoomId(roomId) || typeof peerId !== "string") {
          socket.emit("app-error", { message: "Invalid reject payload" });
          return;
        }

        if (!inRoom(socket, roomId)) {
          socket.emit("app-error", { message: "Not a member of this room" });
          return;
        }

        const requestedRoom = pendingJoinRequests.get(peerId);
        if (requestedRoom !== roomId) {
          return;
        }

        pendingJoinRequests.delete(peerId);
        const targetSocket = io.sockets.sockets.get(peerId);
        if (targetSocket) {
          targetSocket.emit("peer-rejected", { roomId, peerId });
        }

        logger.info("peer_rejected", { socketId: socket.id, peerId, roomId });
      } catch (err) {
        logger.error("peer_rejected_failed", { socketId: socket.id, roomId, peerId, error: err.message });
        socket.emit("app-error", { message: "Failed to reject peer" });
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

      pendingJoinRequests.delete(socket.id);

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