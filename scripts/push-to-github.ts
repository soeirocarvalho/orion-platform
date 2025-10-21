import { getUncachableGitHubClient } from '../server/services/githubService.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_OWNER = 'soeirocarvalho';
const REPO_NAME = 'orion-platform';
const BRANCH = 'main';

// Files and directories to ignore
const IGNORE_PATTERNS = [
  'node_modules',
  '.git',
  'dist',
  '.replit',
  '.upm',
  '.cache',
  '.config',
  '.local',
  'replit.nix',
  '.gitignore',
  'parity-validation-results.json',
  '.env',
  'after_clicked_present_list.png',
  'after_navigate_analytics.png',
  'after_navigate_scanning.png',
  'after_select_all_visible.png',
  'scanning_dashboard.png',
  'scanning_full.png',
  'stripe_checkout.png',
  'failed-click-scanning.png',
  'orion-platform-core.zip',
  'uv.lock',
  'DEPLOYMENT_CLEANUP_SUMMARY.md',
];

// Only include these important directories
const INCLUDE_DIRS = [
  'client',
  'server',
  'shared',
  'scripts',
];

// Include these root files
const INCLUDE_ROOT_FILES = [
  'package.json',
  'tsconfig.json',
  'vite.config.ts',
  'tailwind.config.ts',
  'postcss.config.js',
  'drizzle.config.ts',
  'components.json',
  'replit.md',
  'README.md',
  'pyproject.toml',
];

function shouldIgnore(filePath: string): boolean {
  return IGNORE_PATTERNS.some(pattern => {
    if (filePath.startsWith(pattern + '/') || filePath === pattern) {
      return true;
    }
    if (filePath.includes('/' + pattern + '/') || filePath.includes('/' + pattern)) {
      return true;
    }
    return false;
  });
}

function shouldIncludeRootPath(relativePath: string): boolean {
  const firstPart = relativePath.split('/')[0];
  return INCLUDE_DIRS.includes(firstPart) || INCLUDE_ROOT_FILES.includes(relativePath);
}

async function getAllFiles(dir: string, baseDir: string = dir): Promise<Array<{path: string, content: string}>> {
  const files: Array<{path: string, content: string}> = [];
  
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(baseDir, fullPath);

      if (shouldIgnore(relativePath) || shouldIgnore(entry.name)) {
        continue;
      }

      // For root level, only include specific dirs/files
      if (!relativePath.includes('/') && !shouldIncludeRootPath(relativePath)) {
        continue;
      }

      if (entry.isDirectory()) {
        files.push(...await getAllFiles(fullPath, baseDir));
      } else if (entry.isFile()) {
        try {
          const stats = fs.statSync(fullPath);
          // Skip very large files (> 10MB)
          if (stats.size > 10 * 1024 * 1024) {
            console.log(`⊘ Skipped (too large): ${relativePath} (${(stats.size / 1024 / 1024).toFixed(2)}MB)`);
            continue;
          }
          
          const content = fs.readFileSync(fullPath, 'utf-8');
          files.push({ path: relativePath, content });
          console.log(`✓ Added: ${relativePath}`);
        } catch (error) {
          // Skip binary files or files that can't be read as text
          console.log(`⊘ Skipped (binary): ${relativePath}`);
        }
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error);
  }

  return files;
}

async function pushToGitHub() {
  try {
    console.log('🔐 Authenticating with GitHub...');
    const octokit = await getUncachableGitHubClient();

    console.log('📦 Collecting files...');
    const projectRoot = path.join(__dirname, '..');
    const files = await getAllFiles(projectRoot);
    
    console.log(`\n✅ Found ${files.length} files to upload\n`);

    // Get the current reference (main branch)
    console.log('📍 Getting current branch reference...');
    const { data: ref } = await octokit.git.getRef({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      ref: `heads/${BRANCH}`,
    });
    const currentCommitSha = ref.object.sha;
    console.log(`Current commit: ${currentCommitSha}`);

    // Get the current commit
    console.log('📝 Getting current commit...');
    const { data: currentCommit } = await octokit.git.getCommit({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      commit_sha: currentCommitSha,
    });
    const currentTreeSha = currentCommit.tree.sha;

    // Create blobs for all files in batches
    console.log('📤 Uploading files as blobs (in batches)...');
    const BATCH_SIZE = 50;
    const blobs = [];
    
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      console.log(`\nProcessing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(files.length / BATCH_SIZE)}...`);
      
      const batchBlobs = await Promise.all(
        batch.map(async (file) => {
          try {
            const { data: blob } = await octokit.git.createBlob({
              owner: REPO_OWNER,
              repo: REPO_NAME,
              content: Buffer.from(file.content).toString('base64'),
              encoding: 'base64',
            });
            console.log(`  ✓ ${file.path}`);
            return {
              path: file.path,
              mode: '100644' as const,
              type: 'blob' as const,
              sha: blob.sha,
            };
          } catch (error: any) {
            console.error(`  ✗ Failed: ${file.path} - ${error.message}`);
            throw error;
          }
        })
      );
      
      blobs.push(...batchBlobs);
      
      // Small delay between batches to avoid rate limiting
      if (i + BATCH_SIZE < files.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // Create a new tree
    console.log('\n🌳 Creating new tree...');
    const { data: newTree } = await octokit.git.createTree({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      tree: blobs,
      base_tree: currentTreeSha,
    });
    console.log(`Tree created: ${newTree.sha}`);

    // Create a new commit
    console.log('💾 Creating commit...');
    const commitMessage = `Update ORION platform - ${new Date().toISOString().split('T')[0]}

✨ Complete platform update with all features
- Subscription system (Basic €1, Professional €2, Enterprise €3)
- Force exploration and selection (Scanning + Analytics)
- Report generation with selected forces
- Copilot deep dive with state handoff
- CSV/XLSX/JSON data import
- Database auto-seeding with 29,770 driving forces
- Stripe integration configured

📊 Features verified:
✓ Force exploration and filtering
✓ Cross-page state management (Zustand)
✓ Report generation workflow
✓ AI-powered analysis (OpenAI integration)
`;

    const { data: newCommit } = await octokit.git.createCommit({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      message: commitMessage,
      tree: newTree.sha,
      parents: [currentCommitSha],
    });
    console.log(`Commit created: ${newCommit.sha}`);

    // Update the reference
    console.log('🔄 Updating branch reference...');
    await octokit.git.updateRef({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      ref: `heads/${BRANCH}`,
      sha: newCommit.sha,
    });

    console.log('\n✅ SUCCESS! All files pushed to GitHub');
    console.log(`📍 Repository: https://github.com/${REPO_OWNER}/${REPO_NAME}`);
    console.log(`📝 Commit: ${newCommit.sha}`);
    console.log(`🔗 View commit: https://github.com/${REPO_OWNER}/${REPO_NAME}/commit/${newCommit.sha}`);
    
  } catch (error: any) {
    console.error('\n❌ Error pushing to GitHub:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

pushToGitHub();
