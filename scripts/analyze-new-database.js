import XLSX from 'xlsx';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fullDbPath = join(__dirname, '../attached_assets/ORION_DATABASE_1759309387112.xlsx');
const fullWorkbook = XLSX.readFile(fullDbPath);

console.log('=== NEW ORION DATABASE ANALYSIS ===\n');

let totalForces = 0;
const globalTypeCounts = {};

fullWorkbook.SheetNames.forEach(sheetName => {
  const sheet = fullWorkbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  
  console.log(`\n📊 ${sheetName.toUpperCase()} SHEET:`);
  console.log(`   Total rows: ${data.length}`);
  
  totalForces += data.length;
  
  // Count by type
  const typeCounts = {};
  data.forEach(row => {
    const type = row['Driving Force'] || 'Unknown';
    typeCounts[type] = (typeCounts[type] || 0) + 1;
    globalTypeCounts[type] = (globalTypeCounts[type] || 0) + 1;
  });
  
  console.log('   Type distribution:');
  Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
    console.log(`     - ${type}: ${count}`);
  });
  
  // Sample a few rows to understand structure
  if (data.length > 0) {
    console.log('\n   Sample row structure:');
    const sample = data[0];
    console.log(`     ID: ${sample.ID}`);
    console.log(`     Created: ${sample.Created}`);
    console.log(`     Driving Force (type): ${sample['Driving Force']}`);
    console.log(`     Title: ${sample.Title?.substring(0, 60)}...`);
    console.log(`     Tags: ${sample.Tags?.substring(0, 60)}...`);
    console.log(`     Dimension: ${sample.dimension}`);
    console.log(`     Magnitude: ${sample.magnitude}`);
    console.log(`     Distance: ${sample.distance}`);
  }
});

console.log('\n\n=== TOTAL DATABASE ===');
console.log(`Total forces: ${totalForces}`);
console.log('\nGlobal type distribution:');
Object.entries(globalTypeCounts).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
  const percentage = ((count / totalForces) * 100).toFixed(2);
  console.log(`  🔹 ${type}: ${count} (${percentage}%)`);
});

// Analyze dimensions
console.log('\n\n=== DIMENSION ANALYSIS ===');
fullWorkbook.SheetNames.forEach(sheetName => {
  const sheet = fullWorkbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  
  const dimensionCounts = {};
  data.forEach(row => {
    const dim = row.dimension || 'Unknown';
    dimensionCounts[dim] = (dimensionCounts[dim] || 0) + 1;
  });
  
  console.log(`\n${sheetName} - Top dimensions:`);
  Object.entries(dimensionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([dim, count]) => {
      console.log(`  - ${dim}: ${count}`);
    });
});
