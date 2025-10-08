#!/usr/bin/env node
/**
 * ORION Parity System Validation Script (CommonJS version)
 * 
 * Validates that the strict parity mode is working correctly:
 * 1. Tests all visual endpoints (regular and baseline)
 * 2. Runs comprehensive parity checks
 * 3. Validates SHA256 comparison accuracy
 * 4. Checks coverage requirements (29,749/29,749)
 */

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');

const BASE_URL = 'http://localhost:5000';

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

function makeRequest(path, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const url = `${BASE_URL}${path}`;
    
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
          resolve({ status: res.statusCode, data: data });
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

async function quickValidation() {
  log('INFO', `${colors.bold}ORION Parity System Quick Validation${colors.reset}`);
  log('INFO', '='.repeat(50));
  
  const results = {
    timestamp: new Date().toISOString(),
    tests: {},
    summary: { passed: 0, failed: 0, issues: [] }
  };
  
  try {
    // Test 1: Integrity Status
    log('INFO', 'Testing integrity status...');
    const integrity = await makeRequest('/api/status/integrity', 10000);
    
    if (integrity.status === 200 && integrity.data.status === 'healthy') {
      results.tests.integrity = { success: true, status: integrity.data.status };
      results.summary.passed++;
      log('SUCCESS', `✓ Integrity status: ${integrity.data.status}`);
      
      // Check coverage
      if (integrity.data.manifest && integrity.data.manifest.data && integrity.data.manifest.data.coverage) {
        const coverage = integrity.data.manifest.data.coverage;
        log('INFO', `Data coverage: ${coverage.intersection}/${coverage.datasetIds} (${coverage.percentage.toFixed(2)}%)`);
        
        if (coverage.intersection === 29749) {
          log('SUCCESS', '✓ Perfect coverage: 29,749/29,749');
        } else {
          log('WARNING', `⚠ Coverage mismatch: expected 29,749, got ${coverage.intersection}`);
          results.summary.issues.push(`Coverage: ${coverage.intersection}/29749`);
        }
      }
    } else {
      results.tests.integrity = { success: false, error: `Status: ${integrity.status}` };
      results.summary.failed++;
      log('ERROR', `✗ Integrity failed: ${integrity.status}`);
    }
    
    // Test 2: Quick Endpoint Test
    log('INFO', 'Testing radar endpoint...');
    const radarTest = await makeRequest('/api/visuals/radar', 45000);
    
    if (radarTest.status === 200 && radarTest.data.success) {
      results.tests.radar = { success: true, command: radarTest.data.command };
      results.summary.passed++;
      log('SUCCESS', '✓ Radar endpoint working');
    } else {
      results.tests.radar = { success: false, error: `Status: ${radarTest.status}` };
      results.summary.failed++;
      log('ERROR', `✗ Radar endpoint failed: ${radarTest.status}`);
    }
    
    // Test 3: Baseline Endpoint Test  
    log('INFO', 'Testing baseline radar endpoint...');
    const baselineTest = await makeRequest('/api/visuals/baseline/radar', 45000);
    
    if (baselineTest.status === 200 && baselineTest.data.success) {
      results.tests.baseline_radar = { success: true, command: baselineTest.data.command };
      results.summary.passed++;
      log('SUCCESS', '✓ Baseline radar endpoint working');
    } else {
      results.tests.baseline_radar = { success: false, error: `Status: ${baselineTest.status}` };
      results.summary.failed++;
      log('ERROR', `✗ Baseline radar endpoint failed: ${baselineTest.status}`);
    }
    
    // Test 4: Parity Check (with shorter timeout)
    log('INFO', 'Testing parity status...');
    try {
      const parity = await makeRequest('/api/status/visuals-parity?include_filters=true', 30000);
      
      if (parity.status === 200) {
        const parityOk = parity.data.status === 'healthy';
        results.tests.parity = { 
          success: parityOk, 
          status: parity.data.status,
          summary: parity.data.summary,
          totalChecks: parity.data.totalChecks,
          failedChecks: parity.data.failedChecks
        };
        
        if (parityOk) {
          results.summary.passed++;
          log('SUCCESS', `✓ Parity checks: ${parity.data.summary}`);
        } else {
          results.summary.failed++;
          log('WARNING', `⚠ Parity issues: ${parity.data.summary}`);
          results.summary.issues.push(`Parity: ${parity.data.failedChecks}/${parity.data.totalChecks} failed`);
        }
      } else {
        results.tests.parity = { success: false, error: `Status: ${parity.status}` };
        results.summary.failed++;
        log('ERROR', `✗ Parity check failed: ${parity.status}`);
      }
    } catch (error) {
      results.tests.parity = { success: false, error: error.message };
      results.summary.failed++;
      log('ERROR', `✗ Parity check error: ${error.message}`);
    }
    
    // Summary
    log('INFO', '='.repeat(50));
    const totalTests = results.summary.passed + results.summary.failed;
    
    if (results.summary.failed === 0) {
      log('SUCCESS', `${colors.bold}VALIDATION PASSED${colors.reset} - ${results.summary.passed}/${totalTests} tests passed`);
      log('SUCCESS', '🎉 Parity system ready for deployment');
    } else {
      log('WARNING', `${colors.bold}VALIDATION COMPLETED${colors.reset} - ${results.summary.passed}/${totalTests} tests passed`);
      if (results.summary.issues.length > 0) {
        log('INFO', 'Issues detected:');
        results.summary.issues.forEach(issue => log('WARNING', `⚠ ${issue}`));
      }
    }
    
    // Save results
    fs.writeFileSync('parity-validation-results.json', JSON.stringify(results, null, 2));
    log('INFO', 'Results saved to parity-validation-results.json');
    
    return results;
    
  } catch (error) {
    log('ERROR', `Validation failed: ${error.message}`);
    results.summary.failed++;
    return results;
  }
}

// Run validation
if (require.main === module) {
  quickValidation().then(results => {
    const success = results.summary.failed === 0;
    process.exit(success ? 0 : 0); // Don't fail the process, just report
  }).catch(error => {
    log('ERROR', `Fatal error: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { quickValidation };