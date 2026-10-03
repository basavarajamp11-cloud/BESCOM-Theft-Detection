const { TAMPER_TYPES, KERC_COMMERCIAL_TARIFF } = require('../config/constants');
const { db } = require('../database/db');

class AnomalyDetector {
  constructor() {
    this.alertCooldowns = new Map(); // key -> lastAlertTimestamp
    this.cooldownSeconds = parseInt(process.env.ALERT_COOLDOWN_SEC || '60', 10);
  }

  /**
   * Process audit results and meter telemetry to generate actionable vigilance incidents
   */
  evaluateAnomalies(auditResult, consumerTelemetries, txInfo) {
    const incidentsGenerated = [];
    const now = Date.now();

    // 1. Evaluate Direct Line Hooking (Feeder-level bypass)
    if ((auditResult.status === 'CRITICAL_THEFT' || auditResult.status === 'SUSPECTED_THEFT') &&
        auditResult.confidence_score >= 60) {
      
      const cooldownKey = `tx_${auditResult.transformer_id}_hook`;
      const lastAlert = this.alertCooldowns.get(cooldownKey) || 0;

      if (now - lastAlert > this.cooldownSeconds * 1000) {
        this.alertCooldowns.set(cooldownKey, now);

        // Check if an active incident already exists for this transformer
        const existing = db.prepare(`
          SELECT id, ticket_no FROM incidents
          WHERE transformer_id = ? AND status IN ('ACTIVE', 'ACKNOWLEDGED', 'SQUAD_DISPATCHED') AND theft_type = 'DIRECT_LINE_HOOK'
        `).get(auditResult.transformer_id);

        if (!existing) {
          const ticketNo = this.generateTicketNumber('HOOK');
          const hourlyLoss = auditResult.theft_loss_kw * KERC_COMMERCIAL_TARIFF;
          const notes = `Direct line tapping detected on ${txInfo.name} (${txInfo.code}). Unmetered draw: ${auditResult.theft_loss_kw} kW. Phase imbalance: ${auditResult.phase_imbalance_percent}%. KCL mismatch: ${auditResult.loss_percent}%.`;

          const insertInc = db.prepare(`
            INSERT INTO incidents (
              ticket_no, transformer_id, consumer_id, theft_type, severity,
              estimated_theft_kw, hourly_financial_loss, status, notes
            ) VALUES (?, ?, NULL, ?, ?, ?, ?, 'ACTIVE', ?)
          `);

          const res = insertInc.run(
            ticketNo,
            auditResult.transformer_id,
            'DIRECT_LINE_HOOK',
            auditResult.status === 'CRITICAL_THEFT' ? 'CRITICAL' : 'HIGH',
            auditResult.theft_loss_kw,
            parseFloat(hourlyLoss.toFixed(2)),
            notes
          );

          incidentsGenerated.push({
            id: Number(res.lastInsertRowid),
            ticket_no: ticketNo,
            transformer_id: auditResult.transformer_id,
            transformer_name: txInfo.name,
            theft_type: 'DIRECT_LINE_HOOK',
            severity: auditResult.status === 'CRITICAL_THEFT' ? 'CRITICAL' : 'HIGH',
            estimated_theft_kw: auditResult.theft_loss_kw,
            hourly_financial_loss: parseFloat(hourlyLoss.toFixed(2)),
            notes,
            reported_at: new Date().toISOString()
          });
        }
      }
    }

    // 2. Evaluate individual consumer meter tampers
    for (const m of consumerTelemetries) {
      if (m.tamper_flag && m.tamper_type) {
        const cooldownKey = `cons_${m.consumer_id}_${m.tamper_type}`;
        const lastAlert = this.alertCooldowns.get(cooldownKey) || 0;

        if (now - lastAlert > this.cooldownSeconds * 1000) {
          this.alertCooldowns.set(cooldownKey, now);

          const existing = db.prepare(`
            SELECT id, ticket_no FROM incidents
            WHERE consumer_id = ? AND status IN ('ACTIVE', 'ACKNOWLEDGED', 'SQUAD_DISPATCHED') AND theft_type = ?
          `).get(m.consumer_id, m.tamper_type);

          if (!existing) {
            const ticketNo = this.generateTicketNumber(m.tamper_type.substring(0, 4));
            const tamperMeta = TAMPER_TYPES[m.tamper_type] || {
              label: m.tamper_type,
              severity: 'HIGH'
            };

            const estimatedKw = Math.max(1.5, m.sanctioned_kw * 0.85);
            const hourlyLoss = estimatedKw * KERC_COMMERCIAL_TARIFF;
            const notes = `${tamperMeta.label} registered on RR #${m.rr_number} (${m.consumer_name}). Sanctioned: ${m.sanctioned_kw} kW. Meter: ${m.meter_serial}.`;

            const insertInc = db.prepare(`
              INSERT INTO incidents (
                ticket_no, transformer_id, consumer_id, theft_type, severity,
                estimated_theft_kw, hourly_financial_loss, status, notes
              ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
            `);

            const res = insertInc.run(
              ticketNo,
              m.transformer_id,
              m.consumer_id,
              m.tamper_type,
              tamperMeta.severity,
              parseFloat(estimatedKw.toFixed(2)),
              parseFloat(hourlyLoss.toFixed(2)),
              notes
            );

            incidentsGenerated.push({
              id: Number(res.lastInsertRowid),
              ticket_no: ticketNo,
              transformer_id: m.transformer_id,
              transformer_name: txInfo.name,
              consumer_id: m.consumer_id,
              consumer_name: m.consumer_name,
              rr_number: m.rr_number,
              theft_type: m.tamper_type,
              theft_label: tamperMeta.label,
              severity: tamperMeta.severity,
              estimated_theft_kw: parseFloat(estimatedKw.toFixed(2)),
              hourly_financial_loss: parseFloat(hourlyLoss.toFixed(2)),
              notes,
              reported_at: new Date().toISOString()
            });
          }
        }
      }
    }

    return incidentsGenerated;
  }

  generateTicketNumber(prefix) {
    const year = new Date().getFullYear();
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `BESCOM-VIG-${year}-${prefix}-${rand}`;
  }
}

module.exports = new AnomalyDetector();
