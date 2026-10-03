# ⚡ BESCOM Smart Grid SCADA Monitoring & Real-Time Power Theft Detection System

A production-grade, real-time SCADA IoT and grid operations platform developed for the **Bangalore Electricity Supply Company Limited (BESCOM)** smart grid monitoring and vigilance enforcement divisions.

The system continuously audits electrical distribution networks across Bengaluru (BMAZ & BRAZ) using **Kirchhoff's Current Law (KCL) energy balancing**, real-time IoT smart meter telemetry, and automated AI anomaly detection to identify, locate, and legally penalize power theft and unauthorized feeder tapping.

---

## 🌟 Key Architecture & Capabilities

### 1. High-Precision KCL Power Balancing Engine
* **Transformer-to-Consumer Auditing**: Continuously calculates delta power between Distribution Transformer Center (DTC) master meters and downstream aggregated smart meters:
  $$\Delta P = P_{\text{DTC}} - \sum_{i=1}^{n} P_{\text{consumer}, i}$$
* **Technical vs. Commercial Loss Segregation**: Separates allowable Joule heating ($I^2 \cdot R$) and core losses ($\approx 3.0\% - 5.5\%$) from commercial theft loss ($P_{\text{theft}} = \Delta P - P_{\text{technical}}$).
* **Multi-Factor Confidence Scoring (0–100%)**: Evaluates consecutive anomaly cycles, three-phase load imbalance ($I_R, I_Y, I_B$), neutral return currents, and power factor distortions to eliminate false alarms from motor inrush or sampling jitter.

### 2. Multi-Vector Tamper Detection
* **Direct Line Hooking / Feeder Tapping**: Detects unmetered bypass draws directly off overhead conductors.
* **Neutral Wire Disconnection / Tampering**: Detects ground-loop return theft and CT neutral bypass where consumers route current via earth pipes.
* **Meter Shunt / Bypass**: Detects physical bypass jumpers where metered consumption drops while line draw surges.
* **Magnetic Saturation**: Detects strong external neodymium magnetic interference (>0.5 Tesla) intended to saturate internal current transformers.
* **CT Polarity Reversal**: Identifies flipped current sensor vectors causing reverse energy flow.
* **Optical Enclosure Breach**: Registers terminal cover breaches on energized meters.

### 3. Real-Time SCADA GIS Command Center
* **Interactive Bengaluru Grid Map (Leaflet.js)**: Visualizes 66/11kV substations, 11kV radial feeders, 11kV/415V DTC transformers, and consumer smart meters across Indiranagar, Koramangala, Whitefield, and Peenya.
* **Dynamic Color-Coded Status**:
  * 🟢 **Balanced**: Losses $\le 5.5\%$, normal grid operation.
  * 🟡 **High Technical Loss**: Losses between $5.5\% - 7.5\%$.
  * 🔴 **Critical Theft**: Unaccounted draw $> 1.2\text{ kW}$ or loss $> 7.5\%$.
  * ⚪ **Disconnected**: Remotely tripped circuit breakers.
* **Sub-Second Telemetry Streaming**: WebSockets stream real-time phase voltages, phase currents ($I_R, I_Y, I_B, I_N$), power factors, and kW loads every 3 seconds.

### 4. Vigilance Enforcement & Legal Compliance
* **Automated FIR Dossier Generation**: Produces formal evidentiary dossiers compliant with **Section 135 & 138 of the Electricity Act 2003** with GPS coordinates, consumer RR numbers, transformer codes, and hourly revenue leakage rates.
* **Simulated WhatsApp / SMS Squad Dispatch**: Automatically triggers field dispatch alerts to the jurisdictional Assistant Executive Engineer (AEE) and Vigilance Flying Squad.
* **Remote Circuit Breaker Tripping**: Remote DLMS/COSEM relay control to disconnect power or limit load (to 500W) on offending meters directly from the SCADA console.
* **KERC Regulatory Compliance (AT&C)**: Tracks feeder-level Aggregate Technical & Commercial (AT&C) losses against the Karnataka Electricity Regulatory Commission urban benchmark of $\le 11.5\%$ with one-click CSV export.

---

## 📁 Project Structure

```
~/BESCOM-Theft-Detection/
├── config/
│   └── constants.js             # BESCOM zones, tariffs (KERC ₹8.50/kWh), thresholds & tamper types
├── database/
│   ├── db.js                    # SQLite database schema (WAL mode, foreign keys, indices)
│   └── seed.js                  # Bengaluru grid seed (Substations, Feeders, DTCs, Consumers)
├── engine/
│   ├── energyAuditor.js         # KCL power balance, technical loss modeling & confidence scoring
│   ├── anomalyDetector.js       # Tamper rule engine, incident ticketing & vigilance dispatch
│   └── gridSimulator.js         # AC electrical physics telemetry simulator & scenario injector
├── controllers/
│   ├── telemetryController.js   # SCADA topology, DTC inspector, historical loss queries
│   ├── alertController.js       # Incident ticket management, WhatsApp payload, FIR dossier
│   ├── meterController.js       # Remote breaker trip/reconnect & scenario triggers
│   └── analyticsController.js   # KERC AT&C compliance reports & CSV data export
├── routes/
│   └── api.js                   # REST endpoints router
├── public/                      # Web SCADA Operations Interface
│   ├── index.html               # Main command center layout
│   ├── css/
│   │   └── styles.css           # High-contrast dark utility operations SCADA theme
│   └── js/
│       ├── ws.js                # Resilient WebSocket client with auto-reconnect
│       ├── map.js               # Leaflet GIS map with custom SVG substation/DTC markers
│       ├── charts.js            # Chart.js live power balance and AT&C loss charts
│       └── app.js               # Main application controller, audio siren, FIR modal
├── .env.example                 # Environment configuration template
├── .env                         # Active configuration
├── package.json                 # Node.js dependencies and scripts
└── server.js                    # Express HTTP & WebSocket Server
```

---

## 🚀 Getting Started

### 1. Prerequisites
* **Node.js**: v20+ (Verified on Node.js v26 LTS in Termux/Linux)
* **npm**: v10+

### 2. Installation
All project files are isolated in `~/BESCOM-Theft-Detection`:
```bash
cd ~/BESCOM-Theft-Detection
npm install
```

### 3. Initialize & Seed Database
Seeds the database with Bengaluru substations, 11kV feeders, distribution transformers, and consumers:
```bash
npm run seed
```

### 4. Start the Application
```bash
npm start
```

Open your browser at **`http://localhost:3000`**.

---

## 🧪 Interactive Scenario Simulator

The SCADA console includes live test injection controls:
* **⚡ Overhead Tap (+8.5 kW Hooking)**: Simulates direct unauthorized tapping off the Defence Colony DTC (Indiranagar).
* **🔌 Bypass Consumer Meter**: Simulates an internal shunt bypass on Corner Bakery & Cafe (RR #E1-40104).
* **⚠️ Neutral Wire Cut / Earth Leak**: Simulates neutral line disconnection and earth-return leakage on Deepa & Rohit Sen (RR #S3-60102).
* **🧲 Neodymium Magnetic Tamper**: Simulates magnetic sensor saturation on Meera Krishnan (RR #E3-80103).
* **✓ Reset All to Normal**: Restores all feeders and meters to normal balanced operation.

---

## 📡 REST API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/topology` | Full grid hierarchy (Substations -> Feeders -> DTCs -> Consumers) |
| `GET` | `/api/summary` | Real-time grid demand, active thefts, and financial loss rate |
| `GET` | `/api/transformers/:id` | Live 3-phase telemetry, KCL audit, and connected meters for a DTC |
| `GET` | `/api/history/losses` | Historical 20-cycle power balance readings for charting |
| `GET` | `/api/incidents` | Active and historical vigilance case tickets |
| `PATCH` | `/api/incidents/:id` | Update case status (`ACKNOWLEDGED`, `SQUAD_DISPATCHED`, `RESOLVED`) |
| `GET` | `/api/incidents/:id/fir` | Generate legal FIR evidentiary dossier under Electricity Act 2003 |
| `POST` | `/api/consumers/:id/relay` | Remote breaker control (`CONNECTED`, `DISCONNECTED`, `LOAD_LIMITED`) |
| `POST` | `/api/scenarios/trigger` | Inject simulated theft conditions (`HOOKING`, `METER_BYPASS`, etc.) |
| `GET` | `/api/reports/atc` | Feeder-level AT&C loss compliance report vs KERC benchmark |
| `GET` | `/api/reports/audit.csv` | Export energy audit log as CSV for regulatory submission |

---

## ⚖️ Legal & Regulatory Context
* **Governing Body**: Karnataka Electricity Regulatory Commission (KERC)
* **Standard Tariff**: ₹8.50 / kWh (Commercial LT-3 Schedule)
* **Statutory Enforcement**: Sections 135, 138, and 150 of The Indian Electricity Act 2003
* **Operator**: Bangalore Electricity Supply Company Limited (BESCOM)
