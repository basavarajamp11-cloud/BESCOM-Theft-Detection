const { db } = require('../database/db');
const gridSimulator = require('../engine/gridSimulator');

function setRelayState(req, res) {
  try {
    const consumerId = Number(req.params.id);
    const { relay_status } = req.body;

    const validStates = ['CONNECTED', 'DISCONNECTED', 'LOAD_LIMITED'];
    if (!validStates.includes(relay_status)) {
      return res.status(400).json({ success: false, message: 'Invalid relay status' });
    }

    const consumer = db.prepare('SELECT * FROM consumers WHERE id = ?').get(consumerId);
    if (!consumer) {
      return res.status(404).json({ success: false, message: 'Consumer not found' });
    }

    db.prepare('UPDATE consumers SET relay_status = ? WHERE id = ?').run(relay_status, consumerId);

    // If consumer was disconnected due to theft, update incident note
    if (relay_status === 'DISCONNECTED') {
      db.prepare(`
        UPDATE incidents
        SET status = 'DISCONNECTED', action_taken = 'Remote breaker tripped via SCADA command'
        WHERE consumer_id = ? AND status IN ('ACTIVE', 'ACKNOWLEDGED', 'SQUAD_DISPATCHED')
      `).run(consumerId);
    }

    res.json({
      success: true,
      message: `Consumer ${consumer.rr_number} (${consumer.name}) relay set to ${relay_status}`,
      consumer_id: consumerId,
      relay_status
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

function triggerScenario(req, res) {
  try {
    const { scenario, target_type, target_id, extra_kw } = req.body;

    if (scenario === 'RESET_ALL') {
      gridSimulator.clearAllScenarios();
      return res.json({
        success: true,
        message: 'All theft scenarios cleared. Grid returned to balanced operational state.'
      });
    }

    if (scenario === 'HOOKING') {
      const txId = target_id || 1; // Default to DTC-IND-T01 (Indiranagar)
      const kw = extra_kw || 8.5;
      gridSimulator.triggerDtcHooking(txId, kw);
      return res.json({
        success: true,
        message: `Injected Direct Line Hooking of ${kw} kW on Transformer #${txId}`
      });
    }

    if (['METER_BYPASS', 'NEUTRAL_TAMPER', 'MAGNET', 'CT_REVERSE', 'ENCLOSURE_BREACH'].includes(scenario)) {
      let consId = target_id;
      if (!consId) {
        // Choose an active consumer
        const firstCons = db.prepare("SELECT id FROM consumers WHERE active_theft_scenario = 'NONE' LIMIT 1").get();
        consId = firstCons ? firstCons.id : 1;
      }
      gridSimulator.setConsumerTheft(consId, scenario);
      return res.json({
        success: true,
        message: `Injected ${scenario} on Consumer #${consId}`
      });
    }

    res.status(400).json({ success: false, message: 'Unrecognized scenario type' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = {
  setRelayState,
  triggerScenario
};
