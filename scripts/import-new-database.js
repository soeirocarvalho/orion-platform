import XLSX from 'xlsx';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { neon } from '@neondatabase/serverless';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get DATABASE_URL from environment
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable not found');
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

// Map XLSX columns to database schema
function mapForceToSchema(row, isCurated = false) {
  // Parse tags from semicolon-separated string
  const tags = row.Tags ? row.Tags.split(';').map(t => t.trim()).filter(Boolean) : [];
  
  // Map type from "Driving Force" column
  const typeMapping = {
    'Megatrends': 'M',
    'Trends': 'T',
    'Weak Signals': 'WS',
    'Wildcards': 'WC',
    'Signals': 'S'
  };
  const type = typeMapping[row['Driving Force']] || 'S';
  
  // Determine STEEP category based on dimension (simplified mapping)
  const dimensionToSteep = {
    'Digital & AI': 'Technological',
    'Technology Acceleration': 'Technological',
    'Biotechnology': 'Technological',
    'Consumer': 'Social',
    'Identities': 'Social',
    'Health': 'Social',
    'Mobility': 'Environmental',
    'Energy': 'Environmental',
    'Economy': 'Economic',
    'Business': 'Economic',
    'Longevity / Ageing': 'Social',
  };
  
  const steep = dimensionToSteep[row.dimension] || 'Technological';
  
  return {
    title: row.Title || '',
    type: type.charAt(0), // M/T/WS/WC/S
    steep,
    dimension: row.dimension || '',
    scope: isCurated ? 'curated' : 'signals',
    impact: row.magnitude || null,
    ttm: row['Time to Market'] || null,
    sentiment: 'Neutral', // Default as not provided
    source: row.Source || '',
    tags,
    text: row.Description || '',
    magnitude: row.magnitude || null,
    distance: row.distance || null,
    colorHex: row.color_hex || null,
  };
}

async function importDatabase() {
  console.log('🚀 Starting ORION database import...\n');
  
  // 1. Read the XLSX file
  const fullDbPath = join(__dirname, '../attached_assets/ORION_DATABASE_1759309387112.xlsx');
  const workbook = XLSX.readFile(fullDbPath);
  
  // 2. Get the default project ID
  console.log('📋 Finding default project...');
  const projects = await sql`SELECT id, name FROM projects WHERE is_default = true LIMIT 1`;
  
  if (projects.length === 0) {
    console.error('❌ No default project found. Please create one first.');
    process.exit(1);
  }
  
  const projectId = projects[0].id;
  console.log(`   ✅ Using project: "${projects[0].name}" (${projectId})\n`);
  
  // 3. Clear existing forces in the default project
  console.log('🗑️  Clearing existing forces...');
  const deleteResult = await sql`DELETE FROM driving_forces WHERE project_id = ${projectId}`;
  console.log(`   ✅ Deleted ${deleteResult.length} existing forces\n`);
  
  // 4. Import Curated forces
  console.log('📥 Importing CURATED forces...');
  const curatedSheet = workbook.Sheets['Curated'];
  const curatedData = XLSX.utils.sheet_to_json(curatedSheet, { defval: '' });
  
  let curatedCount = 0;
  const curatedBatchSize = 100;
  
  for (let i = 0; i < curatedData.length; i++) {
    const row = curatedData[i];
    const force = mapForceToSchema(row, true);
    
    await sql`
      INSERT INTO driving_forces (
        project_id, title, type, steep, dimension, scope, impact, ttm, 
        sentiment, source, tags, text, magnitude, distance, color_hex
      ) VALUES (
        ${projectId},
        ${force.title},
        ${force.type},
        ${force.steep},
        ${force.dimension},
        ${force.scope},
        ${force.impact},
        ${force.ttm},
        ${force.sentiment},
        ${force.source},
        ${force.tags},
        ${force.text},
        ${force.magnitude},
        ${force.distance},
        ${force.colorHex}
      )
    `;
    
    curatedCount++;
    if (curatedCount % 100 === 0 || curatedCount === curatedData.length) {
      process.stdout.write(`\r   Progress: ${curatedCount}/${curatedData.length} forces imported`);
    }
  }
  console.log('\n   ✅ Curated forces imported\n');
  
  // 5. Import Signals forces
  console.log('📥 Importing SIGNALS forces...');
  const signalsSheet = workbook.Sheets['Signals'];
  const signalsData = XLSX.utils.sheet_to_json(signalsSheet, { defval: '' });
  
  let signalsCount = 0;
  const signalsBatchSize = 100;
  
  for (let i = 0; i < signalsData.length; i++) {
    const row = signalsData[i];
    const force = mapForceToSchema(row, false);
    
    await sql`
      INSERT INTO driving_forces (
        project_id, title, type, steep, dimension, scope, impact, ttm, 
        sentiment, source, tags, text, magnitude, distance, color_hex
      ) VALUES (
        ${projectId},
        ${force.title},
        ${force.type},
        ${force.steep},
        ${force.dimension},
        ${force.scope},
        ${force.impact},
        ${force.ttm},
        ${force.sentiment},
        ${force.source},
        ${force.tags},
        ${force.text},
        ${force.magnitude},
        ${force.distance},
        ${force.colorHex}
      )
    `;
    
    signalsCount++;
    if (signalsCount % 500 === 0 || signalsCount === signalsData.length) {
      process.stdout.write(`\r   Progress: ${signalsCount}/${signalsData.length} forces imported`);
    }
  }
  console.log('\n   ✅ Signals forces imported\n');
  
  // 6. Verify import
  console.log('🔍 Verifying import...');
  const totalResult = await sql`SELECT COUNT(*) as count FROM driving_forces WHERE project_id = ${projectId}`;
  const typeDistribution = await sql`
    SELECT type, COUNT(*) as count 
    FROM driving_forces 
    WHERE project_id = ${projectId}
    GROUP BY type 
    ORDER BY count DESC
  `;
  
  console.log(`\n✅ Import complete!`);
  console.log(`   Total forces: ${totalResult[0].count}`);
  console.log(`   Type distribution:`);
  typeDistribution.forEach(row => {
    const typeName = {
      'M': 'Megatrends',
      'T': 'Trends',
      'WS': 'Weak Signals',
      'WC': 'Wildcards',
      'S': 'Signals'
    }[row.type] || row.type;
    console.log(`     - ${typeName}: ${row.count}`);
  });
  
  process.exit(0);
}

importDatabase().catch(err => {
  console.error('❌ Import failed:', err);
  process.exit(1);
});
