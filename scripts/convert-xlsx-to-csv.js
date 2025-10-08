import XLSX from 'xlsx';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Map XLSX columns to database schema and output CSV
function convertXLSXtoCSV() {
  const fullDbPath = join(__dirname, '../attached_assets/ORION_DATABASE_1759309387112.xlsx');
  const workbook = XLSX.readFile(fullDbPath);
  
  const allForces = [];
  
  // Process Curated sheet
  const curatedSheet = workbook.Sheets['Curated'];
  const curatedData = XLSX.utils.sheet_to_json(curatedSheet, { defval: '' });
  
  console.log(`Processing ${curatedData.length} curated forces...`);
  
  curatedData.forEach(row => {
    const tags = row.Tags ? row.Tags.split(';').map(t => t.trim()).filter(Boolean) : [];
    
    const typeMapping = {
      'Megatrends': 'M',
      'Trends': 'T',
      'Weak Signals': 'WS',
      'Wildcards': 'WC',
      'Signals': 'S'
    };
    
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
    
    const type = typeMapping[row['Driving Force']] || 'S';
    const steep = dimensionToSteep[row.dimension] || 'Technological';
    
    allForces.push({
      title: row.Title || '',
      type,
      steep,
      dimension: row.dimension || '',
      scope: 'curated',
      impact: row.magnitude || '',
      ttm: row['Time to Market'] || '',
      sentiment: 'Neutral',
      source: row.Source || '',
      tags: tags.join(','),
      text: row.Description || '',
      magnitude: row.magnitude || '',
      distance: row.distance || '',
      color_hex: row.color_hex || ''
    });
  });
  
  // Process Signals sheet
  const signalsSheet = workbook.Sheets['Signals'];
  const signalsData = XLSX.utils.sheet_to_json(signalsSheet, { defval: '' });
  
  console.log(`Processing ${signalsData.length} signals forces...`);
  
  signalsData.forEach(row => {
    const tags = row.Tags ? row.Tags.split(';').map(t => t.trim()).filter(Boolean) : [];
    
    allForces.push({
      title: row.Title || '',
      type: 'S',
      steep: 'Technological',
      dimension: row.dimension || 'Digital & AI',
      scope: 'signals',
      impact: row.magnitude || '',
      ttm: row['Time to Market'] || '',
      sentiment: 'Neutral',
      source: row.Source || '',
      tags: tags.join(','),
      text: row.Description || '',
      magnitude: row.magnitude || '',
      distance: row.distance || '',
      color_hex: row.color_hex || ''
    });
  });
  
  // Write to CSV
  const csvPath = join(__dirname, '../orion_forces_import.csv');
  const headers = 'title,type,steep,dimension,scope,impact,ttm,sentiment,source,tags,text,magnitude,distance,color_hex\n';
  
  let csvContent = headers;
  
  allForces.forEach(force => {
    // Escape quotes and handle special characters for CSV
    const escapeCsvField = (field) => {
      if (field === null || field === undefined || field === '') return '';
      const str = String(field);
      if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    
    const row = [
      escapeCsvField(force.title),
      escapeCsvField(force.type),
      escapeCsvField(force.steep),
      escapeCsvField(force.dimension),
      escapeCsvField(force.scope),
      escapeCsvField(force.impact),
      escapeCsvField(force.ttm),
      escapeCsvField(force.sentiment),
      escapeCsvField(force.source),
      escapeCsvField(force.tags),
      escapeCsvField(force.text),
      escapeCsvField(force.magnitude),
      escapeCsvField(force.distance),
      escapeCsvField(force.color_hex)
    ].join(',');
    
    csvContent += row + '\n';
  });
  
  fs.writeFileSync(csvPath, csvContent, 'utf8');
  
  console.log(`\n✅ CSV file created: ${csvPath}`);
  console.log(`   Total forces: ${allForces.length}`);
  console.log(`   - Curated: ${curatedData.length}`);
  console.log(`   - Signals: ${signalsData.length}`);
}

convertXLSXtoCSV();
