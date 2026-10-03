/**
 * BESCOM Zone 1 Power Theft Detection & SCADA Telemetry Engine
 * Client Application Logic
 * Zero external libraries or CDNs. Pure vanilla JavaScript.
 */

(function () {
  'use strict';

  // DOM Elements
  const elStatusDot = document.getElementById('statusDot');
  const elStatusText = document.getElementById('statusText');
  const elClock = document.getElementById('systemClock');

  // Metric elements
  const elValIn = document.getElementById('valIn');
  const elValOut = document.getElementById('valOut');
  const elValAuth = document.getElementById('valAuth');
  const elValTheft = document.getElementById('valTheft');

  // Sub-details
  const elHouse1 = document.getElementById('valHouse1');
  const elHouse2 = document.getElementById('valHouse2');

  // KCL Visual Bar Segments
  const elSegOut = document.getElementById('segOut');
  const elSegAuth = document.getElementById('segAuth');
  const elSegTheft = document.getElementById('segTheft');
  const elKclFormula = document.getElementById('kclFormulaDisplay');

  // Table diagnostics
  const elDiagTime = document.getElementById('diagTimestamp');
  const elDiagSource = document.getElementById('diagSource');
  const elDiagStatus = document.getElementById('diagStatus');

  // Pop-up Alert Modal Elements
  const elAlertModal = document.getElementById('alertModal');
  const elAlertLocation = document.getElementById('alertLocation');
  const elAlertMagnitude = document.getElementById('alertMagnitude');
  const elAlertTimestamp = document.getElementById('alertTimestamp');
  const elBtnAck = document.getElementById('btnAckAlert');

  // State
  let eventSource = null;
  let pollingInterval = null;
  let isSseActive = false;
  let isModalDismissedForCurrentTheft = false;
  let lastTheftState = false;
  let lastTheftMagnitude = 0;

  // -------------------------------------------------------------
  // System Clock
  // -------------------------------------------------------------
  function updateClock() {
    if (elClock) {
      const now = new Date();
      elClock.textContent = now.toLocaleTimeString('en-IN', { hour12: false }) + ' IST';
    }
  }
  setInterval(updateClock, 1000);
  updateClock();

  // -------------------------------------------------------------
  // Telemetry Processing & UI Updates
  // -------------------------------------------------------------
  function updateTelemetryUI(data) {
    if (!data) return;

    const i_in = parseFloat(data.i_in || 0);
    const i_out = parseFloat(data.i_out || 0);
    const house_1 = parseFloat(data.house_1 || 0);
    const house_2 = parseFloat(data.house_2 || 0);
    const i_auth = parseFloat(data.i_auth || (house_1 + house_2));
    const i_theft = parseFloat(data.i_theft || 0);
    const theft_detected = Boolean(data.theft_detected || (i_theft > 0.25));

    // Update 4 Instrumentation Cards
    if (elValIn) elValIn.textContent = i_in.toFixed(3);
    if (elValOut) elValOut.textContent = i_out.toFixed(3);
    if (elValAuth) elValAuth.textContent = i_auth.toFixed(3);
    if (elValTheft) elValTheft.textContent = i_theft.toFixed(3);

    // Update domestic split breakdown
    if (elHouse1) elHouse1.textContent = house_1.toFixed(3) + ' A';
    if (elHouse2) elHouse2.textContent = house_2.toFixed(3) + ' A';

    // Update KCL Balance Visual Bar
    const totalIn = Math.max(0.001, i_in);
    const pctOut = Math.min(100, Math.max(0, (i_out / totalIn) * 100));
    const pctAuth = Math.min(100 - pctOut, Math.max(0, (i_auth / totalIn) * 100));
    const pctTheft = Math.min(100, Math.max(0, 100 - pctOut - pctAuth));

    if (elSegOut) elSegOut.style.width = pctOut.toFixed(1) + '%';
    if (elSegAuth) elSegAuth.style.width = pctAuth.toFixed(1) + '%';
    if (elSegTheft) elSegTheft.style.width = pctTheft.toFixed(1) + '%';

    if (elKclFormula) {
      elKclFormula.textContent = `${i_in.toFixed(3)}A - ${i_out.toFixed(3)}A - ${i_auth.toFixed(3)}A = ${i_theft.toFixed(3)}A`;
    }

    // Diagnostics Table
    if (elDiagTime) elDiagTime.textContent = new Date(data.timestamp || Date.now()).toLocaleTimeString('en-IN');
    if (elDiagSource) elDiagSource.textContent = data.source || 'LIVE_TELEMETRY';
    if (elDiagStatus) {
      if (theft_detected) {
        elDiagStatus.innerHTML = '<span style="color:#ff1744;font-weight:800;">🚨 THEFT DETECTED</span>';
      } else {
        elDiagStatus.innerHTML = '<span style="color:#00e676;font-weight:800;">✓ BALANCED / NORMAL</span>';
      }
    }

    // -----------------------------------------------------------
    // Pop-Up Power Theft Alert Modal Handling
    // Trigger condition: theft_detected === true OR i_theft > 0.25A
    // -----------------------------------------------------------
    if (theft_detected || i_theft > 0.25) {
      // If a new distinct theft event occurs (or magnitude shifts significantly)
      const magnitudeDelta = Math.abs(i_theft - lastTheftMagnitude);
      if (!lastTheftState || magnitudeDelta > 0.8) {
        isModalDismissedForCurrentTheft = false;
      }

      if (!isModalDismissedForCurrentTheft) {
        showTheftAlertModal({
          location: data.location || 'Monitored Zone 1 Feeder Tap',
          magnitude: i_theft > 0 ? i_theft : (data.theft_magnitude || 3.450),
          timestamp: data.timestamp || new Date().toISOString()
        });
      }

      lastTheftState = true;
      lastTheftMagnitude = i_theft;
    } else {
      // Normal state: reset dismissed lock so next incident triggers alert immediately
      lastTheftState = false;
      lastTheftMagnitude = 0;
      isModalDismissedForCurrentTheft = false;
      hideTheftAlertModal();
    }
  }

  // -------------------------------------------------------------
  // Alert Modal Controls
  // -------------------------------------------------------------
  function showTheftAlertModal(info) {
    if (!elAlertModal) return;

    if (elAlertLocation) {
      elAlertLocation.textContent = info.location || 'Monitored Zone 1 Feeder Tap';
    }
    if (elAlertMagnitude) {
      elAlertMagnitude.textContent = `Theft Current: ${parseFloat(info.magnitude).toFixed(3)} A`;
    }
    if (elAlertTimestamp) {
      elAlertTimestamp.textContent = new Date(info.timestamp).toLocaleString('en-IN');
    }

    elAlertModal.classList.add('show-modal');
  }

  function hideTheftAlertModal() {
    if (elAlertModal) {
      elAlertModal.classList.remove('show-modal');
    }
  }

  if (elBtnAck) {
    elBtnAck.addEventListener('click', function () {
      isModalDismissedForCurrentTheft = true;
      hideTheftAlertModal();
    });
  }

  // -------------------------------------------------------------
  // SSE Streaming with 1-Second HTTP Polling Fallback
  // -------------------------------------------------------------
  function setConnectionStatus(type, message) {
    if (!elStatusDot || !elStatusText) return;

    elStatusDot.className = 'status-dot';
    if (type === 'sse') {
      elStatusDot.classList.add('active-sse');
      elStatusText.textContent = message || 'SSE Stream Connected';
    } else if (type === 'poll') {
      elStatusDot.classList.add('active-poll');
      elStatusText.textContent = message || 'HTTP Polling Fallback (1s)';
    } else {
      elStatusDot.classList.add('offline');
      elStatusText.textContent = message || 'Connection Offline';
    }
  }

  function startSseStream() {
    if (window.EventSource) {
      try {
        eventSource = new EventSource('/api/telemetry/stream');

        eventSource.onopen = function () {
          isSseActive = true;
          stopPollingFallback();
          setConnectionStatus('sse', 'SSE Stream Connected');
        };

        eventSource.onmessage = function (event) {
          try {
            const data = JSON.parse(event.data);
            updateTelemetryUI(data);
          } catch (e) {
            console.error('Failed to parse SSE payload', e);
          }
        };

        eventSource.onerror = function () {
          isSseActive = false;
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }
          // Activate 1-second polling fallback
          startPollingFallback();
          // Attempt to reconnect SSE in 5 seconds
          setTimeout(startSseStream, 5000);
        };
      } catch (e) {
        startPollingFallback();
      }
    } else {
      startPollingFallback();
    }
  }

  function startPollingFallback() {
    if (pollingInterval) return;
    setConnectionStatus('poll', 'HTTP Polling Fallback (1s)');

    const fetchLive = function () {
      fetch('/api/telemetry/live')
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        })
        .then(function (json) {
          if (json && json.data) {
            setConnectionStatus('poll', 'HTTP Polling Active (1s)');
            updateTelemetryUI(json.data);
          }
        })
        .catch(function () {
          // If both backend SSE and HTTP polling fail (e.g. running statically on GitHub Pages)
          runStaticGithubPagesFallback();
        });
    };

    fetchLive();
    pollingInterval = setInterval(fetchLive, 1000);
  }

  function stopPollingFallback() {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
  }

  // -------------------------------------------------------------
  // Static GitHub Pages Fallback Simulation
  // Ensures the website works directly when hosted via GitHub Pages!
  // -------------------------------------------------------------
  let ghPagesSimActive = false;
  let ghTheftFlag = false;

  function runStaticGithubPagesFallback() {
    if (ghPagesSimActive) return;
    ghPagesSimActive = true;
    setConnectionStatus('sse', 'GitHub Pages Live Simulator');

    setInterval(function () {
      const house1 = 1.650 + (Math.random() * 0.06 - 0.03);
      const house2 = 1.500 + (Math.random() * 0.04 - 0.02);
      const auth = house1 + house2;
      const iOut = 2.100 + (Math.random() * 0.04 - 0.02);
      const iTheft = ghTheftFlag ? (3.450 + (Math.random() * 0.08 - 0.04)) : 0;
      const iIn = iOut + auth + iTheft;

      updateTelemetryUI({
        i_in: iIn,
        i_out: iOut,
        house_1: house1,
        house_2: house2,
        i_auth: auth,
        i_theft: iTheft,
        theft_detected: ghTheftFlag,
        location: 'Monitored Zone 1 Feeder Tap',
        timestamp: new Date().toISOString(),
        source: 'GH_PAGES_CLIENT_ENGINE'
      });
    }, 1000);
  }

  // -------------------------------------------------------------
  // Interactive Simulation Trigger Controls
  // -------------------------------------------------------------
  window.triggerTheftTest = function (theftActive, magnitude) {
    ghTheftFlag = theftActive;

    fetch('/api/telemetry/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theft: theftActive, magnitude: magnitude || 3.450 })
    }).catch(function () {
      // In static GitHub Pages mode, client variable is already toggled
    });
  };

  // Initialize stream on load
  document.addEventListener('DOMContentLoaded', function () {
    startSseStream();
  });
})();
