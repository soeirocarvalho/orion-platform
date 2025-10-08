/**
 * ORION FixedClusters Patch - Integrity Validation Service
 * 
 * TypeScript equivalent of backend/orion/integrity.py
 * Implements comprehensive integrity validation and manifest generation
 * 
 * Key Features:
 * - SHA256 file hashing for integrity verification
 * - Data column validation
 * - Coverage calculation between ID sets
 * - Manifest file generation and validation
 * - Strict mode integrity checking
 * - Integration with fixed-data-loader service
 * 
 * Environment Variables:
 * - STRICT_FEATURES: Enable strict validation mode (default: true)
 * - APP_VERSION: Application version for manifest (fallback to git hash)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { execSync } from 'child_process';
import { join } from 'path';
import { 
  getFilePaths, 
  getIntegrityStatus as getFixedLoaderStatus, 
  isFixedLoaderEnabled,
  StartupIntegrityError
} from './fixed-data-loader.js';

// Types for integrity validation
export interface FileIntegrity {
  path: string;
  exists: boolean;
  size?: number;
  sha256?: string;
  readable?: boolean;
  error?: string;
}

export interface DataIntegrity {
  dataset: {
    loaded: boolean;
    rows?: number;
    hasId?: boolean;
    columns?: string[];
  };
  features: {
    loaded: boolean;
    entries?: number;
    requiredColumns?: string[];
    optionalColumns?: string[];
  };
  coverage?: {
    datasetIds: number;
    featuresIds: number;
    intersection: number;
    percentage: number;
  };
}

export interface IntegrityManifest {
  version: string;
  timestamp: string;
  environment: {
    strictFeatures: boolean;
    allowReprocess: boolean;
    featuresFile: string;
    datasetFile: string;
  };
  files: FileIntegrity[];
  data: DataIntegrity;
  validation: {
    passed: boolean;
    errors: string[];
    warnings: string[];
  };
  checksum?: string; // Overall manifest checksum
}

/**
 * Calculate SHA256 hash of a file
 */
function calculateFileHash(filePath: string): FileIntegrity {
  const integrity: FileIntegrity = {
    path: filePath,
    exists: existsSync(filePath)
  };
  
  if (!integrity.exists) {
    integrity.error = 'File does not exist';
    return integrity;
  }
  
  try {
    const buffer = readFileSync(filePath);
    integrity.size = buffer.length;
    integrity.sha256 = createHash('sha256').update(buffer).digest('hex');
    integrity.readable = true;
  } catch (error) {
    integrity.readable = false;
    integrity.error = error instanceof Error ? error.message : 'Unknown error';
  }
  
  return integrity;
}

/**
 * Get application version from environment or git
 */
function getAppVersion(): string {
  if (process.env.APP_VERSION) {
    return process.env.APP_VERSION;
  }
  
  try {
    // Try to get git hash
    const gitHash = execSync('git rev-parse --short HEAD', { 
      encoding: 'utf8',
      cwd: process.cwd()
    }).trim();
    return `git-${gitHash}`;
  } catch {
    // Fallback to package.json version or unknown
    try {
      const packageJson = JSON.parse(readFileSync('package.json', 'utf-8'));
      return `pkg-${packageJson.version || 'unknown'}`;
    } catch {
      return 'unknown';
    }
  }
}

/**
 * Generate comprehensive integrity manifest
 */
export async function generateIntegrityManifest(): Promise<IntegrityManifest> {
  console.log('🔍 Generating integrity manifest...');
  
  const { datasetFile, featuresFile, strictMode } = getFilePaths();
  const allowReprocess = (process.env.ALLOW_REPROCESS || 'false').toLowerCase() === 'true';
  
  // File integrity checks
  const files: FileIntegrity[] = [
    calculateFileHash(datasetFile),
    calculateFileHash(featuresFile)
  ];
  
  // Data integrity from fixed loader
  const fixedLoaderStatus = await getFixedLoaderStatus();
  
  const dataIntegrity: DataIntegrity = {
    dataset: {
      loaded: fixedLoaderStatus.dataset.loaded,
      rows: fixedLoaderStatus.dataset.rows,
      hasId: true // Assume true since we derive IDs
    },
    features: {
      loaded: fixedLoaderStatus.features.loaded,
      entries: fixedLoaderStatus.features.entries,
      requiredColumns: ['id', 'cluster_labels', 'cluster_titles', 'umap2d_x', 'umap2d_y'],
      optionalColumns: fixedLoaderStatus.features.columns
    }
  };
  
  // Calculate coverage if both loaded
  if (fixedLoaderStatus.dataset.loaded && fixedLoaderStatus.features.loaded && fixedLoaderStatus.merged.coverage !== undefined) {
    const datasetRows = fixedLoaderStatus.dataset.rows || 0;
    const featuresEntries = fixedLoaderStatus.features.entries || 0;
    const intersectionCount = Math.round((fixedLoaderStatus.merged.coverage || 0) * datasetRows);
    
    dataIntegrity.coverage = {
      datasetIds: datasetRows,
      featuresIds: featuresEntries,
      intersection: intersectionCount,
      percentage: fixedLoaderStatus.merged.coverage || 0
    };
  }
  
  // Validation results
  const validation = {
    passed: fixedLoaderStatus.valid,
    errors: [...fixedLoaderStatus.errors],
    warnings: [] as string[]
  };
  
  // Add file-specific errors
  files.forEach(file => {
    if (!file.exists) {
      validation.errors.push(`Missing file: ${file.path}`);
    } else if (!file.readable) {
      validation.errors.push(`Unreadable file: ${file.path} - ${file.error}`);
    }
  });
  
  // Add coverage warnings
  if (dataIntegrity.coverage && dataIntegrity.coverage.percentage < 0.9) {
    validation.warnings.push(
      `Low dataset-features coverage: ${(dataIntegrity.coverage.percentage * 100).toFixed(1)}%`
    );
  }
  
  // Strict mode validation
  if (strictMode && validation.errors.length > 0) {
    validation.passed = false;
  }
  
  const manifest: IntegrityManifest = {
    version: getAppVersion(),
    timestamp: new Date().toISOString(),
    environment: {
      strictFeatures: strictMode,
      allowReprocess: allowReprocess,
      featuresFile,
      datasetFile
    },
    files,
    data: dataIntegrity,
    validation,
    checksum: '' // Will be calculated after
  };
  
  // Calculate manifest checksum (exclude the checksum field itself)
  const { checksum, ...manifestForChecksum } = manifest;
  manifest.checksum = createHash('sha256')
    .update(JSON.stringify(manifestForChecksum, null, 2))
    .digest('hex');
  
  return manifest;
}

/**
 * Validate manifest against current state
 */
export async function validateManifest(manifest: IntegrityManifest): Promise<{
  valid: boolean;
  errors: string[];
  warnings: string[];
}> {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Validate manifest checksum
  const { checksum, ...manifestForChecksum } = manifest;
  const expectedChecksum = createHash('sha256')
    .update(JSON.stringify(manifestForChecksum, null, 2))
    .digest('hex');
  
  if (manifest.checksum !== expectedChecksum) {
    errors.push('Manifest checksum validation failed - manifest may be corrupted');
  }
  
  // Validate file hashes
  for (const fileInfo of manifest.files) {
    if (fileInfo.exists && fileInfo.sha256) {
      const currentIntegrity = calculateFileHash(fileInfo.path);
      
      if (!currentIntegrity.exists) {
        errors.push(`File no longer exists: ${fileInfo.path}`);
      } else if (currentIntegrity.sha256 !== fileInfo.sha256) {
        errors.push(`File hash mismatch: ${fileInfo.path} (expected: ${fileInfo.sha256}, actual: ${currentIntegrity.sha256})`);
      }
    }
  }
  
  // Validate environment consistency
  const { strictMode, datasetFile, featuresFile } = getFilePaths();
  if (manifest.environment.strictFeatures !== strictMode) {
    warnings.push(`STRICT_FEATURES setting changed: manifest=${manifest.environment.strictFeatures}, current=${strictMode}`);
  }
  
  if (manifest.environment.datasetFile !== datasetFile) {
    warnings.push(`DATASET_FILE setting changed: manifest=${manifest.environment.datasetFile}, current=${datasetFile}`);
  }
  
  if (manifest.environment.featuresFile !== featuresFile) {
    warnings.push(`FEATURES_FILE setting changed: manifest=${manifest.environment.featuresFile}, current=${featuresFile}`);
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Save manifest to file
 */
export function saveManifest(manifest: IntegrityManifest, filePath?: string): string {
  const manifestPath = filePath || join(process.cwd(), 'integrity-manifest.json');
  
  try {
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`📄 Integrity manifest saved: ${manifestPath}`);
    return manifestPath;
  } catch (error) {
    throw new Error(`Failed to save manifest: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Load manifest from file
 */
export function loadManifest(filePath?: string): IntegrityManifest {
  const manifestPath = filePath || join(process.cwd(), 'integrity-manifest.json');
  
  if (!existsSync(manifestPath)) {
    throw new Error(`Manifest file not found: ${manifestPath}`);
  }
  
  try {
    const data = readFileSync(manifestPath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    throw new Error(`Failed to load manifest: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Perform comprehensive integrity check
 */
export async function performIntegrityCheck(): Promise<{
  status: 'healthy' | 'degraded' | 'critical';
  manifest: IntegrityManifest;
  summary: string;
}> {
  console.log('🔍 Performing comprehensive integrity check...');
  
  if (!isFixedLoaderEnabled()) {
    return {
      status: 'healthy',
      manifest: {} as IntegrityManifest,
      summary: 'Fixed loader not enabled - using standard data loading'
    };
  }
  
  try {
    const manifest = await generateIntegrityManifest();
    
    let status: 'healthy' | 'degraded' | 'critical';
    let summary: string;
    
    if (!manifest.validation.passed) {
      status = 'critical';
      summary = `Critical integrity failures: ${manifest.validation.errors.length} errors`;
    } else if (manifest.validation.warnings.length > 0) {
      status = 'degraded';
      summary = `Integrity check passed with ${manifest.validation.warnings.length} warnings`;
    } else {
      status = 'healthy';
      summary = 'All integrity checks passed';
    }
    
    console.log(`✅ Integrity check complete: ${status.toUpperCase()} - ${summary}`);
    
    return { status, manifest, summary };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Integrity check failed: ${errorMessage}`);
    
    return {
      status: 'critical',
      manifest: {} as IntegrityManifest,
      summary: `Integrity check failed: ${errorMessage}`
    };
  }
}

/**
 * Startup integrity validation for strict mode
 */
export async function validateStartupIntegrity(): Promise<void> {
  if (!isFixedLoaderEnabled()) {
    return; // Skip if not using fixed loader
  }
  
  const { strictMode } = getFilePaths();
  if (!strictMode) {
    return; // Skip if not in strict mode
  }
  
  console.log('🔒 Running startup integrity validation in strict mode...');
  
  const integrityCheck = await performIntegrityCheck();
  
  if (integrityCheck.status === 'critical') {
    throw new StartupIntegrityError(
      `Startup integrity validation failed in strict mode: ${integrityCheck.summary}`
    );
  }
  
  if (integrityCheck.status === 'degraded') {
    console.warn(`⚠️  Startup integrity validation passed with warnings: ${integrityCheck.summary}`);
  } else {
    console.log('✅ Startup integrity validation passed');
  }
}

/**
 * Check if reprocessing is allowed
 */
export function isReprocessAllowed(): boolean {
  const allowReprocess = (process.env.ALLOW_REPROCESS || 'false').toLowerCase() === 'true';
  const { strictMode } = getFilePaths();
  
  // In strict mode, reprocessing is only allowed if explicitly enabled
  if (strictMode && !allowReprocess) {
    return false;
  }
  
  return allowReprocess;
}

/**
 * Get reprocess blocking reason
 */
export function getReprocessBlockingReason(): string | null {
  if (isReprocessAllowed()) {
    return null;
  }
  
  const { strictMode } = getFilePaths();
  const allowReprocess = (process.env.ALLOW_REPROCESS || 'false').toLowerCase() === 'true';
  
  if (strictMode && !allowReprocess) {
    return 'Reprocessing blocked: STRICT_FEATURES=true and ALLOW_REPROCESS=false. This preserves data integrity by preventing modification of validated clustering results.';
  }
  
  return 'Reprocessing blocked: ALLOW_REPROCESS=false';
}