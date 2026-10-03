const path = require('path');
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-memory telemetry state for Zone 1
let currentTelemetry = {
  i_in: 5.250,        // Current entering Zone 1 (A)
  i_out: 2.100,       // Current exiting Zone 1 to Zone 2 (A)
  house_1: 1.650,     // Domestic consumer 1 (A)
  house_2: 1.500,     // Domestic consumer 2 (A)
  i_auth: 3.150,      // Authorized utilized = house_1 + house_2 (A)
  i_theft: 0.000,     // Stolen/parasitic bypass = i_in - i_out - i_auth (A)
  theft_detected: false,
  location: 'Monitored Zone 1 Feeder Tap',
  timestamp: new Date().toISOString(),
  source: 'INTERNAL_SIMULATOR' // or 'ESP32_EDGE_NODE'
};

let lastEsp32PacketTime = 0;
let simulatedTheftActive = false;
let simulatedTheftMagnitude = 3.450;

// Connected SSE clients
const sseClients = new Set();

/**
 * Broadcast telemetry data to all active SSE subscribers
 */
function broadcastTelemetry(data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch (err) {
      sseClients.delete(client);
    }
  }
}

/**
 * Process and normalize telemetry packet
 */
function processTelemetry(incoming) {
  const i_in = parseFloat(incoming.i_in ?? currentTelemetry.i_in);
  const i_out = parseFloat(incoming.i_out ?? currentTelemetry.i_out);
  const house_1 = parseFloat(incoming.house_1 ?? currentTelemetry.house_1);
  const house_2 = parseFloat(incoming.house_2 ?? currentTelemetry.house_2);

  const i_auth = parseFloat((incoming.i_auth ?? (house_1 + house_2)).toFixed(3));
  
  // Calculate KCL delta: I_In - I_Out - I_Auth = I_Theft
  const rawTheft = i_in - i_out - i_auth;
  const i_theft = parseFloat(Math.max(0, rawTheft).toFixed(3));
  
  // Trigger condition: theft_detected flag or I_Theft > 0.25A
  const theft_detected = Boolean(incoming.theft_detected ?? (i_theft > 0.25));

  currentTelemetry = {
    i_in: parseFloat(i_in.toFixed(3)),
    i_out: parseFloat(i_out.toFixed(3)),
    house_1: parseFloat(house_1.toFixed(3)),
    house_2: parseFloat(house_2.toFixed(3)),
    i_auth,
    i_theft,
    theft_detected,
    location: incoming.location || 'Monitored Zone 1 Feeder Tap',
    timestamp: incoming.timestamp || new Date().toISOString(),
    source: incoming.source || 'ESP32_EDGE_NODE'
  };

  broadcastTelemetry(currentTelemetry);
  return currentTelemetry;
}

// -------------------------------------------------------------
// REST & SSE Endpoints
// -------------------------------------------------------------

/**
 * HTTP POST /api/telemetry
 * Ingestion endpoint for ESP32 edge node JSON packets
 */
app.post('/api/telemetry', (req, res) => {
  const packet = req.body;
  if (!packet || typeof packet !== 'object') {
    return res.status(400).json({ success: false, error: 'Invalid JSON payload' });
  }

  lastEsp32PacketTime = Date.now();
  packet.source = 'ESP32_EDGE_NODE';
  const updated = processTelemetry(packet);

  return res.status(200).json({
    success: true,
    message: 'Telemetry packet ingested successfully',
    data: updated
  });
});

/**
 * GET /api/telemetry/stream
 * Server-Sent Events (SSE) streaming endpoint for real-time browser updates
 */
app.get('/api/telemetry/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  // Push immediate current state to newly connected client
  res.write(`data: ${JSON.stringify(currentTelemetry)}\n\n`);
  sseClients.add(res);

  // Heartbeat comment every 15s to keep connections alive
  const keepAlive = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 15000);

  req.on('close', () => {
    clearInterval(keepAlive);
    sseClients.delete(res);
  });
});

/**
 * GET /api/telemetry/live
 * HTTP Polling Fallback endpoint (polled every 1s when SSE is unavailable)
 */
app.get('/api/telemetry/live', (req, res) => {
  res.status(200).json({
    success: true,
    data: currentTelemetry
  });
});

/**
 * POST /api/telemetry/simulate
 * Interactive test injection endpoint for testing alerts and theft triggers
 */
app.post('/api/telemetry/simulate', (req, res) => {
  const { theft, magnitude } = req.body;
  if (typeof theft === 'boolean') {
    simulatedTheftActive = theft;
    if (magnitude) simulatedTheftMagnitude = parseFloat(magnitude);
  }

  // Trigger immediate tick with simulated state
  tickSimulator();

  res.status(200).json({
    success: true,
    simulatedTheftActive,
    simulatedTheftMagnitude,
    data: currentTelemetry
  });
});

// Fallback to index.html for root navigation
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// -------------------------------------------------------------
// Autonomous Background Simulator
// (Active when no external ESP32 node is broadcasting)
// -------------------------------------------------------------
function tickSimulator() {
  const now = Date.now();
  // If an actual ESP32 node sent data in the last 6 seconds, do not overwrite with simulator
  if (now - lastEsp32PacketTime < 6000) {
    return;
  }

  // Generate realistic slight fluctuations for domestic load
  const jitter1 = (Math.random() * 0.08 - 0.04);
  const jitter2 = (Math.random() * 0.06 - 0.03);
  const jitterOut = (Math.random() * 0.05 - 0.025);

  const house_1 = Math.max(0.2, 1.650 + jitter1);
  const house_2 = Math.max(0.2, 1.500 + jitter2);
  const i_auth = house_1 + house_2;
  const i_out = Math.max(0.5, 2.100 + jitterOut);

  let theftCurrent = 0;
  let theftDetected = false;

  if (simulatedTheftActive) {
    theftCurrent = simulatedTheftMagnitude + (Math.random() * 0.1 - 0.05);
    theftDetected = true;
  }

  // I_In must equal I_Out + I_Auth + I_Theft
  const i_in = i_out + i_auth + theftCurrent;

  processTelemetry({
    i_in,
    i_out,
    house_1,
    house_2,
    i_auth,
    i_theft: theftCurrent,
    theft_detected: theftDetected,
    location: 'Monitored Zone 1 Feeder Tap',
    timestamp: new Date().toISOString(),
    source: 'INTERNAL_SIMULATOR'
  });
}

// Tick simulator every 1000ms
setInterval(tickSimulator, 1000);

// Start Server on Port 5000
app.listen(PORT, '0.0.0.0', () => {
  console.log(`================================================================`);
  console.log(`⚡ BESCOM Zone 1 Power Theft Detection & SCADA Telemetry System`);
  console.log(`⚡ Server running on http://localhost:${PORT}`);
  console.log(`⚡ Ingestion Endpoint (ESP32): POST http://localhost:${PORT}/api/telemetry`);
  console.log(`⚡ Streaming Endpoint (SSE):   GET  http://localhost:${PORT}/api/telemetry/stream`);
  console.log(`⚡ Polling Endpoint (Fallback):GET  http://localhost:${PORT}/api/telemetry/live`);
  console.log(`================================================================`);
});
