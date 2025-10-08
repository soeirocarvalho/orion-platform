import XLSX from 'xlsx';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read the full database file with two sheets
const fullDbPath = join(__dirname, '../attached_assets/ORION_DATABASE_1759309387112.xlsx');
const curatedPath = join(__dirname, '../attached_assets/ORION_DATABASE_CURATED_1759309387112.xlsx');
const signalsPath = join(__dirname, '../attached_assets/ORION_DATABASE_SIGNALS_1759309387112.xlsx');

console.log('=== FULL DATABASE FILE ===');
const fullWorkbook = XLSX.readFile(fullDbPath);
console.log('Sheet names:', fullWorkbook.SheetNames);

fullWorkbook.SheetNames.forEach(sheetName => {
  const sheet = fullWorkbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  console.log(`\n${sheetName} - Total rows: ${data.length}`);
  
  if (data.length > 0) {
    console.log('Columns:', Object.keys(data[0]));
    console.log('First row sample:', JSON.stringify(data[0], null, 2));
  }
});

console.log('\n\n=== CURATED DATABASE FILE ===');
const curatedWorkbook = XLSX.readFile(curatedPath);
console.log('Sheet names:', curatedWorkbook.SheetNames);
const curatedSheet = curatedWorkbook.Sheets[curatedWorkbook.SheetNames[0]];
const curatedData = XLSX.utils.sheet_to_json(curatedSheet, { defval: '' });
console.log(`Total rows: ${curatedData.length}`);
if (curatedData.length > 0) {
  console.log('Columns:', Object.keys(curatedData[0]));
}

console.log('\n\n=== SIGNALS DATABASE FILE ===');
const signalsWorkbook = XLSX.readFile(signalsPath);
console.log('Sheet names:', signalsWorkbook.SheetNames);
const signalsSheet = signalsWorkbook.Sheets[signalsWorkbook.SheetNames[0]];
const signalsData = XLSX.utils.sheet_to_json(signalsSheet, { defval: '' });
console.log(`Total rows: ${signalsData.length}`);
if (signalsData.length > 0) {
  console.log('Columns:', Object.keys(signalsData[0]));
}

// Count by type in each dataset
console.log('\n\n=== TYPE DISTRIBUTION ===');
fullWorkbook.SheetNames.forEach(sheetName => {
  const sheet = fullWorkbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  const typeCounts = {};
  data.forEach(row => {
    const type = row.type || row.Type || 'Unknown';
    typeCounts[type] = (typeCounts[type] || 0) + 1;
  });
  console.log(`\n${sheetName}:`, typeCounts);
});
