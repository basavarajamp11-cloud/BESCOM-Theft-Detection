const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'bescom_grid.db');
const db = new DatabaseSync(dbPath);

// Enable WAL mode for high performance concurrent telemetry logging
db.exec(`PRAGMA journal_mode = WAL;`);
db.exec(`PRAGMA synchronous = NORMAL;`);
db.exec(`PRAGMA foreign_keys = ON;`);

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS substations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      zone TEXT NOT NULL,
      subdivision TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      capacity_mva REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS feeders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      substation_id INTEGER NOT NULL REFERENCES substations(id),
      voltage_kv REAL NOT NULL DEFAULT 11.0,
      status TEXT NOT NULL DEFAULT 'ACTIVE'
    );

    CREATE TABLE IF NOT EXISTS transformers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      feeder_id INTEGER NOT NULL REFERENCES feeders(id),
      capacity_kva REAL NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      rated_current REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'NORMAL'
    );

    CREATE TABLE IF NOT EXISTS consumers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rr_number TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      address TEXT NOT NULL,
      transformer_id INTEGER NOT NULL REFERENCES transformers(id),
      sanctioned_kw REAL NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      meter_serial TEXT UNIQUE NOT NULL,
      relay_status TEXT NOT NULL DEFAULT 'CONNECTED',
      phone TEXT NOT NULL,
      active_theft_scenario TEXT NOT NULL DEFAULT 'NONE'
    );

    CREATE TABLE IF NOT EXISTS telemetry_dtc (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transformer_id INTEGER NOT NULL REFERENCES transformers(id),
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      v_r REAL, v_y REAL, v_b REAL,
      i_r REAL, i_y REAL, i_b REAL, i_n REAL,
      active_power_kw REAL NOT NULL,
      reactive_kvar REAL NOT NULL,
      pf REAL NOT NULL,
      cumulative_kwh REAL NOT NULL,
      freq REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS telemetry_meter (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      consumer_id INTEGER NOT NULL REFERENCES consumers(id),
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      voltage REAL NOT NULL,
      current REAL NOT NULL,
      active_power_kw REAL NOT NULL,
      pf REAL NOT NULL,
      cumulative_kwh REAL NOT NULL,
      tamper_flag INTEGER DEFAULT 0,
      tamper_type TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transformer_id INTEGER NOT NULL REFERENCES transformers(id),
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      dtc_power_kw REAL NOT NULL,
      consumers_power_kw REAL NOT NULL,
      delta_power_kw REAL NOT NULL,
      technical_loss_kw REAL NOT NULL,
      theft_loss_kw REAL NOT NULL,
      loss_percent REAL NOT NULL,
      status TEXT NOT NULL,
      confidence_score REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_no TEXT UNIQUE NOT NULL,
      transformer_id INTEGER NOT NULL REFERENCES transformers(id),
      consumer_id INTEGER REFERENCES consumers(id),
      theft_type TEXT NOT NULL,
      severity TEXT NOT NULL,
      estimated_theft_kw REAL NOT NULL,
      hourly_financial_loss REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      reported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME,
      notes TEXT,
      action_taken TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_telemetry_dtc_tx ON telemetry_dtc(transformer_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_telemetry_meter_cons ON telemetry_meter(consumer_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_audit_tx ON audit_logs(transformer_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status, reported_at);
  `);
}

initSchema();

module.exports = {
  db,
  initSchema
};
