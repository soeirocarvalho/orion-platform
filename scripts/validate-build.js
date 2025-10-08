#!/usr/bin/env node

/**
 * Build validation script for ORION production deployment
 * Checks environment variables and build output
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function validateBuildTimeEnvVars() {
  log('\n📋 Validating build-time environment variables...', 'blue');
  
  const required = ['VITE_STRIPE_PUBLIC_KEY'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    log('❌ Missing required build-time environment variables:', 'red');
    missing.forEach(key => log(`   - ${key}`, 'red'));
    log('\nThese must be set BEFORE running npm run build', 'red');
    log('Example: VITE_STRIPE_PUBLIC_KEY=pk_xxx npm run build', 'yellow');
    return false;
  }
  
  log('✅ All build-time environment variables present', 'green');
  return true;
}

function validateBuildOutput() {
  log('\n📦 Validating build output...', 'blue');
  
  const distPublic = path.join(rootDir, 'dist', 'public');
  const distIndex = path.join(rootDir, 'dist', 'index.js');
  const indexHtml = path.join(distPublic, 'index.html');
  
  const checks = [
    { path: distPublic, name: 'Frontend build directory (dist/public)' },
    { path: distIndex, name: 'Backend bundle (dist/index.js)' },
    { path: indexHtml, name: 'Frontend index.html' },
  ];
  
  let allValid = true;
  
  for (const check of checks) {
    if (fs.existsSync(check.path)) {
      log(`✅ ${check.name}`, 'green');
    } else {
      log(`❌ ${check.name} - NOT FOUND`, 'red');
      allValid = false;
    }
  }
  
  return allValid;
}

function printDeploymentChecklist() {
  log('\n📝 Production Deployment Checklist:', 'blue');
  log('', 'reset');
  log('Build-time environment variables (set before npm run build):', 'yellow');
  log('  ✓ VITE_STRIPE_PUBLIC_KEY', 'reset');
  log('', 'reset');
  log('Runtime environment variables - Required:', 'yellow');
  log('  ✓ DATABASE_URL', 'reset');
  log('  ✓ OPENAI_API_KEY', 'reset');
  log('  ✓ SESSION_SECRET', 'reset');
  log('  ✓ NODE_ENV=production', 'reset');
  log('', 'reset');
  log('Runtime environment variables - Optional:', 'yellow');
  log('  ✓ REPLIT_DOMAINS (only for Replit OAuth)', 'reset');
  log('  ✓ STRIPE_SECRET_KEY (only for payments)', 'reset');
  log('', 'reset');
}

// Main execution
const mode = process.argv[2] || 'pre-build';

if (mode === 'pre-build') {
  log('\n🚀 Pre-build validation', 'blue');
  const valid = validateBuildTimeEnvVars();
  if (!valid) {
    printDeploymentChecklist();
    process.exit(1);
  }
  log('\n✅ Ready to build!', 'green');
} else if (mode === 'post-build') {
  log('\n🔍 Post-build validation', 'blue');
  const valid = validateBuildOutput();
  if (!valid) {
    log('\n❌ Build output validation failed', 'red');
    log('Run: npm run build', 'yellow');
    process.exit(1);
  }
  log('\n✅ Build output valid, ready for deployment!', 'green');
  printDeploymentChecklist();
} else {
  log('Usage: node scripts/validate-build.js [pre-build|post-build]', 'yellow');
  process.exit(1);
}
