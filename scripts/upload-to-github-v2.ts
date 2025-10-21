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
  'scripts/upload-to-github',
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

async function uploadToGitHub(repoName: string) {
  try {
    const octokit = await getUncachableGitHubClient();
    
    // Get authenticated user
    const { data: user } = await octokit.users.getAuthenticated();
    console.log(`Authenticated as: ${user.login}`);

    // Get repo
    console.log(`Using repository: ${repoName}...`);
    const { data: repo } = await octokit.repos.get({
      owner: user.login,
      repo: repoName,
    });

    // Get all files from workspace
    console.log('Collecting files...');
    const files = await getAllFiles('/home/runner/workspace');
    console.log(`Found ${files.length} files to upload`);

    // Upload files one by one using the Contents API
    console.log('Uploading files...');
    let uploadCount = 0;
    
    for (const file of files) {
      try {
        const content = Buffer.from(file.content).toString('base64');
        
        // Check if file exists
        let sha: string | undefined;
        try {
          const { data: existing } = await octokit.repos.getContent({
            owner: user.login,
            repo: repoName,
            path: file.path,
          });
          if ('sha' in existing) {
            sha = existing.sha;
          }
        } catch (error: any) {
          if (error.status !== 404) throw error;
        }

        const requestData: any = {
          owner: user.login,
          repo: repoName,
          path: file.path,
          message: sha ? `Update ${file.path}` : `Add ${file.path}`,
          content,
        };

        if (sha) {
          requestData.sha = sha;
        }

        await octokit.repos.createOrUpdateFileContents(requestData);
        uploadCount++;
        
        if (uploadCount % 10 === 0) {
          console.log(`Uploaded ${uploadCount}/${files.length} files...`);
        }
      } catch (error: any) {
        console.error(`Error uploading ${file.path}:`, error.message);
      }
    }

    console.log(`✅ Successfully uploaded ${uploadCount} files to GitHub!`);
    console.log(`Repository URL: ${repo.html_url}`);
    
    return {
      success: true,
      url: repo.html_url,
      owner: user.login,
      repo: repoName,
      filesUploaded: uploadCount,
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
const repoName = process.argv[2] || 'orion-platform';

uploadToGitHub(repoName)
  .then(result => {
    console.log('\n🎉 Upload complete!');
    console.log(`Uploaded ${result.filesUploaded} files to: ${result.url}`);
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Upload failed:', error.message);
    process.exit(1);
  });
