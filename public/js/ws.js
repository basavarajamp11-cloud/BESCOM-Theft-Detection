/**
 * Resilient WebSocket Client for BESCOM SCADA Live Telemetry
 */

class ScadaWebSocket {
  constructor(url, onMessage, onStatusChange) {
    this.url = url || `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;
    this.onMessage = onMessage;
    this.onStatusChange = onStatusChange;
    this.socket = null;
    this.reconnectTimeout = null;
    this.pingInterval = null;
    this.isExplicitClose = false;
  }

  connect() {
    try {
      this.socket = new WebSocket(this.url);

      this.socket.onopen = () => {
        console.log('⚡ SCADA WebSocket Connection Established');
        if (this.onStatusChange) this.onStatusChange(true);

        // Keepalive ping every 15s
        this.pingInterval = setInterval(() => {
          if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({ type: 'PING' }));
          }
        }, 15000);
      };

      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (this.onMessage) this.onMessage(data);
        } catch (e) {
          console.error('Failed to parse SCADA telemetry payload', e);
        }
      };

      this.socket.onerror = (err) => {
        console.warn('SCADA WebSocket error', err);
      };

      this.socket.onclose = () => {
        if (this.onStatusChange) this.onStatusChange(false);
        clearInterval(this.pingInterval);

        if (!this.isExplicitClose) {
          console.warn('SCADA stream lost. Reconnecting in 3s...');
          this.reconnectTimeout = setTimeout(() => this.connect(), 3000);
        }
      };
    } catch (e) {
      console.error('WebSocket connection failed', e);
      this.reconnectTimeout = setTimeout(() => this.connect(), 3000);
    }
  }

  disconnect() {
    this.isExplicitClose = true;
    clearInterval(this.pingInterval);
    clearTimeout(this.reconnectTimeout);
    if (this.socket) {
      this.socket.close();
    }
  }
}

window.ScadaWebSocket = ScadaWebSocket;
