import { neon } from '@neondatabase/serverless';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable not found');
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

async function fastImport() {
  console.log('🚀 Starting fast ORION database import...\n');
  
  // 1. Get default project
  console.log('📋 Finding default project...');
  const projects = await sql`SELECT id, name FROM projects WHERE is_default = true LIMIT 1`;
  
  if (projects.length === 0) {
    console.error('❌ No default project found');
    process.exit(1);
  }
  
  const projectId = projects[0].id;
  console.log(`   ✅ Using project: "${projects[0].name}" (${projectId})\n`);
  
  // 2. Clear existing forces
  console.log('🗑️  Clearing existing forces...');
  await sql`DELETE FROM driving_forces WHERE project_id = ${projectId}`;
  console.log('   ✅ Cleared\n');
  
  // 3. Read CSV and prepare batch inserts
  console.log('📥 Reading CSV data...');
  const csvPath = join(__dirname, '../orion_forces_import.csv');
  const csvContent = fs.readFileSync(csvPath, 'utf8');
  const lines = csvContent.split('\n');
  const headers = lines[0];
  const dataLines = lines.slice(1).filter(line => line.trim());
  
  console.log(`   Found ${dataLines.length} forces to import\n`);
  
  // 4. Batch import using VALUES syntax (faster than individual INSERTs)
  console.log('⚡ Importing forces in batches...');
  const batchSize = 1000;
  let imported = 0;
  
  for (let i = 0; i < dataLines.length; i += batchSize) {
    const batch = dataLines.slice(i, i + batchSize);
    const values = [];
    
    batch.forEach(line => {
      // Parse CSV line (simple parser - assumes proper escaping from our converter)
      const parseCsvLine = (line) => {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          const nextChar = line[i + 1];
          
          if (char === '"' && inQuotes && nextChar === '"') {
            current += '"';
            i++; // Skip next quote
          } else if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
          } else {
            current += char;
          }
        }
        result.push(current);
        return result;
      };
      
      const fields = parseCsvLine(line);
      if (fields.length >= 14) {
        const [title, type, steep, dimension, scope, impact, ttm, sentiment, source, tags, text, magnitude, distance, colorHex] = fields;
        
        // Convert tags back to array
        const tagsArray = tags ? tags.split(',').filter(Boolean) : [];
        
        values.push({
          projectId,
          title,
          type,
          steep,
          dimension,
          scope,
          impact: impact ? parseFloat(impact) : null,
          ttm,
          sentiment,
          source,
          tags: tagsArray,
          text,
          magnitude: magnitude ? parseFloat(magnitude) : null,
          distance: distance ? parseFloat(distance) : null,
          colorHex
        });
      }
    });
    
    // Batch insert using SQL
    for (const v of values) {
      await sql`
        INSERT INTO driving_forces (
          project_id, title, type, steep, dimension, scope, impact, ttm,
          sentiment, source, tags, text, magnitude, distance, color_hex
        ) VALUES (
          ${v.projectId}, ${v.title}, ${v.type}, ${v.steep}, ${v.dimension},
          ${v.scope}, ${v.impact}, ${v.ttm}, ${v.sentiment}, ${v.source},
          ${v.tags}, ${v.text}, ${v.magnitude}, ${v.distance}, ${v.colorHex}
        )
      `;
    }
    
    imported += values.length;
    process.stdout.write(`\r   Progress: ${imported}/${dataLines.length} forces imported (${Math.round(imported/dataLines.length*100)}%)`);
  }
  
  console.log('\n\n🔍 Verifying import...');
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

fastImport().catch(err => {
  console.error('❌ Import failed:', err);
  process.exit(1);
});
