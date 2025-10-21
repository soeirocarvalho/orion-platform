import { db } from '../server/db.js';
import { drivingForces } from '../shared/schema.js';
import { writeFileSync } from 'fs';
import { join } from 'path';

/**
 * Export all driving forces from the database to a JSON seed file
 * This seed file will be used to auto-populate production databases
 */
async function exportSeedData() {
  console.log('🔄 Exporting driving forces from database...');
  
  try {
    // Query all driving forces from the database
    const forces = await db.select().from(drivingForces);
    
    console.log(`📊 Found ${forces.length} driving forces`);
    
    // Transform data for seeding (remove auto-generated fields)
    const seedData = forces.map(force => ({
      // Core fields
      title: force.title,
      type: force.type,
      steep: force.steep,
      dimension: force.dimension,
      scope: force.scope,
      impact: force.impact,
      ttm: force.ttm,
      sentiment: force.sentiment,
      source: force.source,
      tags: force.tags,
      text: force.text,
      
      // Visualization fields
      magnitude: force.magnitude,
      distance: force.distance,
      colorHex: force.colorHex,
      feasibility: force.feasibility,
      urgency: force.urgency,
      
      // Note: projectId, id, createdAt, updatedAt will be set during import
      // Note: embeddings and clusters will be generated separately if needed
    }));
    
    // Write to seed file
    const outputPath = join(process.cwd(), 'server/seed-data/driving-forces.json');
    writeFileSync(outputPath, JSON.stringify(seedData, null, 2));
    
    console.log(`✅ Successfully exported ${seedData.length} forces to: ${outputPath}`);
    console.log(`📦 File size: ${(Buffer.byteLength(JSON.stringify(seedData)) / 1024 / 1024).toFixed(2)} MB`);
    
    // Show type distribution
    const typeDistribution = seedData.reduce((acc, force) => {
      acc[force.type] = (acc[force.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    console.log('\n📈 Type Distribution:');
    Object.entries(typeDistribution)
      .sort((a, b) => b[1] - a[1])
      .forEach(([type, count]) => {
        const typeName = {
          'M': 'Megatrends',
          'T': 'Trends',
          'WS': 'Weak Signals',
          'WC': 'Wildcards',
          'S': 'Signals'
        }[type] || type;
        console.log(`  ${typeName}: ${count}`);
      });
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Export failed:', error);
    process.exit(1);
  }
}

// Run export
exportSeedData();
