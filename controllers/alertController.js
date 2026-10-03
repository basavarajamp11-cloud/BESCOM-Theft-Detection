const { db } = require('../database/db');
const { TAMPER_TYPES, KERC_COMMERCIAL_TARIFF } = require('../config/constants');

function getIncidents(req, res) {
  try {
    const statusFilter = req.query.status;
    let query = `
      SELECT i.*, t.name as transformer_name, t.code as transformer_code,
             c.name as consumer_name, c.rr_number, c.phone as consumer_phone,
             c.address as consumer_address, c.meter_serial
      FROM incidents i
      LEFT JOIN transformers t ON i.transformer_id = t.id
      LEFT JOIN consumers c ON i.consumer_id = c.id
    `;
    const params = [];

    if (statusFilter && statusFilter !== 'ALL') {
      query += ' WHERE i.status = ?';
      params.push(statusFilter);
    }

    query += ' ORDER BY i.id DESC LIMIT 100';

    const incidents = db.prepare(query).all(...params);
    res.json({ success: true, incidents });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

function updateIncidentStatus(req, res) {
  try {
    const id = Number(req.params.id);
    const { status, action_taken, notes } = req.body;

    const validStatuses = ['ACTIVE', 'ACKNOWLEDGED', 'SQUAD_DISPATCHED', 'RESOLVED', 'DISCONNECTED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid incident status' });
    }

    let resolvedAt = null;
    if (status === 'RESOLVED') {
      resolvedAt = new Date().toISOString();
    }

    const stmt = db.prepare(`
      UPDATE incidents
      SET status = ?, action_taken = COALESCE(?, action_taken),
          notes = COALESCE(?, notes), resolved_at = COALESCE(?, resolved_at)
      WHERE id = ?
    `);

    stmt.run(status, action_taken || null, notes || null, resolvedAt, id);

    // If squad dispatched, simulate WhatsApp/SMS notification
    let notificationPayload = null;
    if (status === 'SQUAD_DISPATCHED') {
      const inc = db.prepare(`
        SELECT i.*, t.name as transformer_name, t.code as transformer_code,
               c.name as consumer_name, c.rr_number, c.address as consumer_address
        FROM incidents i
        LEFT JOIN transformers t ON i.transformer_id = t.id
        LEFT JOIN consumers c ON i.consumer_id = c.id
        WHERE i.id = ?
      `).get(id);

      notificationPayload = {
        recipient: 'BESCOM Vigilance Flying Squad (Indiranagar / Koramangala Sub-division)',
        channel: 'WHATSAPP_VIGILANCE_DISPATCH',
        message: `🚨 *BESCOM VIGILANCE DISPATCH ORDER*\nTicket: ${inc.ticket_no}\nTransformer: ${inc.transformer_name} (${inc.transformer_code})\nType: ${inc.theft_type}\nLocation: ${inc.consumer_address || 'Feeder Segment'}\nUnmetered Draw: ${inc.estimated_theft_kw} kW\nHourly Loss: ₹${inc.hourly_financial_loss}/hr\nAction: Immediate inspection and meter seizure authorized under Electricity Act 2003 Sec 135.`
      };
      console.log('📲 Simulating WhatsApp Vigilance Alert:', notificationPayload.message);
    }

    res.json({
      success: true,
      message: `Incident status updated to ${status}`,
      notification: notificationPayload
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

function exportIncidentFIR(req, res) {
  try {
    const id = Number(req.params.id);
    const inc = db.prepare(`
      SELECT i.*, t.name as transformer_name, t.code as transformer_code,
             t.lat as tx_lat, t.lng as tx_lng,
             c.name as consumer_name, c.rr_number, c.address as consumer_address,
             c.meter_serial, c.sanctioned_kw, c.phone as consumer_phone
      FROM incidents i
      LEFT JOIN transformers t ON i.transformer_id = t.id
      LEFT JOIN consumers c ON i.consumer_id = c.id
      WHERE i.id = ?
    `).get(id);

    if (!inc) {
      return res.status(404).json({ success: false, message: 'Incident not found' });
    }

    const firDossier = {
      header: 'BANGALORE ELECTRICITY SUPPLY COMPANY LIMITED (BESCOM)',
      wing: 'Vigilance & Enforcement Police Directorate',
      case_reference: inc.ticket_no,
      legal_statute: 'Electricity Act 2003, Section 135 (Theft of Electricity) & Section 138',
      incident_summary: {
        offense_category: inc.theft_type,
        severity: inc.severity,
        reported_at: inc.reported_at,
        current_status: inc.status
      },
      site_and_grid_location: {
        transformer: `${inc.transformer_name} (${inc.transformer_code})`,
        gps_coordinates: `${inc.tx_lat}, ${inc.tx_lng}`,
        consumer_account: inc.rr_number || 'N/A (Direct Overhead Feeder Tap)',
        consumer_name: inc.consumer_name || 'Unregistered Offender / Anonymous Tapper',
        premises_address: inc.consumer_address || 'Feeder distribution span adjacent to transformer pole',
        meter_serial_number: inc.meter_serial || 'Bypassed / Not connected to meter'
      },
      technical_evidence: {
        unmetered_demand_kw: inc.estimated_theft_kw,
        hourly_loss_rate_inr: inc.hourly_financial_loss,
        tariff_applied: `₹${KERC_COMMERCIAL_TARIFF} per kWh (KERC Schedule)`,
        estimated_24h_revenue_leakage: inc.hourly_financial_loss * 24,
        tamper_signature: inc.notes
      },
      investigation_action_log: {
        status: inc.status,
        officer_notes: inc.notes,
        action_taken: inc.action_taken || 'Awaiting field squad physical inspection'
      }
    };

    res.json({ success: true, fir: firDossier });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = {
  getIncidents,
  updateIncidentStatus,
  exportIncidentFIR
};
