const { db } = require('../database/db');
const gridSimulator = require('../engine/gridSimulator');

function getTopology(req, res) {
  try {
    const substations = db.prepare('SELECT * FROM substations').all();
    const feeders = db.prepare('SELECT * FROM feeders').all();
    const transformers = db.prepare('SELECT * FROM transformers').all();
    const consumers = db.prepare('SELECT * FROM consumers').all();

    // Assemble hierarchical grid model
    const topology = substations.map(ss => {
      const ssFeeders = feeders.filter(f => f.substation_id === ss.id).map(f => {
        const fTransformers = transformers.filter(t => t.feeder_id === f.id).map(t => {
          const tConsumers = consumers.filter(c => c.transformer_id === t.id);
          return {
            ...t,
            consumers: tConsumers
          };
        });
        return {
          ...f,
          transformers: fTransformers
        };
      });
      return {
        ...ss,
        feeders: ssFeeders
      };
    });

    res.json({
      success: true,
      topology,
      summary: gridSimulator.getGridSummary()
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

function getSummary(req, res) {
  try {
    const summary = gridSimulator.getGridSummary();
    res.json({ success: true, summary });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

function getTransformerDetails(req, res) {
  try {
    const txId = Number(req.params.id);
    const tx = db.prepare('SELECT * FROM transformers WHERE id = ?').get(txId);
    if (!tx) {
      return res.status(404).json({ success: false, message: 'Transformer not found' });
    }

    const latestTelemetry = db.prepare(`
      SELECT * FROM telemetry_dtc WHERE transformer_id = ? ORDER BY id DESC LIMIT 1
    `).get(txId);

    const latestAudit = db.prepare(`
      SELECT * FROM audit_logs WHERE transformer_id = ? ORDER BY id DESC LIMIT 1
    `).get(txId);

    const consumers = db.prepare('SELECT * FROM consumers WHERE transformer_id = ?').all(txId);
    const auditHistory = db.prepare(`
      SELECT * FROM audit_logs WHERE transformer_id = ? ORDER BY id DESC LIMIT 20
    `).all(txId).reverse();

    res.json({
      success: true,
      transformer: tx,
      latest_telemetry: latestTelemetry,
      latest_audit: latestAudit,
      audit_history: auditHistory,
      consumers
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

function getHistoricalLosses(req, res) {
  try {
    const history = db.prepare(`
      SELECT timestamp,
             AVG(loss_percent) as avg_loss,
             SUM(dtc_power_kw) as total_supply,
             SUM(consumers_power_kw) as total_metered,
             SUM(theft_loss_kw) as total_theft
      FROM (SELECT * FROM audit_logs ORDER BY id DESC LIMIT 120)
      GROUP BY timestamp
      ORDER BY id ASC
    `).all();

    res.json({ success: true, history });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = {
  getTopology,
  getSummary,
  getTransformerDetails,
  getHistoricalLosses
};
