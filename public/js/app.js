/**
 * BESCOM Smart Grid SCADA Command Center Application
 */

class BescomApp {
  constructor() {
    this.gisMap = null;
    this.charts = null;
    this.ws = null;
    this.topology = [];
    this.currentTransformerId = 1;
    this.audioAlertsEnabled = true;
    this.audioCtx = null;
    this.latestGridData = [];
  }

  async init() {
    console.log('⚡ Initializing BESCOM SCADA Console...');

    // Initialize GIS Map
    this.gisMap = new BescomGisMap('leafletMap', (txId) => this.selectTransformer(txId));
    this.gisMap.init();

    // Initialize Charts
    this.charts = new ScadaCharts();
    this.charts.init();

    // Fetch initial grid topology and summary
    await this.fetchInitialData();
    await this.fetchIncidents();
    await this.fetchAtcReport();

    // Connect real-time WebSocket
    this.initWebSocket();

    // Setup tab navigation
    this.setupNavigation();
  }

  setupNavigation() {
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetId = tab.getAttribute('data-tab');

        tabs.forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

        tab.classList.add('active');
        const targetContent = document.getElementById(targetId);
        if (targetContent) targetContent.classList.add('active');

        // Trigger map resize if switching to GIS map
        if (targetId === 'tab-gis' && this.gisMap && this.gisMap.map) {
          setTimeout(() => this.gisMap.map.invalidateSize(), 150);
        }
      });
    });
  }

  async fetchInitialData() {
    try {
      const res = await fetch('/api/topology');
      const data = await res.json();
      if (data.success) {
        this.topology = data.topology;
        this.gisMap.loadTopology(this.topology);
        this.updateSummaryKpis(data.summary);
        this.selectTransformer(1);
      }
    } catch (e) {
      console.error('Failed to load topology', e);
    }
  }

  async fetchIncidents() {
    try {
      const res = await fetch('/api/incidents');
      const data = await res.json();
      if (data.success) {
        this.renderIncidentsTable(data.incidents);
      }
    } catch (e) {
      console.error('Failed to load incidents', e);
    }
  }

  async fetchAtcReport() {
    try {
      const res = await fetch('/api/reports/atc');
      const data = await res.json();
      if (data.success) {
        this.renderAtcReportTable(data.feeders);
        this.charts.updateFeederReport(data.feeders);
      }
    } catch (e) {
      console.error('Failed to load AT&C report', e);
    }
  }

  initWebSocket() {
    const statusDot = document.getElementById('wsStatusDot');
    const statusText = document.getElementById('wsStatusText');

    this.ws = new ScadaWebSocket(
      null,
      (data) => this.handleLiveTelemetry(data),
      (isConnected) => {
        if (statusDot && statusText) {
          if (isConnected) {
            statusDot.style.background = '#10b981';
            statusDot.style.boxShadow = '0 0 8px #10b981';
            statusText.innerText = 'Telemetry Connected (3s)';
          } else {
            statusDot.style.background = '#ef4444';
            statusDot.style.boxShadow = '0 0 8px #ef4444';
            statusText.innerText = 'Stream Disconnected';
          }
        }
      }
    );

    this.ws.connect();
  }

  handleLiveTelemetry(data) {
    if (data.type === 'TELEMETRY_TICK') {
      this.latestGridData = data.grid || [];

      // 1. Update Top KPI Cards
      if (data.summary) {
        this.updateSummaryKpis(data.summary);
      }

      // 2. Update Map Markers
      if (this.gisMap) {
        this.gisMap.updateFromTelemetry(this.latestGridData);
      }

      // 3. Update Real-time Chart
      if (data.summary) {
        this.charts.updateLivePower(
          data.summary.total_grid_kw,
          data.summary.total_metered_kw,
          data.summary.total_theft_kw
        );
      }

      // 4. Update Transformer Inspector if open
      this.refreshCurrentTransformerTelemetry();

      // 5. Update KCL Energy Audit Matrix Table
      this.renderKclAuditTable(this.latestGridData);

      // 6. Handle New Anomaly Incidents & Audio Alarms
      if (data.new_incidents && data.new_incidents.length > 0) {
        this.playTheftSiren();
        this.fetchIncidents();
        this.fetchAtcReport();
      }
    }
  }

  updateSummaryKpis(summary) {
    document.getElementById('kpiTotalDemand').innerText = (summary.total_grid_kw || 0).toLocaleString();
    document.getElementById('kpiMeteredDemand').innerText = (summary.total_metered_kw || 0).toLocaleString();
    document.getElementById('kpiTheftKw').innerText = (summary.total_theft_kw || 0).toFixed(1);
    document.getElementById('kpiLossPct').innerText = (summary.avg_loss_percent || 0).toFixed(1) + '%';
    document.getElementById('kpiActiveIncidents').innerText = summary.active_theft_incidents || 0;
    document.getElementById('kpiHourlyLoss').innerText = '₹' + (summary.hourly_loss_inr || 0).toLocaleString();

    // Tab badge count
    const incBadge = document.getElementById('incidentsBadge');
    if (incBadge) incBadge.innerText = summary.active_theft_incidents || 0;
  }

  async selectTransformer(txId) {
    this.currentTransformerId = txId;
    try {
      const res = await fetch(`/api/transformers/${txId}`);
      const data = await res.json();
      if (data.success) {
        this.renderTransformerInspector(data);
      }
    } catch (e) {
      console.error('Failed to load transformer details', e);
    }
  }

  refreshCurrentTransformerTelemetry() {
    const item = this.latestGridData.find(g => g.transformer.transformer_id === this.currentTransformerId);
    if (!item) return;

    const tx = item.transformer;
    const audit = item.audit;

    const vElem = document.getElementById('inspectVoltage');
    const pElem = document.getElementById('inspectPower');
    const lossElem = document.getElementById('inspectLoss');
    const statusElem = document.getElementById('inspectStatus');

    if (vElem) vElem.innerText = `${tx.v_r} V | ${tx.v_y} V | ${tx.v_b} V`;
    if (pElem) pElem.innerText = `${tx.active_power_kw} kW (PF: ${tx.pf})`;
    if (lossElem) lossElem.innerText = `${audit.loss_percent}% (Δ ${audit.delta_power_kw} kW)`;
    if (statusElem) {
      statusElem.className = `badge badge-${audit.status.toLowerCase()}`;
      statusElem.innerText = audit.status;
    }

    // Update Phase current cards
    const irElem = document.getElementById('inspectPhaseR');
    const iyElem = document.getElementById('inspectPhaseY');
    const ibElem = document.getElementById('inspectPhaseB');
    if (irElem) irElem.innerText = `${tx.i_r} A`;
    if (iyElem) iyElem.innerText = `${tx.i_y} A`;
    if (ibElem) ibElem.innerText = `${tx.i_b} A`;

    // Update connected meters list
    this.renderInspectorConsumers(item.consumers);
  }

  renderTransformerInspector(data) {
    const tx = data.transformer;
    const audit = data.latest_audit || {};
    const tel = data.latest_telemetry || {};

    const container = document.getElementById('transformerInspector');
    if (!container) return;

    container.innerHTML = `
      <div class="tx-inspector">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div>
            <h4 style="font-size:15px;color:#fff;">${tx.name}</h4>
            <span style="font-size:11px;color:#9ca3af;">Code: <b>${tx.code}</b> | Cap: <b>${tx.capacity_kva} kVA</b></span>
          </div>
          <span id="inspectStatus" class="badge badge-${(audit.status || 'NORMAL').toLowerCase()}">${audit.status || 'NORMAL'}</span>
        </div>

        <div class="phase-grid">
          <div class="phase-pill r-phase">
            <div class="phase-name">PHASE R</div>
            <div class="phase-val" id="inspectPhaseR">${tel.i_r || 0} A</div>
          </div>
          <div class="phase-pill y-phase">
            <div class="phase-name">PHASE Y</div>
            <div class="phase-val" id="inspectPhaseY">${tel.i_y || 0} A</div>
          </div>
          <div class="phase-pill b-phase">
            <div class="phase-name">PHASE B</div>
            <div class="phase-val" id="inspectPhaseB">${tel.i_b || 0} A</div>
          </div>
        </div>

        <div style="background:#111827;padding:10px;border-radius:6px;font-size:12px;display:flex;flex-direction:column;gap:4px;">
          <div style="display:flex;justify-content:space-between;">
            <span style="color:#9ca3af;">Active Power (kW):</span>
            <strong id="inspectPower" style="color:#fff;">${tel.active_power_kw || 0} kW</strong>
          </div>
          <div style="display:flex;justify-content:space-between;">
            <span style="color:#9ca3af;">Loss / KCL Delta:</span>
            <strong id="inspectLoss" style="color:${(audit.loss_percent || 0) > 7.5 ? '#ef4444' : '#10b981'};">
              ${audit.loss_percent || 0}% (${audit.delta_power_kw || 0} kW)
            </strong>
          </div>
          <div style="display:flex;justify-content:space-between;">
            <span style="color:#9ca3af;">Confidence Score:</span>
            <strong style="color:#38bdf8;">${audit.confidence_score || 0}%</strong>
          </div>
        </div>

        <div style="margin-top:6px;">
          <h5 style="font-size:12px;color:#cbd5e1;margin-bottom:8px;">Connected Smart Meters (${data.consumers.length}):</h5>
          <div id="inspectorConsumersList" style="display:flex;flex-direction:column;gap:8px;max-height:220px;overflow-y:auto;">
          </div>
        </div>
      </div>
    `;

    this.renderInspectorConsumers(data.consumers);
  }

  renderInspectorConsumers(consumers) {
    const list = document.getElementById('inspectorConsumersList');
    if (!list || !consumers) return;

    list.innerHTML = consumers.map(c => {
      const isTheft = c.tamper_flag === 1 || (c.active_theft_scenario && c.active_theft_scenario !== 'NONE');
      const isDisc = c.relay_status === 'DISCONNECTED';

      return `
        <div style="background:#111827;border:1px solid #1f2937;padding:8px 10px;border-radius:6px;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-weight:600;color:#fff;font-size:12px;">${c.name}</div>
            <div style="font-size:11px;color:#9ca3af;">
              <b>${c.rr_number}</b> | ${c.category} | ${c.active_power_kw || c.sanctioned_kw} kW
              ${isTheft ? `<span style="color:#ef4444;font-weight:700;margin-left:4px;">[TAMPER: ${c.tamper_type || c.active_scenario}]</span>` : ''}
            </div>
          </div>
          <div>
            <button onclick="window.app.toggleConsumerRelay(${c.consumer_id || c.id}, '${isDisc ? 'CONNECTED' : 'DISCONNECTED'}')"
              style="padding:4px 8px;font-size:10px;font-weight:600;border:none;border-radius:4px;cursor:pointer;background:${isDisc ? '#10b981' : '#ef4444'};color:white;">
              ${isDisc ? 'Reconnect' : 'Trip'}
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  renderKclAuditTable(gridData) {
    const tbody = document.getElementById('kclAuditTableBody');
    if (!tbody || !gridData) return;

    tbody.innerHTML = gridData.map(item => {
      const tx = item.transformer;
      const audit = item.audit;
      const isTheft = audit.status === 'CRITICAL_THEFT' || audit.status === 'SUSPECTED_THEFT';

      return `
        <tr style="${isTheft ? 'background: rgba(239, 68, 68, 0.08);' : ''}">
          <td><b>${tx.transformer_code}</b></td>
          <td>${tx.transformer_name}</td>
          <td><b>${tx.active_power_kw} kW</b></td>
          <td>${audit.consumers_power_kw} kW</td>
          <td style="color:${isTheft ? '#ef4444' : '#10b981'};font-weight:700;">
            ${audit.delta_power_kw} kW (${audit.loss_percent}%)
          </td>
          <td>${audit.technical_loss_kw} kW</td>
          <td style="color:#ef4444;font-weight:700;">${audit.theft_loss_kw} kW</td>
          <td>
            <span class="badge badge-${audit.status.toLowerCase()}">${audit.status}</span>
          </td>
          <td>
            <div style="display:flex;align-items:center;gap:6px;">
              <div style="flex:1;background:#1f2937;height:6px;border-radius:3px;overflow:hidden;">
                <div style="width:${audit.confidence_score}%;height:100%;background:${audit.confidence_score > 60 ? '#ef4444' : '#38bdf8'};"></div>
              </div>
              <span style="font-size:11px;font-weight:700;">${audit.confidence_score}%</span>
            </div>
          </td>
          <td>
            <button class="btn btn-primary" style="padding:3px 8px;font-size:11px;" onclick="window.app.selectTransformer(${tx.transformer_id})">
              Inspect
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  renderIncidentsTable(incidents) {
    const tbody = document.getElementById('incidentsTableBody');
    if (!tbody) return;

    if (!incidents || incidents.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#6b7280;padding:24px;">No active theft incidents recorded. Grid operating normally.</td></tr>`;
      return;
    }

    tbody.innerHTML = incidents.map(inc => {
      const isCritical = inc.severity === 'CRITICAL';

      return `
        <tr style="${isCritical ? 'background: rgba(239, 68, 68, 0.06);' : ''}">
          <td><b style="color:#38bdf8;">${inc.ticket_no}</b></td>
          <td>${inc.transformer_name || inc.transformer_code}</td>
          <td>${inc.rr_number ? `<b>${inc.rr_number}</b> (${inc.consumer_name})` : '<i>Unmetered Feeder Tap</i>'}</td>
          <td><span class="badge ${inc.theft_type === 'DIRECT_LINE_HOOK' ? 'badge-critical' : 'badge-warning'}">${inc.theft_type}</span></td>
          <td style="color:#ef4444;font-weight:700;">${inc.estimated_theft_kw} kW (₹${inc.hourly_financial_loss}/h)</td>
          <td><span class="badge badge-${inc.status.toLowerCase()}">${inc.status}</span></td>
          <td style="font-size:11px;color:#9ca3af;">${new Date(inc.reported_at).toLocaleTimeString('en-IN')}</td>
          <td>
            <div style="display:flex;gap:4px;">
              ${inc.status === 'ACTIVE' ? `
                <button class="btn btn-warning" style="padding:2px 6px;font-size:10px;" onclick="window.app.updateIncident(${inc.id}, 'ACKNOWLEDGED')">
                  Ack
                </button>
                <button class="btn btn-danger" style="padding:2px 6px;font-size:10px;" onclick="window.app.updateIncident(${inc.id}, 'SQUAD_DISPATCHED')">
                  Dispatch Squad
                </button>
              ` : ''}
              ${inc.status === 'SQUAD_DISPATCHED' ? `
                <button class="btn btn-success" style="padding:2px 6px;font-size:10px;" onclick="window.app.updateIncident(${inc.id}, 'RESOLVED')">
                  Resolve
                </button>
              ` : ''}
              <button class="btn" style="padding:2px 6px;font-size:10px;" onclick="window.app.showFirModal(${inc.id})">
                FIR Dossier
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  renderAtcReportTable(feeders) {
    const tbody = document.getElementById('atcReportTableBody');
    if (!tbody || !feeders) return;

    tbody.innerHTML = feeders.map(f => {
      const isNonCompliant = f.kerc_compliance === 'NON_COMPLIANT';

      return `
        <tr style="${isNonCompliant ? 'background:rgba(239, 68, 68, 0.08);' : ''}">
          <td><b>${f.feeder_code}</b></td>
          <td>${f.feeder_name}</td>
          <td>${f.substation} (${f.subdivision})</td>
          <td>${f.total_dtcs}</td>
          <td>${f.total_supply_kw} kW</td>
          <td>${f.total_metered_kw} kW</td>
          <td style="font-weight:700;color:${isNonCompliant ? '#ef4444' : '#10b981'};">
            ${f.atc_loss_percentage}%
          </td>
          <td>${f.kerc_target_percentage}%</td>
          <td><span class="badge badge-${f.kerc_compliance.toLowerCase()}">${f.kerc_compliance}</span></td>
          <td style="color:#ef4444;font-weight:600;">₹${f.estimated_hourly_leakage_inr}/h</td>
        </tr>
      `;
    }).join('');
  }

  async triggerScenario(scenario, targetType, targetId, extraKw) {
    try {
      const res = await fetch('/api/scenarios/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario, target_type: targetType, target_id: targetId, extra_kw: extraKw })
      });
      const data = await res.json();
      if (data.success) {
        this.showToast(data.message);
      }
    } catch (e) {
      console.error('Failed to trigger scenario', e);
    }
  }

  async toggleConsumerRelay(consumerId, relayStatus) {
    try {
      const res = await fetch(`/api/consumers/${consumerId}/relay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ relay_status: relayStatus })
      });
      const data = await res.json();
      if (data.success) {
        this.showToast(data.message);
        this.selectTransformer(this.currentTransformerId);
      }
    } catch (e) {
      console.error('Failed to set relay', e);
    }
  }

  async updateIncident(incidentId, status) {
    try {
      const res = await fetch(`/api/incidents/${incidentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      const data = await res.json();
      if (data.success) {
        this.showToast(data.message);
        if (data.notification) {
          alert(`📲 [VIGILANCE SQUAD DISPATCHED via WHATSAPP]\n\n${data.notification.message}`);
        }
        this.fetchIncidents();
      }
    } catch (e) {
      console.error('Failed to update incident', e);
    }
  }

  async showFirModal(incidentId) {
    try {
      const res = await fetch(`/api/incidents/${incidentId}/fir`);
      const data = await res.json();
      if (data.success) {
        const fir = data.fir;
        const dossierText = `
========================================================================================
${fir.header}
DIRECTORATE OF VIGILANCE, SECURITY & POLICE ENFORCEMENT
CASE REFERENCE: ${fir.case_reference}
LEGAL STATUTE: ${fir.legal_statute}
========================================================================================

1. INCIDENT DOSSIER:
   • Offense Vector:      ${fir.incident_summary.offense_category}
   • Severity Index:      ${fir.incident_summary.severity}
   • Timestamp:           ${fir.incident_summary.reported_at}
   • Current Case Status: ${fir.incident_summary.current_status}

2. GRID & PREMISES JURISDICTION:
   • Distribution DTC:    ${fir.site_and_grid_location.transformer}
   • GPS Coordinates:     ${fir.site_and_grid_location.gps_coordinates}
   • Consumer RR Number:  ${fir.site_and_grid_location.consumer_account}
   • Accused Consumer:    ${fir.site_and_grid_location.consumer_name}
   • Premises Address:    ${fir.site_and_grid_location.premises_address}
   • Smart Meter Serial:  ${fir.site_and_grid_location.meter_serial_number}

3. TECHNICAL EVIDENCE & MONETARY LOSS:
   • Unmetered Power Draw:        ${fir.technical_evidence.unmetered_demand_kw} kW
   • Hourly Revenue Loss:         ₹${fir.technical_evidence.hourly_loss_rate_inr} per hour
   • Tariff Applied:              ${fir.technical_evidence.tariff_applied}
   • 24-Hour Projected Loss:      ₹${fir.technical_evidence.estimated_24h_revenue_leakage.toLocaleString()}
   • Forensic SCADA Signature:    ${fir.technical_evidence.tamper_signature}

4. ENFORCEMENT INSTRUCTIONS:
   • The Section Officer / Junior Engineer (JE) is empowered under Sec 135(2) to enter,
     inspect, break open and search premises, disconnect unauthorized tap lines, and seize
     all physical devices (jumpers, bypassed meters, magnets) as material evidence.
========================================================================================
        `.trim();

        document.getElementById('firDossierContent').innerText = dossierText;
        document.getElementById('firModal').classList.add('active');
      }
    } catch (e) {
      console.error('Failed to load FIR dossier', e);
    }
  }

  closeFirModal() {
    document.getElementById('firModal').classList.remove('active');
  }

  toggleAudio() {
    this.audioAlertsEnabled = !this.audioAlertsEnabled;
    const btn = document.getElementById('audioBtn');
    if (btn) {
      btn.innerHTML = this.audioAlertsEnabled ? '🔔 Audio: ON' : '🔕 Audio: OFF';
    }
  }

  playTheftSiren() {
    if (!this.audioAlertsEnabled) return;
    try {
      if (!this.audioCtx) {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, this.audioCtx.currentTime); // A5
      osc.frequency.exponentialRampToValueAtTime(440, this.audioCtx.currentTime + 0.4);

      gain.gain.setValueAtTime(0.15, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.4);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.4);
    } catch (e) {
      // Audio autoplay may be blocked until first user click
    }
  }

  showToast(message) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: #1e293b;
      color: #fff;
      padding: 12px 18px;
      border-radius: 8px;
      border: 1px solid #0284c7;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      z-index: 9999;
      font-size: 13px;
      font-weight: 500;
      animation: fadeIn 0.3s;
    `;
    toast.innerText = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }
}

window.app = new BescomApp();
document.addEventListener('DOMContentLoaded', () => window.app.init());
