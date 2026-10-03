/**
 * BESCOM GIS Map Controller using Leaflet.js
 */

class BescomGisMap {
  constructor(elementId, onSelectTransformer) {
    this.elementId = elementId;
    this.onSelectTransformer = onSelectTransformer;
    this.map = null;
    this.substationLayer = null;
    this.transformerLayer = null;
    this.consumerLayer = null;
    this.feederLinesLayer = null;
    this.txMarkerMap = new Map(); // txId -> marker
    this.consMarkerMap = new Map(); // consId -> marker
  }

  init() {
    if (this.map) return;

    // Centered at Bengaluru
    this.map = L.map(this.elementId, {
      center: [12.9716, 77.6300],
      zoom: 12,
      zoomControl: true
    });

    // Dark Matter tile layer for utility SCADA theme
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a> | BESCOM GIS',
      subdomains: 'abcd',
      maxZoom: 19
    }).addTo(this.map);

    this.feederLinesLayer = L.layerGroup().addTo(this.map);
    this.substationLayer = L.layerGroup().addTo(this.map);
    this.transformerLayer = L.layerGroup().addTo(this.map);
    this.consumerLayer = L.layerGroup().addTo(this.map);
  }

  loadTopology(topology) {
    this.feederLinesLayer.clearLayers();
    this.substationLayer.clearLayers();
    this.transformerLayer.clearLayers();
    this.consumerLayer.clearLayers();
    this.txMarkerMap.clear();
    this.consMarkerMap.clear();

    topology.forEach(ss => {
      // Substation Icon
      const ssIcon = L.divIcon({
        className: 'substation-icon-marker',
        html: `<div style="background:#0284c7;color:#fff;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:14px;border:2px solid #38bdf8;box-shadow:0 0 12px #0284c7;">⚡</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      });

      const ssMarker = L.marker([ss.lat, ss.lng], { icon: ssIcon })
        .bindPopup(`
          <div style="font-size:12px;color:#1e293b;">
            <strong style="color:#0284c7;">${ss.name}</strong><br>
            <b>Code:</b> ${ss.code}<br>
            <b>Zone:</b> ${ss.zone} (${ss.subdivision})<br>
            <b>Capacity:</b> ${ss.capacity_mva} MVA
          </div>
        `);
      this.substationLayer.addLayer(ssMarker);

      ss.feeders.forEach(feeder => {
        feeder.transformers.forEach(tx => {
          // Feeder distribution line from SS to DTC
          const line = L.polyline([[ss.lat, ss.lng], [tx.lat, tx.lng]], {
            color: '#0284c7',
            weight: 2,
            opacity: 0.6,
            dashArray: '4, 4'
          });
          this.feederLinesLayer.addLayer(line);

          // DTC Marker
          const txMarker = this.createTransformerMarker(tx);
          this.transformerLayer.addLayer(txMarker);
          this.txMarkerMap.set(tx.id, txMarker);

          tx.consumers.forEach(cons => {
            // LT service drop line from DTC to Consumer
            const dropLine = L.polyline([[tx.lat, tx.lng], [cons.lat, cons.lng]], {
              color: '#64748b',
              weight: 1,
              opacity: 0.4
            });
            this.feederLinesLayer.addLayer(dropLine);

            const consMarker = this.createConsumerMarker(cons);
            this.consumerLayer.addLayer(consMarker);
            this.consMarkerMap.set(cons.id, consMarker);
          });
        });
      });
    });
  }

  createTransformerMarker(tx) {
    const color = this.getStatusColor(tx.status);
    const isTheft = tx.status === 'CRITICAL_THEFT' || tx.status === 'SUSPECTED_THEFT';

    const icon = L.divIcon({
      className: 'dtc-icon-marker',
      html: `
        <div style="background:${color};color:#000;width:24px;height:24px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:11px;border:2px solid #fff;box-shadow:0 0 10px ${color};${isTheft ? 'animation: pulse-red 1.2s infinite;' : ''}">
          T
        </div>
      `,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });

    const marker = L.marker([tx.lat, tx.lng], { icon });
    marker.on('click', () => {
      if (this.onSelectTransformer) {
        this.onSelectTransformer(tx.id);
      }
    });

    marker.bindTooltip(`<b>${tx.code}</b>: ${tx.name} (${tx.status})`, { direction: 'top', offset: [0, -10] });
    return marker;
  }

  createConsumerMarker(cons) {
    const isTheft = cons.active_theft_scenario && cons.active_theft_scenario !== 'NONE';
    const isDisconnected = cons.relay_status === 'DISCONNECTED';
    let color = '#10b981';
    if (isDisconnected) color = '#6b7280';
    else if (isTheft) color = '#ef4444';

    const icon = L.divIcon({
      className: 'cons-icon-marker',
      html: `
        <div style="background:${color};width:12px;height:12px;border-radius:50%;border:1.5px solid #fff;box-shadow:0 0 6px ${color};"></div>
      `,
      iconSize: [12, 12],
      iconAnchor: [6, 6]
    });

    const marker = L.marker([cons.lat, cons.lng], { icon });
    marker.bindPopup(`
      <div style="font-size:12px;color:#1e293b;">
        <strong style="color:#0f172a;">${cons.name}</strong><br>
        <b>RR Number:</b> <span style="color:#0284c7;font-weight:700;">${cons.rr_number}</span><br>
        <b>Category:</b> ${cons.category} | <b>Sanctioned:</b> ${cons.sanctioned_kw} kW<br>
        <b>Meter Serial:</b> ${cons.meter_serial}<br>
        <b>Relay:</b> <span style="font-weight:700;color:${isDisconnected ? '#dc2626' : '#16a34a'}">${cons.relay_status}</span><br>
        <b>Theft Scenario:</b> ${cons.active_theft_scenario}<br>
        <button onclick="window.app.toggleConsumerRelay(${cons.id}, '${isDisconnected ? 'CONNECTED' : 'DISCONNECTED'}')"
          style="margin-top:8px;padding:4px 8px;font-size:11px;background:${isDisconnected ? '#16a34a' : '#dc2626'};color:white;border:none;border-radius:4px;cursor:pointer;">
          ${isDisconnected ? '⚡ Reconnect Meter' : '🛑 Remote Trip Breaker'}
        </button>
      </div>
    `);
    return marker;
  }

  updateFromTelemetry(gridData) {
    gridData.forEach(item => {
      const tx = item.transformer;
      const audit = item.audit;
      const marker = this.txMarkerMap.get(tx.transformer_id);

      if (marker) {
        const color = this.getStatusColor(audit.status);
        const isTheft = audit.status === 'CRITICAL_THEFT' || audit.status === 'SUSPECTED_THEFT';
        const newIcon = L.divIcon({
          className: 'dtc-icon-marker',
          html: `
            <div style="background:${color};color:#000;width:24px;height:24px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:11px;border:2px solid #fff;box-shadow:0 0 12px ${color};${isTheft ? 'animation: pulse-red 1s infinite;' : ''}">
              T
            </div>
          `,
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });
        marker.setIcon(newIcon);
      }

      item.consumers.forEach(cons => {
        const consMarker = this.consMarkerMap.get(cons.consumer_id);
        if (consMarker) {
          const isTheft = cons.tamper_flag === 1;
          const isDisconnected = cons.relay_status === 'DISCONNECTED';
          let color = '#10b981';
          if (isDisconnected) color = '#6b7280';
          else if (isTheft) color = '#ef4444';

          const newIcon = L.divIcon({
            className: 'cons-icon-marker',
            html: `
              <div style="background:${color};width:12px;height:12px;border-radius:50%;border:1.5px solid #fff;box-shadow:0 0 6px ${color};"></div>
            `,
            iconSize: [12, 12],
            iconAnchor: [6, 6]
          });
          consMarker.setIcon(newIcon);
        }
      });
    });
  }

  getStatusColor(status) {
    switch (status) {
      case 'BALANCED':
      case 'NORMAL':
        return '#10b981'; // Green
      case 'HIGH_TECHNICAL_LOSS':
      case 'WARNING':
        return '#f59e0b'; // Amber
      case 'SUSPECTED_THEFT':
      case 'THEFT_SUSPECTED':
        return '#f97316'; // Orange
      case 'CRITICAL_THEFT':
        return '#ef4444'; // Red
      case 'DISCONNECTED':
        return '#6b7280'; // Grey
      default:
        return '#10b981';
    }
  }
}

window.BescomGisMap = BescomGisMap;
