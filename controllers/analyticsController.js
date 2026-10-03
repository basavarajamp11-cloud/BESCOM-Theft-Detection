const { db } = require('../database/db');
const { KERC_COMMERCIAL_TARIFF } = require('../config/constants');

function getAtcLossReport(req, res) {
  try {
    const feeders = db.prepare(`
      SELECT f.id, f.code, f.name, s.name as substation_name, s.subdivision, s.zone
      FROM feeders f
      JOIN substations s ON f.substation_id = s.id
    `).all();

    const feederReports = feeders.map(f => {
      // Find all DTCs under this feeder
      const dtcs = db.prepare('SELECT id, name, code, capacity_kva FROM transformers WHERE feeder_id = ?').all(f.id);
      const dtcIds = dtcs.map(d => d.id);

      if (dtcIds.length === 0) {
        return {
          ...f,
          total_dtcs: 0,
          total_supply_kwh: 0,
          total_billed_kwh: 0,
          technical_loss_kwh: 0,
          commercial_theft_kwh: 0,
          atc_loss_percentage: 0,
          kerc_compliance: 'COMPLIANT'
        };
      }

      const placeholders = dtcIds.map(() => '?').join(',');
      const stats = db.prepare(`
        SELECT
          COALESCE(SUM(dtc_power_kw), 0) as total_supply_kw,
          COALESCE(SUM(consumers_power_kw), 0) as total_metered_kw,
          COALESCE(SUM(technical_loss_kw), 0) as tech_loss_kw,
          COALESCE(SUM(theft_loss_kw), 0) as theft_loss_kw,
          COALESCE(AVG(loss_percent), 0) as avg_loss_pct
        FROM audit_logs
        WHERE transformer_id IN (${placeholders})
        ORDER BY id DESC LIMIT ?
      `).get(...dtcIds, dtcIds.length * 50);

      const supply = stats.total_supply_kw || 1;
      const metered = stats.total_metered_kw || 0;
      const techLoss = stats.tech_loss_kw || 0;
      const theftLoss = stats.theft_loss_kw || 0;
      const totalLoss = Math.max(0, supply - metered);
      const atcLossPct = parseFloat(((totalLoss / supply) * 100).toFixed(2));

      // KERC Urban Benchmark: <= 11.5%
      const kercTarget = 11.5;
      const kercCompliance = atcLossPct <= kercTarget ? 'COMPLIANT' : 'NON_COMPLIANT';

      return {
        feeder_id: f.id,
        feeder_code: f.code,
        feeder_name: f.name,
        substation: f.substation_name,
        subdivision: f.subdivision,
        zone: f.zone,
        total_dtcs: dtcs.length,
        total_supply_kw: parseFloat(supply.toFixed(2)),
        total_metered_kw: parseFloat(metered.toFixed(2)),
        technical_loss_kw: parseFloat(techLoss.toFixed(2)),
        commercial_theft_kw: parseFloat(theftLoss.toFixed(2)),
        atc_loss_percentage: atcLossPct,
        kerc_target_percentage: kercTarget,
        kerc_compliance: kercCompliance,
        estimated_hourly_leakage_inr: parseFloat((theftLoss * KERC_COMMERCIAL_TARIFF).toFixed(2))
      };
    });

    res.json({
      success: true,
      report_generated_at: new Date().toISOString(),
      state_regulator: 'Karnataka Electricity Regulatory Commission (KERC)',
      feeders: feederReports
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

function exportAuditCsv(req, res) {
  try {
    const logs = db.prepare(`
      SELECT a.id, a.timestamp, t.code as dtc_code, t.name as dtc_name,
             a.dtc_power_kw, a.consumers_power_kw, a.delta_power_kw,
             a.technical_loss_kw, a.theft_loss_kw, a.loss_percent, a.status, a.confidence_score
      FROM audit_logs a
      JOIN transformers t ON a.transformer_id = t.id
      ORDER BY a.id DESC LIMIT 500
    `).all();

    let csv = 'Log_ID,Timestamp,DTC_Code,DTC_Name,Supply_kW,Metered_kW,Delta_kW,Technical_Loss_kW,Commercial_Theft_kW,Loss_Percent,Status,Confidence_Score\n';
    logs.forEach(row => {
      csv += `${row.id},"${row.timestamp}","${row.dtc_code}","${row.dtc_name}",${row.dtc_power_kw},${row.consumers_power_kw},${row.delta_power_kw},${row.technical_loss_kw},${row.theft_loss_kw},${row.loss_percent},"${row.status}",${row.confidence_score}\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="bescom_energy_audit_report.csv"');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = {
  getAtcLossReport,
  exportAuditCsv
};
