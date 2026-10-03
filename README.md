# ⚡ BESCOM Zone 1 Power Theft Detection & SCADA Telemetry System

A real-time, low-latency SCADA monitoring and energy audit web application engineered for the **Bangalore Electricity Supply Company Limited (BESCOM)** smart grid telemetry division.

The system performs continuous **Kirchhoff's Current Law (KCL)** mathematical energy auditing across primary 11 kV feeders and domestic distribution segments to detect, isolate, and alert on unauthorized bypass taps and power theft in real time.

---

## 🌟 Key Engineering & Design Specifications

* **Identity & Visual Standards**:
  * Explicit **BESCOM** SCADA operations identity.
  * Prominent sub-heading banner: **`Zone 1 Current Utilized`**.
  * Utility NOC color palette:
    * Deep Slate / Navy background: `#0f141c`
    * Electric Cyan telemetry accents: `#00d2ff`
    * Bright Emerald normal/balanced indicators: `#00e676`
    * High-Visibility Crimson fault/theft indicators: `#ff1744`
* **Real-Time Telemetry Interface (Zone 1)**:
  * **Card A**: `Current Entering Zone 1` (Inflow from primary feeder: $I_{\text{In}}$)
  * **Card B**: `Current Exiting Zone 1` (Outflow to Zone 2: $I_{\text{Out}}$)
  * **Card C**: `Authorized Current Utilized` (Combined domestic draw: $I_{\text{Auth}} = \text{House 1} + \text{House 2}$)
  * **Card D**: `Unauthorized Current Utilized` (Illicit parasitic bypass: $I_{\text{Theft}}$)
  * **Interactive KCL Balance Bar**: Visualizes dynamic proportion:
    $$I_{\text{In}} - I_{\text{Out}} - I_{\text{Auth}} = I_{\text{Theft}}$$
* **Instantaneous Power Theft Alert Modal**:
  * Triggered automatically whenever `theft_detected === true` or $I_{\text{Theft}} > 0.25\text{ A}$.
  * Explicitly displays:
    * **Location**: `Monitored Zone 1 Feeder Tap`
    * **Exact Stolen Magnitude**: Dynamically formatted in Amperes (e.g., `Theft Current: 3.450 A`)
    * **Timestamp** of detection
    * **Manual Dismiss/Acknowledge Button**: Closes the modal until the next distinct theft event.
* **Streaming & Network Resilience**:
  * Primary stream: **Server-Sent Events (SSE)** via `/api/telemetry/stream`.
  * Automatic Fallback: **1-second HTTP polling** to `/api/telemetry/live` upon SSE disconnect.
  * Live status indicator reflecting connection health.
  * **Zero External Dependencies**: Strictly vanilla HTML5, CSS3, and JavaScript (no CDNs, no third-party messaging).

---

## 🚀 Running the System

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Production Server
```bash
npm start
```
The server runs on **port 5000** (`http://localhost:5000`).

---

## 📡 REST & Streaming API Endpoints

### 1. Ingestion Endpoint (ESP32 Edge Node)
* **Method**: `POST /api/telemetry`
* **Content-Type**: `application/json`
* **Payload Format**:
```json
{
  "i_in": 7.450,
  "i_out": 2.100,
  "house_1": 1.650,
  "house_2": 1.500,
  "theft_detected": true,
  "location": "Monitored Zone 1 Feeder Tap",
  "timestamp": "2026-10-03T09:30:00.000Z"
}
```

### 2. Low-Latency Streaming (SSE)
* **Method**: `GET /api/telemetry/stream`
* **Content-Type**: `text/event-stream`
* Emits live JSON telemetry updates every time a packet arrives or the telemetry state changes.

### 3. Polling Fallback
* **Method**: `GET /api/telemetry/live`
* Returns current snapshot of Zone 1 electrical telemetry.

### 4. Interactive Test Simulator
* **Method**: `POST /api/telemetry/simulate`
* **Payload**: `{"theft": true, "magnitude": 3.450}` or `{"theft": false}`
