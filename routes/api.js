const express = require('express');
const router = express.Router();

const telemetryController = require('../controllers/telemetryController');
const alertController = require('../controllers/alertController');
const meterController = require('../controllers/meterController');
const analyticsController = require('../controllers/analyticsController');

// SCADA Topology & Telemetry
router.get('/topology', telemetryController.getTopology);
router.get('/summary', telemetryController.getSummary);
router.get('/transformers/:id', telemetryController.getTransformerDetails);
router.get('/history/losses', telemetryController.getHistoricalLosses);

// Vigilance Incidents & Case Dossiers
router.get('/incidents', alertController.getIncidents);
router.patch('/incidents/:id', alertController.updateIncidentStatus);
router.get('/incidents/:id/fir', alertController.exportIncidentFIR);

// Remote Breaker Controls & Scenario Simulation
router.post('/consumers/:id/relay', meterController.setRelayState);
router.post('/scenarios/trigger', meterController.triggerScenario);

// KERC Regulatory Reports & Export
router.get('/reports/atc', analyticsController.getAtcLossReport);
router.get('/reports/audit.csv', analyticsController.exportAuditCsv);

module.exports = router;
