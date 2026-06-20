// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const allowedOrigins = (process.env.CORS_ORIGINS
  || 'https://castitfe.vanitum.com,http://localhost:4200')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Origin is not allowed'));
  },
  methods: ['GET', 'POST']
};

app.use(cors(corsOptions));

const server = http.createServer(app);
const io = new Server(server, {
  cors: corsOptions
});

const rooms = new Map(); // code -> { tv: socketId, phone: socketId | null }

function generateCode() {
  let code;
  do { code = Math.floor(100000 + Math.random() * 900000).toString(); }
  while (rooms.has(code));
  return code;
}

io.on('connection', (socket) => {
  let currentRoom = null;

  socket.on('create-room', () => {
    const code = generateCode();
    rooms.set(code, { tv: socket.id, phone: null });
    currentRoom = code;
    socket.join(code);
    socket.emit('room-created', { code });
  });

  socket.on('join-room', ({ code }) => {
    const room = rooms.get(code);
    if (!room) { socket.emit('error', { message: 'Room not found' }); return; }
    if (room.phone) { socket.emit('error', { message: 'Room is full' }); return; }
    room.phone = socket.id;
    currentRoom = code;
    socket.join(code);
    socket.emit('room-joined', { code });
    socket.to(code).emit('peer-joined');
  });

  socket.on('offer', ({ sdp }) => {
    if (currentRoom) socket.to(currentRoom).emit('offer', { sdp });
  });

  socket.on('answer', ({ sdp }) => {
    if (currentRoom) socket.to(currentRoom).emit('answer', { sdp });
  });

  socket.on('ice-candidate', ({ candidate }) => {
    if (currentRoom) socket.to(currentRoom).emit('ice-candidate', { candidate });
  });

  socket.on('leave-room', () => cleanup());

  socket.on('disconnect', () => cleanup());

  function cleanup() {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (room) {
      socket.to(currentRoom).emit('peer-left');
      if (room.tv === socket.id) rooms.delete(currentRoom);
      else { room.phone = null; }
    }
    currentRoom = null;
  }
});

app.get('/health', (_, res) => res.json({ status: 'ok' }));

server.listen(3000, () => console.log('castit signaling server running on :3000'));
