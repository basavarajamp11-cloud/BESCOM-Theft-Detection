/**
 * BESCOM Smart Grid Operations & Vigilance Constants
 */

module.exports = {
  ZONES: {
    BMAZ_NORTH: 'BMAZ-North',
    BMAZ_SOUTH: 'BMAZ-South',
    BMAZ_EAST: 'BMAZ-East',
    BMAZ_WEST: 'BMAZ-West',
    BRAZ: 'BRAZ'
  },

  CONSUMER_CATEGORIES: {
    LT1: { code: 'LT-1', name: 'Lifeline / BPL Domestic', tariffPerKwh: 3.50 },
    LT2: { code: 'LT-2', name: 'Domestic Residential', tariffPerKwh: 6.25 },
    LT3: { code: 'LT-3', name: 'Commercial Establishments', tariffPerKwh: 8.90 },
    LT5: { code: 'LT-5', name: 'Small Scale Industrial', tariffPerKwh: 7.80 }
  },

  TAMPER_TYPES: {
    DIRECT_LINE_HOOK: {
      code: 'DIRECT_LINE_HOOK',
      label: 'Direct Overhead Line Hooking / Tapping',
      severity: 'CRITICAL',
      firEligible: true,
      description: 'Downstream power mismatch without consumer meter detection.'
    },
    NEUTRAL_TAMPER: {
      code: 'NEUTRAL_TAMPER',
      label: 'Neutral Line Disconnection / Earth Return Bypass',
      severity: 'HIGH',
      firEligible: true,
      description: 'Load current returning via external earth, bypassing neutral CT.'
    },
    METER_BYPASS: {
      code: 'METER_BYPASS',
      label: 'Meter Terminal Shunt / External Phase Bypass',
      severity: 'CRITICAL',
      firEligible: true,
      description: 'Current bypass jumper detected around meter terminals.'
    },
    MAGNETIC_INTERFERENCE: {
      code: 'MAGNETIC_INTERFERENCE',
      label: 'Strong External Magnetic Tamper',
      severity: 'HIGH',
      firEligible: false,
      description: 'Neodymium magnetic field (>0.5 Tesla) detected saturating CT core.'
    },
    CT_REVERSAL: {
      code: 'CT_REVERSAL',
      label: 'Current Transformer Polarity Reversal',
      severity: 'MEDIUM',
      firEligible: false,
      description: 'Reverse energy vector detected during active consumer drawing.'
    },
    ENCLOSURE_BREACH: {
      code: 'ENCLOSURE_BREACH',
      label: 'Terminal Cover / Enclosure Optical Sensor Open',
      severity: 'MEDIUM',
      firEligible: false,
      description: 'Microswitch or optical sensor opened while energized.'
    }
  },

  THRESHOLDS: {
    MIN_THEFT_KW: parseFloat(process.env.THEFT_THRESHOLD_KW || '1.2'),
    THEFT_PERCENTAGE: parseFloat(process.env.THEFT_THRESHOLD_PERCENT || '7.5'),
    MAX_TECHNICAL_LOSS_PERCENT: 5.5, // Standard allowable Joule heating & core losses in LT network
    CONSECUTIVE_CYCLES_TRIGGER: 2,   // Confirmation cycles to filter false positives
    VOLTAGE_LOW_LIMIT: 195.0,
    VOLTAGE_HIGH_LIMIT: 255.0,
    NOMINAL_VOLTAGE: 230.0,
    NOMINAL_FREQUENCY: 50.0
  },

  KERC_COMMERCIAL_TARIFF: parseFloat(process.env.KERC_TARIFF_INR_PER_KWH || '8.50')
};
