require('dotenv').config();
const http = require('http');
const path = require('path');
const express = require('express');
const cors = require('cors');
const { WebSocketServer, WebSocket } = require('ws');

// Database initialization
const { initSchema } = require('./database/db');
initSchema();

// Ensure seeds are populated
const { seedDatabase } = require('./database/seed');
seedDatabase();

// Simulator and routes
const gridSimulator = require('./engine/gridSimulator');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Mount API
app.use('/api', apiRoutes);

// Fallback to SPA index.html
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  next();
});

// Create HTTP server
const server = http.createServer(app);

// Initialize WebSocket server
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  console.log(`🔌 New SCADA Operator Console connected from ${clientIp}`);

  // Send immediate initial summary
  ws.send(JSON.stringify({
    type: 'WELCOME',
    message: 'Connected to BESCOM Smart Grid SCADA Monitoring & Vigilance Stream',
    summary: gridSimulator.getGridSummary(),
    server_time: new Date().toISOString()
  }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
      }
    } catch (e) {
      // Ignore malformed messages
    }
  });

  ws.on('close', () => {
    console.log(`❌ Operator Console disconnected (${clientIp})`);
  });
});

// Broadcast live telemetry from simulator to all connected WebSocket clients
gridSimulator.setBroadcaster((payload) => {
  const serialized = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(serialized);
    }
  });
});

// Start grid telemetry simulator
gridSimulator.start();

// Start HTTP & WS server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`================================================================`);
  console.log(`⚡ BESCOM Smart Grid SCADA Monitoring & Theft Detection System`);
  console.log(`⚡ Bangalore Electricity Supply Company Limited`);
  console.log(`⚡ Server running at http://localhost:${PORT}`);
  console.log(`⚡ WebSocket Stream active at ws://localhost:${PORT}`);
  console.log(`================================================================`);
});

// Graceful shutdown handling
function handleShutdown(signal) {
  console.log(`\n🛑 Received ${signal}. Gracefully stopping BESCOM SCADA system...`);
  gridSimulator.stop();
  server.close(() => {
    console.log('✓ HTTP and WebSocket server closed.');
    process.exit(0);
  });
}

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
