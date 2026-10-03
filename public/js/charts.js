/**
 * Real-Time Telemetry and KERC Loss Charts using Chart.js
 */

class ScadaCharts {
  constructor() {
    this.powerChart = null;
    this.feederChart = null;
    this.maxPoints = 20;
    this.labels = [];
    this.supplyData = [];
    this.meteredData = [];
    this.theftData = [];
  }

  init() {
    const powerCtx = document.getElementById('realtimePowerChart')?.getContext('2d');
    const feederCtx = document.getElementById('feederLossChart')?.getContext('2d');

    if (powerCtx) {
      this.powerChart = new Chart(powerCtx, {
        type: 'line',
        data: {
          labels: this.labels,
          datasets: [
            {
              label: 'Total DTC Supply (kW)',
              data: this.supplyData,
              borderColor: '#0284c7',
              backgroundColor: 'rgba(2, 132, 199, 0.1)',
              borderWidth: 2,
              tension: 0.3,
              fill: true
            },
            {
              label: 'Metered Demand (kW)',
              data: this.meteredData,
              borderColor: '#10b981',
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              borderWidth: 2,
              tension: 0.3,
              fill: false
            },
            {
              label: 'Unaccounted Theft Loss (kW)',
              data: this.theftData,
              borderColor: '#ef4444',
              backgroundColor: 'rgba(239, 68, 68, 0.2)',
              borderWidth: 2,
              tension: 0.3,
              fill: true
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 400 },
          scales: {
            x: {
              grid: { color: '#1f2937' },
              ticks: { color: '#9ca3af', font: { size: 10 } }
            },
            y: {
              grid: { color: '#1f2937' },
              ticks: { color: '#9ca3af', font: { size: 10 } },
              title: { display: true, text: 'Active Power (kW)', color: '#6b7280' }
            }
          },
          plugins: {
            legend: {
              labels: { color: '#e5e7eb', font: { size: 11 } }
            }
          }
        }
      });
    }

    if (feederCtx) {
      this.feederChart = new Chart(feederCtx, {
        type: 'bar',
        data: {
          labels: ['Indiranagar', 'Koramangala', 'Whitefield', 'Peenya'],
          datasets: [
            {
              label: 'Feeder AT&C Loss (%)',
              data: [5.2, 6.1, 4.8, 8.4],
              backgroundColor: ['#0284c7', '#0284c7', '#0284c7', '#0284c7'],
              borderRadius: 4
            },
            {
              type: 'line',
              label: 'KERC Target (11.5%)',
              data: [11.5, 11.5, 11.5, 11.5],
              borderColor: '#f59e0b',
              borderDash: [5, 5],
              borderWidth: 2,
              pointRadius: 0
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              grid: { color: '#1f2937' },
              ticks: { color: '#9ca3af', font: { size: 11 } }
            },
            y: {
              grid: { color: '#1f2937' },
              ticks: { color: '#9ca3af', font: { size: 10 } },
              title: { display: true, text: 'AT&C Loss %', color: '#6b7280' },
              max: 25
            }
          },
          plugins: {
            legend: {
              labels: { color: '#e5e7eb', font: { size: 11 } }
            }
          }
        }
      });
    }
  }

  updateLivePower(supplyKw, meteredKw, theftKw) {
    if (!this.powerChart) return;

    const timeLabel = new Date().toLocaleTimeString('en-IN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

    if (this.labels.length >= this.maxPoints) {
      this.labels.shift();
      this.supplyData.shift();
      this.meteredData.shift();
      this.theftData.shift();
    }

    this.labels.push(timeLabel);
    this.supplyData.push(supplyKw);
    this.meteredData.push(meteredKw);
    this.theftData.push(theftKw);

    this.powerChart.update('none');
  }

  updateFeederReport(feederReports) {
    if (!this.feederChart || !feederReports || feederReports.length === 0) return;

    const labels = feederReports.map(f => f.subdivision || f.feeder_code);
    const losses = feederReports.map(f => f.atc_loss_percentage);
    const colors = losses.map(l => l > 11.5 ? '#ef4444' : (l > 7.5 ? '#f59e0b' : '#0284c7'));

    this.feederChart.data.labels = labels;
    this.feederChart.data.datasets[0].data = losses;
    this.feederChart.data.datasets[0].backgroundColor = colors;
    this.feederChart.data.datasets[1].data = labels.map(() => 11.5);

    this.feederChart.update();
  }
}

window.ScadaCharts = ScadaCharts;
