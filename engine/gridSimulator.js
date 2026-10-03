const { db } = require('../database/db');
const energyAuditor = require('./energyAuditor');
const anomalyDetector = require('./anomalyDetector');

class GridSimulator {
  constructor() {
    this.intervalId = null;
    this.isRunning = false;
    this.tickRateMs = parseInt(process.env.SIMULATOR_INTERVAL_MS || '3000', 10);
    this.broadcastCallback = null;

    // Active DTC-level hooking scenarios: transformerId -> extraKw
    this.dtcTheftScenarios = new Map();
  }

  setBroadcaster(fn) {
    this.broadcastCallback = fn;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log(`⚡ BESCOM Grid Telemetry Simulator started (Tick: ${this.tickRateMs}ms)`);
    this.tick();
    this.intervalId = setInterval(() => this.tick(), this.tickRateMs);
  }

  stop() {
    if (!this.isRunning) return;
    clearInterval(this.intervalId);
    this.isRunning = false;
    console.log('🛑 BESCOM Grid Telemetry Simulator stopped');
  }

  triggerDtcHooking(transformerId, extraKw = 8.5) {
    this.dtcTheftScenarios.set(Number(transformerId), extraKw);
    console.log(`⚠️ Injected Direct Line Hooking on DTC #${transformerId}: +${extraKw} kW unmetered`);
  }

  clearDtcHooking(transformerId) {
    this.dtcTheftScenarios.delete(Number(transformerId));
    console.log(`✓ Cleared Direct Line Hooking on DTC #${transformerId}`);
  }

  setConsumerTheft(consumerId, scenario) {
    const stmt = db.prepare('UPDATE consumers SET active_theft_scenario = ? WHERE id = ?');
    stmt.run(scenario, Number(consumerId));
    console.log(`⚠️ Set theft scenario on Consumer #${consumerId}: ${scenario}`);
  }

  clearAllScenarios() {
    this.dtcTheftScenarios.clear();
    db.prepare("UPDATE consumers SET active_theft_scenario = 'NONE'").run();
    db.prepare("UPDATE transformers SET status = 'NORMAL'").run();
    console.log('✓ All grid theft scenarios reset to NORMAL operation');
  }

  tick() {
    try {
      const transformers = db.prepare('SELECT * FROM transformers').all();
      const allTelemetry = [];
      const allAudits = [];
      const newIncidents = [];

      for (const tx of transformers) {
        const consumers = db.prepare('SELECT * FROM consumers WHERE transformer_id = ?').all(tx.id);
        const consumerTelemetries = [];
        let totalConsumerActualPower = 0;
        let totalConsumerMeteredPower = 0;

        // Phase distribution accumulators for DTC
        let rLoad = 0, yLoad = 0, bLoad = 0;

        for (let i = 0; i < consumers.length; i++) {
          const cons = consumers[i];
          const phase = i % 3; // 0=R, 1=Y, 2=B

          // Baseline load factoring time and category
          const baseRatio = 0.35 + (Math.sin(Date.now() / 60000 + i) * 0.15) + (Math.random() * 0.1);
          let actualKw = cons.sanctioned_kw * Math.max(0.2, baseRatio);

          if (cons.relay_status === 'DISCONNECTED') {
            actualKw = 0;
          } else if (cons.relay_status === 'LOAD_LIMITED') {
            actualKw = Math.min(0.5, actualKw);
          }

          let meteredKw = actualKw;
          let tamperFlag = 0;
          let tamperType = null;
          let voltage = 228.0 + (Math.random() * 4.0 - 2.0);

          // Apply consumer active theft scenario
          switch (cons.active_theft_scenario) {
            case 'METER_BYPASS':
              tamperFlag = 1;
              tamperType = 'METER_BYPASS';
              meteredKw = actualKw * 0.08; // 92% power bypassed
              break;
            case 'NEUTRAL_TAMPER':
              tamperFlag = 1;
              tamperType = 'NEUTRAL_TAMPER';
              meteredKw = actualKw * 0.25; // Voltage sag on CT
              voltage = 155.0 + Math.random() * 10;
              break;
            case 'MAGNET':
              tamperFlag = 1;
              tamperType = 'MAGNETIC_INTERFERENCE';
              meteredKw = 0.05; // CT saturated
              break;
            case 'CT_REVERSE':
              tamperFlag = 1;
              tamperType = 'CT_REVERSE';
              meteredKw = -Math.abs(actualKw * 0.8);
              break;
            case 'ENCLOSURE_BREACH':
              tamperFlag = 1;
              tamperType = 'ENCLOSURE_BREACH';
              break;
            default:
              break;
          }

          totalConsumerActualPower += actualKw;
          totalConsumerMeteredPower += Math.max(0, meteredKw);

          if (phase === 0) rLoad += actualKw;
          else if (phase === 1) yLoad += actualKw;
          else bLoad += actualKw;

          const pf = 0.91 + (Math.random() * 0.06);
          const current = voltage > 0 ? (meteredKw * 1000) / (voltage * pf) : 0;

          // Record latest meter telemetry
          const meterRecord = {
            consumer_id: cons.id,
            consumer_name: cons.name,
            rr_number: cons.rr_number,
            transformer_id: tx.id,
            sanctioned_kw: cons.sanctioned_kw,
            meter_serial: cons.meter_serial,
            voltage: parseFloat(voltage.toFixed(1)),
            current: parseFloat(current.toFixed(2)),
            active_power_kw: parseFloat(meteredKw.toFixed(2)),
            actual_load_kw: parseFloat(actualKw.toFixed(2)),
            pf: parseFloat(pf.toFixed(2)),
            cumulative_kwh: parseFloat(((cons.cumulative_kwh || 1200) + (meteredKw * (this.tickRateMs / 3600000))).toFixed(3)),
            tamper_flag: tamperFlag,
            tamper_type: tamperType,
            relay_status: cons.relay_status,
            active_scenario: cons.active_theft_scenario
          };

          consumerTelemetries.push(meterRecord);

          try {
            const insertMeter = db.prepare(`
              INSERT INTO telemetry_meter (
                consumer_id, voltage, current, active_power_kw, pf,
                cumulative_kwh, tamper_flag, tamper_type
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);
            insertMeter.run(
              meterRecord.consumer_id,
              meterRecord.voltage,
              meterRecord.current,
              meterRecord.active_power_kw,
              meterRecord.pf,
              meterRecord.cumulative_kwh,
              meterRecord.tamper_flag,
              meterRecord.tamper_type
            );
          } catch (e) {
            // Log quietly if database busy
          }
        }

        // DTC Level Calculation
        const hookExtra = this.dtcTheftScenarios.get(tx.id) || 0;
        if (hookExtra > 0) {
          rLoad += hookExtra * 0.7; // Unbalanced tapping mostly on Phase R
          yLoad += hookExtra * 0.3;
        }

        const vR = 230.5 + (Math.random() * 3.0 - 1.5);
        const vY = 229.8 + (Math.random() * 3.0 - 1.5);
        const vB = 231.2 + (Math.random() * 3.0 - 1.5);

        const dtcPf = 0.92;
        const iR = (rLoad * 1000) / (vR * dtcPf);
        const iY = (yLoad * 1000) / (vY * dtcPf);
        const iB = (bLoad * 1000) / (vB * dtcPf);

        // Approximate neutral current as magnitude of phasor sum
        const iN = Math.abs((iR - (iY * 0.5 + iB * 0.5)));

        const dtcTotalPower = rLoad + yLoad + bLoad;
        const dtcReactive = dtcTotalPower * Math.tan(Math.acos(dtcPf));

        const dtcRecord = {
          transformer_id: tx.id,
          transformer_name: tx.name,
          transformer_code: tx.code,
          capacity_kva: tx.capacity_kva,
          rated_current: tx.rated_current,
          v_r: parseFloat(vR.toFixed(1)),
          v_y: parseFloat(vY.toFixed(1)),
          v_b: parseFloat(vB.toFixed(1)),
          i_r: parseFloat(iR.toFixed(1)),
          i_y: parseFloat(iY.toFixed(1)),
          i_b: parseFloat(iB.toFixed(1)),
          i_n: parseFloat(iN.toFixed(1)),
          active_power_kw: parseFloat(dtcTotalPower.toFixed(2)),
          reactive_kvar: parseFloat(dtcReactive.toFixed(2)),
          pf: dtcPf,
          freq: parseFloat((49.95 + Math.random() * 0.1).toFixed(2)),
          hooking_active: hookExtra > 0,
          hooking_kw: hookExtra
        };

        try {
          const insertDtc = db.prepare(`
            INSERT INTO telemetry_dtc (
              transformer_id, v_r, v_y, v_b, i_r, i_y, i_b, i_n,
              active_power_kw, reactive_kvar, pf, cumulative_kwh, freq
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          insertDtc.run(
            dtcRecord.transformer_id,
            dtcRecord.v_r, dtcRecord.v_y, dtcRecord.v_b,
            dtcRecord.i_r, dtcRecord.i_y, dtcRecord.i_b, dtcRecord.i_n,
            dtcRecord.active_power_kw, dtcRecord.reactive_kvar, dtcRecord.pf,
            150000 + Date.now() / 10000, dtcRecord.freq
          );
        } catch (e) {
          // Log quietly
        }

        // Run Energy Audit (KCL Delta & Losses)
        const audit = energyAuditor.auditDtcEnergy(dtcRecord, consumerTelemetries);
        allAudits.push(audit);

        // Run Anomaly Detection (Generate tickets / alerts)
        const generated = anomalyDetector.evaluateAnomalies(audit, consumerTelemetries, tx);
        if (generated.length > 0) {
          newIncidents.push(...generated);
        }

        allTelemetry.push({
          transformer: dtcRecord,
          audit,
          consumers: consumerTelemetries
        });
      }

      // Broadcast telemetry to all connected WebSocket clients
      if (this.broadcastCallback) {
        // Query overall grid statistics
        const summary = this.getGridSummary();
        this.broadcastCallback({
          type: 'TELEMETRY_TICK',
          timestamp: new Date().toISOString(),
          summary,
          grid: allTelemetry,
          new_incidents: newIncidents
        });
      }
    } catch (err) {
      console.error('GridSimulator tick error:', err);
    }
  }

  getGridSummary() {
    const totalDtc = db.prepare('SELECT COUNT(*) as count FROM transformers').get().count;
    const totalMeters = db.prepare('SELECT COUNT(*) as count FROM consumers').get().count;
    const activeIncidents = db.prepare(`
      SELECT COUNT(*) as count, COALESCE(SUM(estimated_theft_kw), 0) as total_theft_kw,
             COALESCE(SUM(hourly_financial_loss), 0) as total_loss_inr
      FROM incidents WHERE status IN ('ACTIVE', 'ACKNOWLEDGED', 'SQUAD_DISPATCHED')
    `).get();

    const recentAudit = db.prepare(`
      SELECT AVG(loss_percent) as avg_loss, SUM(dtc_power_kw) as total_gen, SUM(consumers_power_kw) as total_cons
      FROM (SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?)
    `).get(totalDtc);

    return {
      total_dtcs: totalDtc,
      total_consumers: totalMeters,
      active_theft_incidents: activeIncidents.count,
      total_theft_kw: parseFloat(Number(activeIncidents.total_theft_kw).toFixed(2)),
      hourly_loss_inr: parseFloat(Number(activeIncidents.total_loss_inr).toFixed(2)),
      avg_loss_percent: parseFloat((recentAudit?.avg_loss || 0).toFixed(2)),
      total_grid_kw: parseFloat((recentAudit?.total_gen || 0).toFixed(2)),
      total_metered_kw: parseFloat((recentAudit?.total_cons || 0).toFixed(2))
    };
  }
}

module.exports = new GridSimulator();
