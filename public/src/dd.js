import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const REPLACEMENTS = [
  {
    from: '../../vendor/three.module.js',
    to: '../../vendor/three.module.js'
  }
];

const EXCLUDE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'vendor', '.vscode']);
const EXCLUDE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.woff', '.woff2', '.ttf', '.eot', '.mp3', '.glb', '.zip']);

async function walk(dir) {
  const files = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDE_DIRS.has(entry.name)) {
        files.push(...await walk(fullPath));
      }
    } else {
      const ext = extname(entry.name).toLowerCase();
      if (!EXCLUDE_EXT.has(ext)) {
        files.push(fullPath);
      }
    }
  }
  return files;
}

async function replaceInFile(filePath) {
  try {
    let content = await readFile(filePath, 'utf-8');
    let changed = false;
    for (const { from, to } of REPLACEMENTS) {
      if (content.includes(from)) {
        content = content.split(from).join(to);
        changed = true;
      }
    }
    if (changed) {
      await writeFile(filePath, content, 'utf-8');
      console.log('✓', filePath);
    }
  } catch (err) {
    console.error('✗', filePath, err.message);
  }
}

async function main() {
  const targetDir = process.argv[2] || '.';
  const root = resolve(process.cwd(), targetDir);
  console.log(`搜索目录: ${root}\n`);
  const files = await walk(root);
  console.log(`找到 ${files.length} 个文件\n`);
  let count = 0;
  for (const file of files) {
    await replaceInFile(file);
    count++;
  }
  console.log(`\n完成! 处理了 ${count} 个文件`);
}

main().catch(console.error);