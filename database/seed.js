const { db } = require('./db');

function seedDatabase() {
  console.log('⚡ Initializing BESCOM Grid Infrastructure Seeds...');

  const subCount = db.prepare('SELECT COUNT(*) as count FROM substations').get().count;
  if (subCount > 0) {
    console.log('✓ Grid infrastructure already seeded.');
    return;
  }

  // 1. Seed Substations
  const insertSubstation = db.prepare(`
    INSERT INTO substations (code, name, zone, subdivision, lat, lng, capacity_mva)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const substations = [
    ['SS-IND-01', 'Indiranagar 66/11kV Substation', 'BMAZ-East', 'Indiranagar', 12.9784, 77.6408, 40.0],
    ['SS-KOR-02', 'Koramangala 66/11kV Substation', 'BMAZ-South', 'Koramangala', 12.9352, 77.6245, 50.0],
    ['SS-WFD-03', 'Whitefield 66/11kV Substation', 'BMAZ-East', 'Whitefield', 12.9698, 77.7499, 60.0],
    ['SS-PNY-04', 'Peenya Industrial 220/66/11kV Substation', 'BMAZ-North', 'Peenya', 13.0285, 77.5197, 80.0]
  ];

  db.exec('BEGIN TRANSACTION;');
  substations.forEach(s => insertSubstation.run(...s));
  db.exec('COMMIT;');
  console.log(`✓ Seeded ${substations.length} 66/11kV Major Substations`);

  // 2. Seed Feeders
  const insertFeeder = db.prepare(`
    INSERT INTO feeders (code, name, substation_id, voltage_kv, status)
    VALUES (?, ?, ?, ?, ?)
  `);

  const feeders = [
    ['F-IND-100FT', '100 Ft Road Express Feeder', 1, 11.0, 'ACTIVE'],
    ['F-KOR-80FT', '80 Ft Road Commercial Feeder', 2, 11.0, 'ACTIVE'],
    ['F-WFD-ITPL', 'ITPL Corridor Feeder', 3, 11.0, 'ACTIVE'],
    ['F-PNY-IND2', 'Peenya Industrial Sector 2 Feeder', 4, 11.0, 'ACTIVE']
  ];

  db.exec('BEGIN TRANSACTION;');
  feeders.forEach(f => insertFeeder.run(...f));
  db.exec('COMMIT;');
  console.log(`✓ Seeded ${feeders.length} 11kV Radial Distribution Feeders`);

  // 3. Seed Distribution Transformers (DTCs)
  const insertTransformer = db.prepare(`
    INSERT INTO transformers (code, name, feeder_id, capacity_kva, lat, lng, rated_current, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const transformers = [
    ['DTC-IND-T01', 'Defence Colony DTC-42', 1, 250, 12.9792, 77.6394, 347.0, 'NORMAL'],
    ['DTC-IND-T02', 'CMH Road Commercial Complex DTC', 1, 500, 12.9774, 77.6425, 695.0, 'NORMAL'],
    ['DTC-KOR-T01', 'Koramangala 4th Block DTC-18', 2, 250, 12.9341, 77.6252, 347.0, 'NORMAL'],
    ['DTC-KOR-T02', '5th Block Jyoti Nivas DTC', 2, 500, 12.9366, 77.6231, 695.0, 'NORMAL'],
    ['DTC-WFD-T01', 'Prestige Tech Enclave DTC', 3, 400, 12.9682, 77.7512, 556.0, 'NORMAL'],
    ['DTC-PNY-T01', 'Peenya Heavy Precision Engg DTC', 4, 630, 13.0292, 77.5212, 876.0, 'NORMAL']
  ];

  db.exec('BEGIN TRANSACTION;');
  transformers.forEach(t => insertTransformer.run(...t));
  db.exec('COMMIT;');
  console.log(`✓ Seeded ${transformers.length} 11kV/415V Distribution Transformers (DTCs)`);

  // 4. Seed Downstream Consumers & Smart Meters
  const insertConsumer = db.prepare(`
    INSERT INTO consumers (rr_number, name, category, address, transformer_id, sanctioned_kw, lat, lng, meter_serial, relay_status, phone, active_theft_scenario)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const consumers = [
    // Connected to DTC-IND-T01 (Indiranagar Residential DTC)
    ['E1-40101', 'Brig. S. K. Nair', 'LT-2', '#14, 2nd Main, Defence Colony', 1, 6.0, 12.9795, 77.6391, 'MTR-LNT-009181', 'CONNECTED', '+919845011001', 'NONE'],
    ['E1-40102', 'Kavitha Ramachandran', 'LT-2', '#28, 3rd Cross, Defence Colony', 1, 5.0, 12.9790, 77.6397, 'MTR-SCH-002341', 'CONNECTED', '+919845011002', 'NONE'],
    ['E1-40103', 'Anand Rao', 'LT-2', '#72, 4th Main, Defence Colony', 1, 8.0, 12.9788, 77.6392, 'MTR-HPL-008712', 'CONNECTED', '+919845011003', 'NONE'],
    ['E1-40104', 'Corner Bakery & Cafe', 'LT-3', '#91, 100ft Road Corner', 1, 12.0, 12.9796, 77.6399, 'MTR-SEC-004523', 'CONNECTED', '+919845011004', 'NONE'],
    ['E1-40105', 'M/s Green Sprout Clinic', 'LT-3', '#104, Defence Colony Outer', 1, 10.0, 12.9785, 77.6389, 'MTR-LNT-009185', 'CONNECTED', '+919845011005', 'NONE'],

    // Connected to DTC-IND-T02 (Indiranagar CMH Road Commercial DTC)
    ['E1-50201', 'Silicon Heights Retail', 'LT-3', '#401, CMH Road Commercial Wing', 2, 25.0, 12.9776, 77.6421, 'MTR-SCH-007812', 'CONNECTED', '+919845022001', 'NONE'],
    ['E1-50202', 'Brew & Roast Bistro', 'LT-3', '#412, CMH Road Arcade', 2, 18.0, 12.9771, 77.6428, 'MTR-SEC-006231', 'CONNECTED', '+919845022002', 'NONE'],
    ['E1-50203', 'Apex Diagnostics Lab', 'LT-3', '#420, CMH Road Main', 2, 30.0, 12.9778, 77.6423, 'MTR-LNT-009210', 'CONNECTED', '+919845022003', 'NONE'],
    ['E1-50204', 'Shri Balaji Supermarket', 'LT-3', '#425, CMH Metro Pillar 84', 2, 22.0, 12.9769, 77.6430, 'MTR-HPL-004412', 'CONNECTED', '+919845022004', 'NONE'],

    // Connected to DTC-KOR-T01 (Koramangala 4th Block Residential)
    ['S3-60101', 'Dr. Arvind Swaminathan', 'LT-2', '#88, 4th Block, 80ft Road', 3, 7.0, 12.9344, 77.6255, 'MTR-LNT-008121', 'CONNECTED', '+919845033001', 'NONE'],
    ['S3-60102', 'Deepa & Rohit Sen', 'LT-2', '#102, 4th Block, 14th Main', 3, 6.0, 12.9338, 77.6248, 'MTR-SCH-005611', 'CONNECTED', '+919845033002', 'NONE'],
    ['S3-60103', 'Prithvi Villa Apartment', 'LT-2', '#120, 4th Block', 3, 20.0, 12.9346, 77.6250, 'MTR-SEC-009841', 'CONNECTED', '+919845033003', 'NONE'],
    ['S3-60104', 'The Organic Store', 'LT-3', '#15, 80ft Road Junction', 3, 9.0, 12.9335, 77.6258, 'MTR-HPL-003321', 'CONNECTED', '+919845033004', 'NONE'],

    // Connected to DTC-KOR-T02 (Koramangala 5th Block Commercial)
    ['S3-70201', 'Koramangala Social Club', 'LT-3', '#118, 5th Block Hub', 4, 35.0, 12.9368, 77.6234, 'MTR-LNT-009301', 'CONNECTED', '+919845044001', 'NONE'],
    ['S3-70202', 'Fusion Co-working Space', 'LT-3', '#124, KHB Colony Road', 4, 40.0, 12.9362, 77.6228, 'MTR-SEC-008819', 'CONNECTED', '+919845044002', 'NONE'],
    ['S3-70203', 'Chai Point Flagship', 'LT-3', '#130, Jyoti Nivas College Rd', 4, 15.0, 12.9369, 77.6238, 'MTR-SCH-004419', 'CONNECTED', '+919845044003', 'NONE'],

    // Connected to DTC-WFD-T01 (Whitefield Residential & Tech)
    ['E3-80101', 'Prestige Palms Clubhouse', 'LT-3', 'ITPL Main Road, Whitefield', 5, 25.0, 12.9685, 77.7515, 'MTR-LNT-009401', 'CONNECTED', '+919845055001', 'NONE'],
    ['E3-80102', 'Siddharth Hegde', 'LT-2', 'Tower A-402, Palms Enclave', 5, 8.0, 12.9678, 77.7508, 'MTR-SEC-007712', 'CONNECTED', '+919845055002', 'NONE'],
    ['E3-80103', 'Meera Krishnan', 'LT-2', 'Villa 12, Palms Enclave', 5, 10.0, 12.9688, 77.7518, 'MTR-SCH-006612', 'CONNECTED', '+919845055003', 'NONE'],

    // Connected to DTC-PNY-T01 (Peenya Industrial)
    ['N1-90101', 'Karnat Precision Tooling Pvt Ltd', 'LT-5', 'Plot 48/A, Peenya Phase 2', 6, 65.0, 13.0295, 77.5215, 'MTR-LNT-009501', 'CONNECTED', '+919845066001', 'NONE'],
    ['N1-90102', 'Venkateshwara Heat Treating Works', 'LT-5', 'Plot 52/B, Peenya Industrial Area', 6, 50.0, 13.0288, 77.5208, 'MTR-SEC-006691', 'CONNECTED', '+919845066002', 'NONE'],
    ['N1-90103', 'Sri Renuka Extrusions', 'LT-5', 'Plot 55, 3rd Cross Peenya', 6, 75.0, 13.0298, 77.5220, 'MTR-SCH-003310', 'CONNECTED', '+919845066003', 'NONE']
  ];

  db.exec('BEGIN TRANSACTION;');
  consumers.forEach(c => insertConsumer.run(...c));
  db.exec('COMMIT;');
  console.log(`✓ Seeded ${consumers.length} BESCOM Consumers with Smart Meters across Bengaluru`);
  console.log('⚡ Grid Infrastructure seeding completed successfully.');
}

if (require.main === module) {
  seedDatabase();
}

module.exports = { seedDatabase };
