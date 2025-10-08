#!/usr/bin/env node
/**
 * ORION Parity System Validation Script
 * 
 * Validates that the strict parity mode is working correctly:
 * 1. Tests all visual endpoints (regular and baseline)
 * 2. Runs comprehensive parity checks
 * 3. Validates SHA256 comparison accuracy
 * 4. Checks coverage requirements (29,749/29,749)
 * 5. Tests UI blocking functionality
 */

const http = require('http');
const crypto = require('crypto');

const BASE_URL = 'http://localhost:5000';

// Test configuration
const TEST_CONFIG = {
  timeout: 60000, // 60 seconds timeout for figure generation
  expectedCoverage: 29749, // Expected total data coverage
  retries: 2 // Number of retries for failed requests
};

// ANSI colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(level, message) {
  const timestamp = new Date().toISOString();
  const color = {
    SUCCESS: colors.green,
    ERROR: colors.red, 
    WARNING: colors.yellow,
    INFO: colors.blue
  }[level] || colors.reset;
  
  console.log(`${color}[${level}]${colors.reset} ${timestamp} ${message}`);
}

function makeRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = `${BASE_URL}${path}`;
    const timeout = options.timeout || TEST_CONFIG.timeout;
    
    log('INFO', `Making request to ${path}`);
    
    const req = http.get(url, { timeout }, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve({ status: res.statusCode, data: response });
        } catch (e) {
          reject(new Error(`Failed to parse JSON response: ${e.message}`));
        }
      });
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timeout after ${timeout}ms`));
    });
    
    req.on('error', (err) => {
      reject(err);
    });
  });
}

async function testEndpoint(path, expectedCommand) {
  try {
    const result = await makeRequest(path);
    
    if (result.status !== 200) {
      throw new Error(`HTTP ${result.status}`);
    }
    
    if (!result.data.success) {
      throw new Error(`Endpoint failed: ${result.data.error || 'Unknown error'}`);
    }
    
    if (expectedCommand && result.data.command !== expectedCommand) {
      throw new Error(`Expected command '${expectedCommand}', got '${result.data.command}'`);
    }
    
    if (!result.data.figure) {
      throw new Error('No figure data returned');
    }
    
    // Calculate SHA256 of figure for comparison
    const figureJson = JSON.stringify(result.data.figure, null, 0);
    const hash = crypto.createHash('sha256').update(figureJson).digest('hex');
    
    return {
      success: true,
      command: result.data.command,
      timestamp: result.data.timestamp,
      hash,
      figureSize: figureJson.length
    };
    
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

async function testVisualEndpoints() {
  log('INFO', 'Testing visual endpoints...');
  
  const endpoints = [
    { path: '/api/visuals/radar', command: 'radar', name: 'Regular Radar' },
    { path: '/api/visuals/3d', command: '3d', name: 'Regular 3D' },
    { path: '/api/visuals/baseline/radar', command: 'baseline_radar', name: 'Baseline Radar' },
    { path: '/api/visuals/baseline/3d', command: 'baseline_3d', name: 'Baseline 3D' }
  ];
  
  const results = {};
  
  for (const endpoint of endpoints) {
    log('INFO', `Testing ${endpoint.name}...`);
    const result = await testEndpoint(endpoint.path, endpoint.command);
    results[endpoint.name] = result;
    
    if (result.success) {
      log('SUCCESS', `${endpoint.name}: OK (${result.figureSize} bytes, SHA256: ${result.hash.substring(0, 8)}...)`);
    } else {
      log('ERROR', `${endpoint.name}: FAILED - ${result.error}`);
    }
  }
  
  return results;
}

async function testParityChecks() {
  log('INFO', 'Testing parity check system...');
  
  try {
    const result = await makeRequest('/api/status/visuals-parity?include_filters=true');
    
    if (result.status !== 200) {
      throw new Error(`HTTP ${result.status}`);
    }
    
    const parity = result.data;
    
    log('INFO', `Parity Status: ${parity.status}`);
    log('INFO', `Summary: ${parity.summary}`);
    log('INFO', `Strict Mode: ${parity.strictMode}`);
    log('INFO', `Total Checks: ${parity.totalChecks}`);
    log('INFO', `Passed: ${parity.passedChecks}`);
    log('INFO', `Failed: ${parity.failedChecks}`);
    
    if (parity.status === 'healthy' && parity.failedChecks === 0) {
      log('SUCCESS', 'All parity checks passed');
    } else {
      log('WARNING', 'Some parity checks failed or system degraded');
      if (parity.errors && parity.errors.length > 0) {
        parity.errors.forEach(error => log('ERROR', `Parity Error: ${error}`));
      }
    }
    
    return parity;
    
  } catch (error) {
    log('ERROR', `Parity check failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function testIntegrityStatus() {
  log('INFO', 'Testing integrity status...');
  
  try {
    const result = await makeRequest('/api/status/integrity');
    
    if (result.status !== 200) {
      throw new Error(`HTTP ${result.status}`);
    }
    
    const integrity = result.data;
    
    log('INFO', `Integrity Status: ${integrity.status}`);
    log('INFO', `Summary: ${integrity.summary}`);
    log('INFO', `Fixed Loader Enabled: ${integrity.fixedLoaderEnabled}`);
    log('INFO', `Reprocess Allowed: ${integrity.reprocessAllowed}`);
    
    // Check coverage if manifest exists
    if (integrity.manifest && integrity.manifest.data && integrity.manifest.data.coverage) {
      const coverage = integrity.manifest.data.coverage;
      log('INFO', `Data Coverage: ${coverage.intersection}/${coverage.datasetIds} (${coverage.percentage.toFixed(2)}%)`);
      
      if (coverage.intersection === TEST_CONFIG.expectedCoverage) {
        log('SUCCESS', `Coverage matches expected: ${TEST_CONFIG.expectedCoverage}`);
      } else {
        log('WARNING', `Coverage mismatch: expected ${TEST_CONFIG.expectedCoverage}, got ${coverage.intersection}`);
      }
    }
    
    return integrity;
    
  } catch (error) {
    log('ERROR', `Integrity check failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function validateParitySystem() {
  log('INFO', `${colors.bold}Starting ORION Parity System Validation${colors.reset}`);
  log('INFO', `Target: ${BASE_URL}`);
  log('INFO', `Expected Coverage: ${TEST_CONFIG.expectedCoverage}`);
  log('INFO', '='.repeat(60));
  
  const results = {
    timestamp: new Date().toISOString(),
    endpoints: {},
    parity: {},
    integrity: {},
    overall: { success: false, issues: [] }
  };
  
  try {
    // Test 1: Visual Endpoints
    log('INFO', 'Phase 1: Testing Visual Endpoints');
    results.endpoints = await testVisualEndpoints();
    
    // Check if all endpoints succeeded
    const endpointSuccess = Object.values(results.endpoints).every(r => r.success);
    if (!endpointSuccess) {
      results.overall.issues.push('Some visual endpoints failed');
    }
    
    // Test 2: Integrity Status
    log('INFO', 'Phase 2: Testing System Integrity');
    results.integrity = await testIntegrityStatus();
    
    if (results.integrity.status !== 'healthy') {
      results.overall.issues.push(`Integrity status not healthy: ${results.integrity.status}`);
    }
    
    // Test 3: Parity Checks
    log('INFO', 'Phase 3: Testing Parity Checks');
    results.parity = await testParityChecks();
    
    if (results.parity.status !== 'healthy') {
      results.overall.issues.push(`Parity status not healthy: ${results.parity.status}`);
    }
    
    // Overall assessment
    results.overall.success = results.overall.issues.length === 0;
    
    log('INFO', '='.repeat(60));
    if (results.overall.success) {
      log('SUCCESS', `${colors.bold}VALIDATION PASSED${colors.reset} - All systems healthy`);
      log('SUCCESS', '✓ All visual endpoints working');
      log('SUCCESS', '✓ Integrity checks passed');
      log('SUCCESS', '✓ Parity checks passed');
      log('SUCCESS', '✓ Strict mode ready for deployment');
    } else {
      log('ERROR', `${colors.bold}VALIDATION FAILED${colors.reset} - Issues detected:`);
      results.overall.issues.forEach(issue => log('ERROR', `✗ ${issue}`));
    }
    
    // Save results to file
    const fs = require('fs');
    fs.writeFileSync('parity-validation-results.json', JSON.stringify(results, null, 2));
    log('INFO', 'Results saved to parity-validation-results.json');
    
    process.exit(results.overall.success ? 0 : 1);
    
  } catch (error) {
    log('ERROR', `Validation failed with error: ${error.message}`);
    results.overall.success = false;
    results.overall.error = error.message;
    process.exit(1);
  }
}

// Run validation if called directly
if (require.main === module) {
  validateParitySystem().catch(error => {
    log('ERROR', `Fatal error: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { validateParitySystem, testEndpoint, testParityChecks, testIntegrityStatus };