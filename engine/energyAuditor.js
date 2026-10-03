const { THRESHOLDS, KERC_COMMERCIAL_TARIFF } = require('../config/constants');
const { db } = require('../database/db');

class EnergyAuditor {
  constructor() {
    this.consecutiveTheftCycles = new Map(); // transformerId -> count
  }

  /**
   * Perform Kirchhoff's Current Law (KCL) power balance analysis on a DTC
   * @param {Object} dtcTelemetry Current readings from master DTC meter
   * @param {Array<Object>} consumerTelemetries Current readings from downstream consumer meters
   */
  auditDtcEnergy(dtcTelemetry, consumerTelemetries) {
    const dtcPower = Math.max(0.1, dtcTelemetry.active_power_kw);
    const consumersPower = consumerTelemetries.reduce((sum, m) => sum + Math.max(0, m.active_power_kw), 0);
    const deltaPower = Math.max(0, dtcPower - consumersPower);

    // Dynamic technical loss model based on loading factor and nominal line resistance
    // Technical loss = core loss (~1.2% base) + I^2*R copper loss (up to ~3.5%)
    const loadingRatio = Math.min(1.2, dtcTelemetry.i_r / (dtcTelemetry.rated_current || 400));
    const technicalLossFactor = 0.018 + (0.032 * Math.pow(loadingRatio, 2));
    const technicalLossKw = Math.min(deltaPower, dtcPower * technicalLossFactor);

    // Commercial / Theft Loss
    const theftLossKw = Math.max(0, deltaPower - technicalLossKw);
    const totalLossPercent = (deltaPower / dtcPower) * 100.0;
    const commercialLossPercent = (theftLossKw / dtcPower) * 100.0;

    // Phase current imbalance calculation
    const ir = dtcTelemetry.i_r || 0;
    const iy = dtcTelemetry.i_y || 0;
    const ib = dtcTelemetry.i_b || 0;
    const iAvg = (ir + iy + ib) / 3 || 1;
    const maxPhaseDiff = Math.max(Math.abs(ir - iAvg), Math.abs(iy - iAvg), Math.abs(ib - iAvg));
    const phaseImbalancePercent = (maxPhaseDiff / iAvg) * 100.0;

    // Neutral current anomaly: In balanced 3-phase, neutral is small. High In indicates single-phase tapping.
    const neutralRatio = (dtcTelemetry.i_n || 0) / iAvg;

    // Classification & Confidence
    let status = 'BALANCED';
    let isTheftCandidate = false;

    if (theftLossKw >= THRESHOLDS.MIN_THEFT_KW || commercialLossPercent >= THRESHOLDS.THEFT_PERCENTAGE) {
      isTheftCandidate = true;
      if (theftLossKw > 4.0 || commercialLossPercent > 18.0) {
        status = 'CRITICAL_THEFT';
      } else {
        status = 'SUSPECTED_THEFT';
      }
    } else if (totalLossPercent > THRESHOLDS.MAX_TECHNICAL_LOSS_PERCENT) {
      status = 'HIGH_TECHNICAL_LOSS';
    }

    // Track consecutive cycles to suppress transient switching surges (motor inrush)
    const prevCount = this.consecutiveTheftCycles.get(dtcTelemetry.transformer_id) || 0;
    const consecutiveCycles = isTheftCandidate ? prevCount + 1 : 0;
    this.consecutiveTheftCycles.set(dtcTelemetry.transformer_id, consecutiveCycles);

    // Multi-factor confidence scoring
    let confidenceScore = 0;
    if (isTheftCandidate) {
      // 1. Magnitude factor (up to 40 pts)
      const magScore = Math.min(40, (theftLossKw / 5.0) * 40);
      // 2. Persistence factor (up to 30 pts)
      const persistScore = Math.min(30, consecutiveCycles * 15);
      // 3. Phase/Neutral signature factor (up to 30 pts)
      const signatureScore = Math.min(30, (phaseImbalancePercent > 15 ? 15 : 0) + (neutralRatio > 0.4 ? 15 : 0));

      confidenceScore = Math.min(100, Math.round(magScore + persistScore + signatureScore));
    }

    const hourlyFinancialLossInr = theftLossKw * KERC_COMMERCIAL_TARIFF;

    const auditResult = {
      transformer_id: dtcTelemetry.transformer_id,
      timestamp: new Date().toISOString(),
      dtc_power_kw: parseFloat(dtcPower.toFixed(2)),
      consumers_power_kw: parseFloat(consumersPower.toFixed(2)),
      delta_power_kw: parseFloat(deltaPower.toFixed(2)),
      technical_loss_kw: parseFloat(technicalLossKw.toFixed(2)),
      theft_loss_kw: parseFloat(theftLossKw.toFixed(2)),
      loss_percent: parseFloat(totalLossPercent.toFixed(2)),
      commercial_loss_percent: parseFloat(commercialLossPercent.toFixed(2)),
      phase_imbalance_percent: parseFloat(phaseImbalancePercent.toFixed(1)),
      neutral_ratio: parseFloat(neutralRatio.toFixed(2)),
      status,
      consecutive_cycles: consecutiveCycles,
      confidence_score: confidenceScore,
      hourly_financial_loss: parseFloat(hourlyFinancialLossInr.toFixed(2))
    };

    // Store in audit_logs table
    try {
      const insertAudit = db.prepare(`
        INSERT INTO audit_logs (
          transformer_id, dtc_power_kw, consumers_power_kw, delta_power_kw,
          technical_loss_kw, theft_loss_kw, loss_percent, status, confidence_score
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      insertAudit.run(
        auditResult.transformer_id,
        auditResult.dtc_power_kw,
        auditResult.consumers_power_kw,
        auditResult.delta_power_kw,
        auditResult.technical_loss_kw,
        auditResult.theft_loss_kw,
        auditResult.loss_percent,
        auditResult.status,
        auditResult.confidence_score
      );

      // Update transformer status
      const updateTxStatus = db.prepare(`
        UPDATE transformers SET status = ? WHERE id = ?
      `);
      updateTxStatus.run(status, auditResult.transformer_id);
    } catch (err) {
      console.error('Audit log insertion error:', err.message);
    }

    return auditResult;
  }
}

module.exports = new EnergyAuditor();
