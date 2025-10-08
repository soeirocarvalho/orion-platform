import { neon } from '@neondatabase/serverless';
import { writeFileSync, appendFileSync } from 'fs';

// Get database URL from environment
const sql = neon(process.env.DATABASE_URL);

// Project ID for the ORION dataset with correct force counts
const PROJECT_ID = '4cb37283-018d-4848-8e9f-599e4257dbc9'; // Paulo_1 project

async function exportForcesToCSV() {
  try {
    console.log('Starting force export...');
    console.log(`Using project: ${PROJECT_ID}`);

    // CSV Headers
    const headers = ['id', 'title', 'type', 'steep', 'dimension', 'scope', 'impact', 'ttm', 'sentiment', 'source', 'text', 'magnitude', 'tags'];
    const csvHeader = headers.join(',') + '\n';

    // Function to escape CSV values
    function escapeCSVValue(value) {
      if (value === null || value === undefined) return '';
      const stringValue = String(value);
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return '"' + stringValue.replace(/"/g, '""') + '"';
      }
      return stringValue;
    }

    // Function to convert row to CSV line
    function rowToCSV(row) {
      return headers.map(header => escapeCSVValue(row[header])).join(',') + '\n';
    }

    console.log('Exporting curated forces...');
    // First export curated forces (smaller dataset ~2,878 records)
    const curatedQuery = `
      SELECT 
        id,
        title,
        type,
        steep,
        dimension,
        scope,
        impact,
        ttm,
        sentiment,
        source,
        text,
        magnitude,
        ARRAY_TO_STRING(tags, ';') as tags
      FROM driving_forces 
      WHERE project_id = $1 AND type != 'S'
      ORDER BY type, title
    `;

    const curatedForces = await sql(curatedQuery, [PROJECT_ID]);
    console.log(`Found ${curatedForces.length} curated forces`);

    // Write curated forces CSV
    writeFileSync('curated_driving_forces.csv', csvHeader);
    curatedForces.forEach(row => {
      appendFileSync('curated_driving_forces.csv', rowToCSV(row));
    });

    console.log('Exporting non-curated forces (signals) in batches...');
    // Export signals in batches due to size (27k+ records)
    const batchSize = 1000;
    
    // Get total count first
    const countQuery = `SELECT COUNT(*) as count FROM driving_forces WHERE project_id = $1 AND type = 'S'`;
    const countResult = await sql(countQuery, [PROJECT_ID]);
    const totalSignals = countResult[0].count;
    console.log(`Found ${totalSignals} signals to export`);

    // Initialize signals CSV file
    writeFileSync('signals_driving_forces.csv', csvHeader);

    // Export signals in batches
    for (let offset = 0; offset < totalSignals; offset += batchSize) {
      console.log(`Fetching signals batch ${Math.floor(offset/batchSize) + 1}/${Math.ceil(totalSignals/batchSize)} (${offset + 1}-${Math.min(offset + batchSize, totalSignals)})`);
      
      const batchQuery = `
        SELECT 
          id,
          title,
          type,
          steep,
          dimension,
          scope,
          impact,
          ttm,
          sentiment,
          source,
          text,
          magnitude,
          ARRAY_TO_STRING(tags, ';') as tags
        FROM driving_forces 
        WHERE project_id = $1 AND type = 'S'
        ORDER BY title
        LIMIT $2 OFFSET $3
      `;
      
      const batch = await sql(batchQuery, [PROJECT_ID, batchSize, offset]);
      batch.forEach(row => {
        appendFileSync('signals_driving_forces.csv', rowToCSV(row));
      });
    }

    console.log('✓ Created curated_driving_forces.csv');
    console.log('✓ Created signals_driving_forces.csv');

    // Print summary
    console.log('\n📊 Export Summary:');
    console.log(`• Curated forces: ${curatedForces.length} (Megatrends, Trends, Weak Signals, Wildcards)`);
    console.log(`• Non-curated forces: ${totalSignals} (Signals)`);
    console.log(`• Total forces: ${curatedForces.length + totalSignals}`);

  } catch (error) {
    console.error('Export failed:', error);
    process.exit(1);
  }
}

exportForcesToCSV();