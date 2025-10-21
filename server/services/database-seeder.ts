import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { db } from '../db.js';
import { drivingForces, projects } from '../../shared/schema.js';
import { eq, sql } from 'drizzle-orm';

interface SeedForce {
  title: string;
  type: string;
  steep?: string;
  dimension?: string;
  scope?: string;
  impact?: number;
  ttm?: string;
  sentiment?: string;
  source?: string;
  tags?: string[];
  text?: string;
  magnitude?: number;
  distance?: number;
  colorHex?: string;
  feasibility?: string;
  urgency?: string;
}

/**
 * Database Seeder Service
 * Automatically populates the default project with driving forces on first startup
 */
export class DatabaseSeeder {
  private seedFilePath: string;

  constructor() {
    this.seedFilePath = join(process.cwd(), 'server/seed-data/driving-forces.json');
  }

  /**
   * Check if seeding is needed and execute if necessary
   */
  async seedIfNeeded(): Promise<void> {
    try {
      console.log('[DatabaseSeeder] Checking if seeding is needed...');

      // Check if seed file exists
      if (!existsSync(this.seedFilePath)) {
        console.log('[DatabaseSeeder] No seed file found, skipping auto-seed');
        return;
      }

      // Read seed file to get expected count
      const seedData = JSON.parse(readFileSync(this.seedFilePath, 'utf-8'));
      const expectedCount = seedData.length;

      // Get or create default project
      const defaultProject = await this.ensureDefaultProject();
      
      // Check if default project has forces
      const [forceCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(drivingForces)
        .where(eq(drivingForces.projectId, defaultProject.id));

      const count = Number(forceCount?.count || 0);
      
      // Check for complete dataset
      if (count === expectedCount) {
        console.log(`[DatabaseSeeder] Default project has complete dataset (${count}/${expectedCount} forces), skipping seed`);
        return;
      }

      // Handle partial dataset (critical bug fix)
      if (count > 0 && count < expectedCount) {
        console.warn(`[DatabaseSeeder] ⚠️  PARTIAL DATASET DETECTED! Found ${count}/${expectedCount} forces`);
        console.warn(`[DatabaseSeeder] This likely means a previous import failed mid-way.`);
        console.warn(`[DatabaseSeeder] Clearing incomplete data and retrying full import...`);
        
        // Clear partial data to ensure clean import
        await db.delete(drivingForces).where(eq(drivingForces.projectId, defaultProject.id));
        console.log('[DatabaseSeeder] Cleared partial data, starting fresh import...');
      } else if (count === 0) {
        console.log('[DatabaseSeeder] Default project is empty, starting seed process...');
      }

      await this.importSeedData(defaultProject.id);
      
    } catch (error) {
      console.error('[DatabaseSeeder] Seeding failed:', error);
      // Don't throw - allow server to start even if seeding fails
      console.error('[DatabaseSeeder] Server will continue with empty database');
    }
  }

  /**
   * Ensure default project exists
   */
  private async ensureDefaultProject() {
    // Find existing default project
    const [existingDefault] = await db
      .select()
      .from(projects)
      .where(eq(projects.isDefault, true))
      .limit(1);

    if (existingDefault) {
      return existingDefault;
    }

    // Create default project
    console.log('[DatabaseSeeder] Creating default project...');
    const [newDefault] = await db
      .insert(projects)
      .values({
        name: 'ORION Global Dataset',
        description: 'Global strategic intelligence database with 29,770+ driving forces',
        isDefault: true,
      })
      .returning();

    return newDefault;
  }

  /**
   * Import seed data from JSON file
   */
  private async importSeedData(projectId: string): Promise<void> {
    console.log(`[DatabaseSeeder] Reading seed file: ${this.seedFilePath}`);
    
    const seedData: SeedForce[] = JSON.parse(
      readFileSync(this.seedFilePath, 'utf-8')
    );

    console.log(`[DatabaseSeeder] Loaded ${seedData.length} forces from seed file`);

    // Prepare forces for insertion (remove undefined values)
    const forcesToInsert = seedData.map(force => {
      const insertData: any = {
        projectId,
        title: force.title,
        type: force.type,
      };

      // Only add optional fields if they have values
      if (force.steep !== undefined) insertData.steep = force.steep;
      if (force.dimension !== undefined) insertData.dimension = force.dimension;
      if (force.scope !== undefined) insertData.scope = force.scope;
      if (force.impact !== undefined) insertData.impact = force.impact;
      if (force.ttm !== undefined) insertData.ttm = force.ttm;
      if (force.sentiment !== undefined) insertData.sentiment = force.sentiment;
      if (force.source !== undefined) insertData.source = force.source;
      if (force.tags !== undefined) insertData.tags = force.tags;
      if (force.text !== undefined) insertData.text = force.text;
      if (force.magnitude !== undefined) insertData.magnitude = force.magnitude;
      if (force.distance !== undefined) insertData.distance = force.distance;
      if (force.colorHex !== undefined) insertData.colorHex = force.colorHex;
      if (force.feasibility !== undefined) insertData.feasibility = force.feasibility;
      if (force.urgency !== undefined) insertData.urgency = force.urgency;

      return insertData;
    });

    // Import in batches to avoid SQL parameter limits
    const batchSize = 500;
    const totalBatches = Math.ceil(forcesToInsert.length / batchSize);
    
    console.log(`[DatabaseSeeder] Importing ${forcesToInsert.length} forces in ${totalBatches} batches...`);

    for (let i = 0; i < totalBatches; i++) {
      const startIndex = i * batchSize;
      const endIndex = Math.min(startIndex + batchSize, forcesToInsert.length);
      const batch = forcesToInsert.slice(startIndex, endIndex);

      await db.insert(drivingForces).values(batch);

      const progress = ((i + 1) / totalBatches * 100).toFixed(1);
      console.log(`[DatabaseSeeder] Progress: ${progress}% (batch ${i + 1}/${totalBatches})`);
    }

    // Verify import completeness
    const [finalCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(drivingForces)
      .where(eq(drivingForces.projectId, projectId));

    const imported = Number(finalCount?.count || 0);
    
    // Critical: verify complete import
    if (imported !== forcesToInsert.length) {
      console.error(`[DatabaseSeeder] ❌ Import verification FAILED! Expected ${forcesToInsert.length} but got ${imported} forces`);
      throw new Error(`Incomplete import: ${imported}/${forcesToInsert.length} forces`);
    }
    
    console.log(`[DatabaseSeeder] ✅ Successfully imported ${imported} driving forces`);

    // Show type distribution
    const typeStats = await db
      .select({
        type: drivingForces.type,
        count: sql<number>`count(*)`,
      })
      .from(drivingForces)
      .where(eq(drivingForces.projectId, projectId))
      .groupBy(drivingForces.type);

    console.log('[DatabaseSeeder] Type distribution:');
    typeStats.forEach(stat => {
      const typeName = {
        'M': 'Megatrends',
        'T': 'Trends',
        'WS': 'Weak Signals',
        'WC': 'Wildcards',
        'S': 'Signals'
      }[stat.type] || stat.type;
      console.log(`  ${typeName}: ${stat.count}`);
    });
  }
}

/**
 * Export singleton instance
 */
export const databaseSeeder = new DatabaseSeeder();
