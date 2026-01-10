const logger = require('./logger');

// Track active connections to avoid duplicate logs
const activeConnections = new Set();

module.exports = (io) => {
    io.on('connection', (socket) => {
        // Only log if this is a new unique connection
        if (!activeConnections.has(socket.id)) {
            activeConnections.add(socket.id);
            logger.info(`User connected: ${socket.id} (Total users: ${activeConnections.size})`);
        }

        socket.on('join-room', (roomId) => {
            if (!roomId || typeof roomId !== 'string' || !/^[a-zA-Z0-9]+$/.test(roomId)) {
                logger.error('Invalid room ID received', { roomId });
                socket.emit('error', 'Invalid room ID');
                return;
            }
            const rooms = io.sockets.adapter.rooms;
            const room = rooms.get(roomId);

            if (room && room.size > 0) {
                socket.join(roomId);
                socket.to(roomId).emit('peer-joined', socket.id);
                socket.emit('room-joined', roomId);
            } else {
                socket.emit('room-not-found');
            }
        });

        socket.on('create-room', (roomId) => {
            if (!roomId || typeof roomId !== 'string' || !/^[a-zA-Z0-9]+$/.test(roomId)) {
                logger.error('Invalid room ID received', { roomId });
                socket.emit('error', 'Invalid room ID');
                return;
            }
            socket.join(roomId);
        });

        socket.on('offer', (data) => {
            socket.to(data.roomId).emit('offer', data);
        });

        socket.on('answer', (data) => {
            socket.to(data.roomId).emit('answer', data);
        });

        socket.on('candidate', (data) => {
            socket.to(data.roomId).emit('candidate', data);
        });

        socket.on('disconnect', () => {
            // Only log if this user was being tracked
            if (activeConnections.has(socket.id)) {
                activeConnections.delete(socket.id);
                logger.info(`User disconnected: ${socket.id} (Total users: ${activeConnections.size})`);
            }
        });
    });
};
