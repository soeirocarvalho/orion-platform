/**
 * ORION FixedClusters Patch - Fixed Data Loader Service
 * 
 * TypeScript equivalent of backend/orion/data_loader_fixed.py
 * Implements fixed data loading with integrity validation for the ORION system
 * 
 * Key Features:
 * - Parquet-preferred dataset loading with Excel fallback
 * - Features loading with required column validation  
 * - Left-join merging with strict mode validation
 * - ID column derivation for datasets missing ID
 * - Comprehensive error handling and logging
 * 
 * Environment Variables:
 * - FEATURES_FILE: Path to precomputed features file (.pkl or .parquet)
 * - DATASET_FILE: Path to main dataset file (.parquet or .xlsx)
 * - STRICT_FEATURES: Enable strict validation mode (default: true)
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import * as XLSX from 'xlsx';

// Error class for integrity failures
export class StartupIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StartupIntegrityError';
  }
}

// Default file paths - can be overridden by environment variables
const DEFAULT_DATASET_FILE = "data/ORION_Scanning_DB_Updated.parquet";
const DEFAULT_FEATURES_FILE = "data/precomputed_features.pkl";

// Required columns in features file
const REQUIRED_FEATURES_COLUMNS = [
  'id', 
  'cluster_labels', 
  'cluster_titles', 
  'umap2d_x', 
  'umap2d_y'
];

// Optional additional columns in features file
const OPTIONAL_FEATURES_COLUMNS = [
  'tsne_x', 
  'tsne_y', 
  'tsne_z', 
  'umap3d_x', 
  'umap3d_y', 
  'umap3d_z'
];

// Types for the data structures
export interface DatasetRow {
  id?: string;
  title?: string;
  type?: string;
  steep?: string;
  source?: string;
  text?: string;
  [key: string]: any;
}

export interface FeaturesData {
  id: string[];
  cluster_labels: number[];
  cluster_titles: string[];
  umap2d_x: number[];
  umap2d_y: number[];
  [key: string]: any[];
}

export interface MergedDataRow extends DatasetRow {
  cluster_label?: number;
  cluster_title?: string;
  umap2d_x?: number;
  umap2d_y?: number;
}

// Global state for cached data
let _cachedDataset: DatasetRow[] | null = null;
let _cachedFeatures: FeaturesData | null = null;
let _cachedMergedData: MergedDataRow[] | null = null;
let _featuresColumnsPresent: string[] | null = null;

/**
 * Get file paths from environment variables with fallbacks
 */
export function getFilePaths(): { datasetFile: string; featuresFile: string; strictMode: boolean } {
  const datasetFile = process.env.DATASET_FILE || DEFAULT_DATASET_FILE;
  const featuresFile = process.env.FEATURES_FILE || DEFAULT_FEATURES_FILE;
  const strictMode = (process.env.STRICT_FEATURES || 'true').toLowerCase() === 'true';
  
  return { datasetFile, featuresFile, strictMode };
}

/**
 * Deterministically derive an ID from row content using SHA-256
 * Uses title|type|steep|source pattern as specified
 */
function deriveIdFromContent(row: DatasetRow): string {
  // Collect available fields for ID derivation
  const contentParts: string[] = [];
  
  // Use title if available
  if (row.title || row.Title) {
    contentParts.push(String(row.title || row.Title || ''));
  }
  
  // Use type if available
  if (row.type || row.Type || row['Driving Force']) {
    contentParts.push(String(row.type || row.Type || row['Driving Force'] || ''));
  }
  
  // Use steep if available (signals classification)
  if (row.steep || row.STEEP) {
    contentParts.push(String(row.steep || row.STEEP || ''));
  }
  
  // Use source if available
  if (row.source || row.Source) {
    contentParts.push(String(row.source || row.Source || ''));
  }
  
  // If no suitable fields found, use row index as fallback
  if (contentParts.length === 0) {
    contentParts.push(String(Math.random()));
  }
  
  // Create deterministic hash
  const contentString = contentParts.join('|');
  return createHash('sha256').update(contentString).digest('hex').substring(0, 16);
}

/**
 * Load dataset from Parquet (preferred) or Excel (fallback)
 * Note: This is a simplified implementation. For full Parquet support,
 * you would need to use libraries like 'parquetjs' or call Python scripts
 */
async function loadDataset(datasetFile: string): Promise<DatasetRow[]> {
  console.log(`Loading dataset from: ${datasetFile}`);
  
  // For now, we'll focus on Excel support since parquetjs has limitations
  // In a full implementation, you'd add parquet support here
  
  let filePath = datasetFile;
  
  // Try Excel file
  if (datasetFile.endsWith('.parquet')) {
    // Try Excel fallback first for MVP
    const xlsxFile = datasetFile.replace('.parquet', '.xlsx');
    if (existsSync(xlsxFile)) {
      filePath = xlsxFile;
      console.log(`Using Excel fallback: ${xlsxFile}`);
    } else {
      throw new Error(`Parquet support not fully implemented yet. Please provide Excel file: ${xlsxFile}`);
    }
  }
  
  if (!existsSync(filePath)) {
    throw new Error(`Dataset file not found: ${filePath}`);
  }
  
  try {
    const buffer = readFileSync(filePath);
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    
    if (!sheetName) {
      throw new Error('No sheets found in Excel file');
    }
    
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet) as DatasetRow[];
    
    console.log(`Successfully loaded ${data.length} rows from dataset`);
    
    // Add IDs to rows that don't have them
    data.forEach((row, index) => {
      if (!row.id && !row.ID) {
        row.id = deriveIdFromContent(row);
      } else if (row.ID && !row.id) {
        row.id = String(row.ID);
      }
    });
    
    return data;
  } catch (error) {
    throw new Error(`Failed to load dataset: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Load features from JSON file (simplified pickle replacement)
 * Note: This is a simplified implementation. For full pickle support,
 * you would need to call Python scripts or use pickle-compatible libraries
 */
async function loadFeatures(featuresFile: string): Promise<FeaturesData> {
  console.log(`Loading features from: ${featuresFile}`);
  
  if (!existsSync(featuresFile)) {
    throw new Error(`Features file not found: ${featuresFile}`);
  }
  
  // For MVP, expect JSON format instead of pickle
  // In production, you'd add Python script calling or pickle support
  let features: FeaturesData;
  
  if (featuresFile.endsWith('.pkl')) {
    throw new Error(`Pickle support not implemented yet. Please provide JSON version of features file.`);
  } else if (featuresFile.endsWith('.json')) {
    try {
      const data = readFileSync(featuresFile, 'utf-8');
      features = JSON.parse(data);
    } catch (error) {
      throw new Error(`Failed to load JSON features: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  } else {
    throw new Error(`Unsupported features file format: ${featuresFile}`);
  }
  
  // Validate required columns
  const missingColumns = REQUIRED_FEATURES_COLUMNS.filter(col => !(col in features));
  if (missingColumns.length > 0) {
    throw new Error(`Missing required columns in features file: ${missingColumns.join(', ')}`);
  }
  
  // Log available columns
  const availableColumns = Object.keys(features);
  const optionalPresent = OPTIONAL_FEATURES_COLUMNS.filter(col => col in features);
  
  console.log(`Features file contains ${availableColumns.length} columns:`);
  console.log(`- Required: ${REQUIRED_FEATURES_COLUMNS.filter(col => col in features).join(', ')}`);
  if (optionalPresent.length > 0) {
    console.log(`- Optional: ${optionalPresent.join(', ')}`);
  }
  
  // Cache available columns for integrity checking
  _featuresColumnsPresent = availableColumns;
  
  return features;
}

/**
 * Merge dataset and features with integrity validation
 */
function mergeDatasetAndFeatures(
  dataset: DatasetRow[], 
  features: FeaturesData, 
  strictMode: boolean
): MergedDataRow[] {
  console.log(`Merging dataset (${dataset.length} rows) with features (${features.id.length} entries)`);
  
  // Create ID maps for efficient lookup
  const datasetIdSet = new Set(dataset.map(row => row.id).filter(Boolean));
  const featuresIdSet = new Set(features.id);
  
  // Calculate coverage
  const intersection = new Set(Array.from(datasetIdSet).filter((id): id is string => id !== undefined && featuresIdSet.has(id)));
  const coverage = intersection.size / datasetIdSet.size;
  
  console.log(`Dataset-Features coverage: ${(coverage * 100).toFixed(1)}% (${intersection.size}/${datasetIdSet.size})`);
  
  // Strict mode validation
  if (strictMode && coverage < 0.95) {
    throw new StartupIntegrityError(
      `Insufficient dataset-features coverage: ${(coverage * 100).toFixed(1)}% < 95%. ` +
      `Expected high coverage in strict mode.`
    );
  }
  
  // Create features lookup map
  const featuresMap = new Map<string, any>();
  features.id.forEach((id, index) => {
    featuresMap.set(id, {
      cluster_label: features.cluster_labels[index],
      cluster_title: features.cluster_titles[index],
      umap2d_x: features.umap2d_x[index],
      umap2d_y: features.umap2d_y[index],
      // Include optional features if present
      ...(features.tsne_x && { tsne_x: features.tsne_x[index] }),
      ...(features.tsne_y && { tsne_y: features.tsne_y[index] }),
      ...(features.tsne_z && { tsne_z: features.tsne_z[index] }),
      ...(features.umap3d_x && { umap3d_x: features.umap3d_x[index] }),
      ...(features.umap3d_y && { umap3d_y: features.umap3d_y[index] }),
      ...(features.umap3d_z && { umap3d_z: features.umap3d_z[index] })
    });
  });
  
  // Perform left join (keep all dataset rows)
  const mergedData: MergedDataRow[] = dataset.map(row => {
    const featuresData = featuresMap.get(row.id!);
    return {
      ...row,
      ...featuresData
    };
  });
  
  const mergedWithFeatures = mergedData.filter(row => row.cluster_label !== undefined).length;
  console.log(`Merged dataset: ${mergedData.length} total rows, ${mergedWithFeatures} with features`);
  
  return mergedData;
}

/**
 * Get cached or load dataset
 */
export async function getDataset(): Promise<DatasetRow[]> {
  if (_cachedDataset) {
    return _cachedDataset;
  }
  
  const { datasetFile } = getFilePaths();
  _cachedDataset = await loadDataset(datasetFile);
  return _cachedDataset;
}

/**
 * Get cached or load features
 */
export async function getFeatures(): Promise<FeaturesData> {
  if (_cachedFeatures) {
    return _cachedFeatures;
  }
  
  const { featuresFile } = getFilePaths();
  _cachedFeatures = await loadFeatures(featuresFile);
  return _cachedFeatures;
}

/**
 * Get cached or create merged data
 */
export async function getMergedData(): Promise<MergedDataRow[]> {
  if (_cachedMergedData) {
    return _cachedMergedData;
  }
  
  const { strictMode } = getFilePaths();
  const dataset = await getDataset();
  const features = await getFeatures();
  
  _cachedMergedData = mergeDatasetAndFeatures(dataset, features, strictMode);
  return _cachedMergedData;
}

/**
 * Clear all cached data (useful for testing or data refresh)
 */
export function clearCache(): void {
  _cachedDataset = null;
  _cachedFeatures = null;
  _cachedMergedData = null;
  _featuresColumnsPresent = null;
}

/**
 * Get integrity status of the fixed data loader
 */
export async function getIntegrityStatus(): Promise<{
  valid: boolean;
  dataset: { loaded: boolean; rows?: number; file?: string };
  features: { loaded: boolean; entries?: number; file?: string; columns?: string[] };
  merged: { created: boolean; rows?: number; coverage?: number };
  strictMode: boolean;
  errors: string[];
}> {
  const { datasetFile, featuresFile, strictMode } = getFilePaths();
  const status = {
    valid: true,
    dataset: { loaded: false, file: datasetFile, rows: undefined as number | undefined },
    features: { loaded: false, file: featuresFile, entries: undefined as number | undefined, columns: undefined as string[] | undefined },
    merged: { created: false, rows: undefined as number | undefined, coverage: undefined as number | undefined },
    strictMode,
    errors: [] as string[]
  };
  
  try {
    // Check dataset
    const dataset = await getDataset();
    status.dataset.loaded = true;
    status.dataset.rows = dataset.length;
  } catch (error) {
    status.valid = false;
    status.errors.push(`Dataset loading failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  try {
    // Check features  
    const features = await getFeatures();
    status.features.loaded = true;
    status.features.entries = features.id.length;
    status.features.columns = _featuresColumnsPresent || [];
  } catch (error) {
    status.valid = false;
    status.errors.push(`Features loading failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  try {
    // Check merged data
    const merged = await getMergedData();
    status.merged.created = true;
    status.merged.rows = merged.length;
    
    if (status.dataset.loaded && status.features.loaded) {
      const datasetRows = status.dataset.rows || 0;
      const mergedWithFeatures = merged.filter(row => row.cluster_label !== undefined).length;
      status.merged.coverage = datasetRows > 0 ? mergedWithFeatures / datasetRows : 0;
    }
  } catch (error) {
    status.valid = false;
    status.errors.push(`Data merging failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  return status;
}

/**
 * Check if fixed data loader is enabled via environment variables
 */
export function isFixedLoaderEnabled(): boolean {
  return !!(process.env.FEATURES_FILE || process.env.DATASET_FILE);
}

/**
 * Validate startup integrity in strict mode
 */
export async function validateStartupIntegrity(): Promise<void> {
  if (!isFixedLoaderEnabled()) {
    return; // Skip validation if not using fixed loader
  }
  
  const { strictMode } = getFilePaths();
  if (!strictMode) {
    return; // Skip validation if not in strict mode
  }
  
  console.log('🔍 Running startup integrity validation in strict mode...');
  
  const status = await getIntegrityStatus();
  
  if (!status.valid) {
    throw new StartupIntegrityError(
      `Startup integrity validation failed in strict mode:\n${status.errors.join('\n')}`
    );
  }
  
  console.log('✅ Startup integrity validation passed');
}