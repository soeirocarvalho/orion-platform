import { getUncachableGitHubClient } from '../server/services/githubService.js';
import { readdir, readFile, stat } from 'fs/promises';
import { join } from 'path';

const IGNORE_PATTERNS = [
  'node_modules',
  '.git',
  'dist',
  '.replit',
  '.config',
  '.cache',
  '.npm',
  '.upm',
  'replit.nix',
  '.breakpoints',
  'tmp',
  '.vite',
  '.local',
  '.pythonlibs',
  'attached_assets',
  'legacy',
  'backend/orion',
  'data/',
  '.parquet',
  '.pkl',
  '.zip',
  '.bin',
  'network_data.json',
  'nodes_sample.json',
  'orion_forces_import.csv',
  'ziiGfpLP',
];

async function getAllFiles(dir: string, basePath: string = ''): Promise<Array<{ path: string; content: string }>> {
  const files: Array<{ path: string; content: string }> = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const relativePath = basePath ? join(basePath, entry.name) : entry.name;

    // Skip ignored patterns
    if (IGNORE_PATTERNS.some(pattern => fullPath.includes(pattern))) {
      continue;
    }

    if (entry.isDirectory()) {
      const subFiles = await getAllFiles(fullPath, relativePath);
      files.push(...subFiles);
    } else {
      try {
        const stats = await stat(fullPath);
        // Skip files larger than 1MB (GitHub API limit)
        if (stats.size > 1024 * 1024) {
          console.log(`Skipping large file: ${relativePath}`);
          continue;
        }

        const content = await readFile(fullPath, 'utf-8');
        files.push({ path: relativePath, content });
      } catch (error) {
        console.log(`Skipping binary or unreadable file: ${relativePath}`);
      }
    }
  }

  return files;
}

async function createGitHubRepo(repoName: string, description: string) {
  try {
    const octokit = await getUncachableGitHubClient();
    
    // Get authenticated user
    const { data: user } = await octokit.users.getAuthenticated();
    console.log(`Authenticated as: ${user.login}`);

    // Try to create new repository, or use existing one
    let repo;
    try {
      console.log(`Creating repository: ${repoName}...`);
      const { data: newRepo } = await octokit.repos.createForAuthenticatedUser({
        name: repoName,
        description,
        private: false,
        auto_init: false,
      });
      repo = newRepo;
      console.log(`Repository created: ${repo.html_url}`);
    } catch (error: any) {
      if (error.status === 422) {
        console.log(`Repository ${repoName} already exists, using existing repository...`);
        const { data: existingRepo } = await octokit.repos.get({
          owner: user.login,
          repo: repoName,
        });
        repo = existingRepo;
        console.log(`Using existing repository: ${repo.html_url}`);
      } else {
        throw error;
      }
    }

    // Get all files from workspace
    console.log('Collecting files...');
    const files = await getAllFiles('/home/runner/workspace');
    console.log(`Found ${files.length} files to upload`);

    // Create a tree with all files
    const tree = files.map(file => ({
      path: file.path,
      mode: '100644' as const,
      type: 'blob' as const,
      content: file.content,
    }));

    console.log('Creating git tree...');
    const { data: treeData } = await octokit.git.createTree({
      owner: user.login,
      repo: repoName,
      tree,
    });

    console.log('Creating commit...');
    
    // Check if repository has any commits
    let parentSha: string | undefined;
    try {
      const { data: ref } = await octokit.git.getRef({
        owner: user.login,
        repo: repoName,
        ref: 'heads/main',
      });
      parentSha = ref.object.sha;
      console.log(`Found existing main branch with SHA: ${parentSha}`);
    } catch (error: any) {
      if (error.status === 404) {
        console.log('Repository is empty, creating initial commit...');
      } else {
        throw error;
      }
    }

    const commitData: any = {
      owner: user.login,
      repo: repoName,
      message: parentSha ? 'Update: ORION Strategic Intelligence Platform' : 'Initial commit: ORION Strategic Intelligence Platform',
      tree: treeData.sha,
    };

    if (parentSha) {
      commitData.parents = [parentSha];
    }

    const { data: commit } = await octokit.git.createCommit(commitData);

    console.log('Updating main branch...');
    if (parentSha) {
      await octokit.git.updateRef({
        owner: user.login,
        repo: repoName,
        ref: 'heads/main',
        sha: commit.sha,
      });
    } else {
      await octokit.git.createRef({
        owner: user.login,
        repo: repoName,
        ref: 'refs/heads/main',
        sha: commit.sha,
      });
    }

    console.log('✅ Successfully uploaded to GitHub!');
    console.log(`Repository URL: ${repo.html_url}`);
    
    return {
      success: true,
      url: repo.html_url,
      owner: user.login,
      repo: repoName,
    };
  } catch (error: any) {
    console.error('Error uploading to GitHub:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    throw error;
  }
}

// Run the script
const repoName = process.argv[2] || 'orion-strategic-intelligence';
const description = process.argv[3] || 'ORION - AI Strategic Copilot for strategic foresight analysis with three-lens scanning approach and Stripe subscription integration';

createGitHubRepo(repoName, description)
  .then(result => {
    console.log('\n🎉 Upload complete!');
    console.log(`Your ORION app is now at: ${result.url}`);
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Upload failed:', error.message);
    process.exit(1);
  });
