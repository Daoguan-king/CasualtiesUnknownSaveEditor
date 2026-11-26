/* 构建：预生成数据 → astryx 单文件导出
   用法: node tools/build.js [--out dist/CasualtiesUnknown存档修改器.html] */
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const arg = (name, fb) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 ? argv[i + 1] : fb;
};
const out = path.resolve(ROOT, arg('out', 'dist/CasualtiesUnknown存档修改器.html'));
const rel = path.relative(ROOT, out);
if (path.isAbsolute(rel) === false && rel.startsWith('..')) {
  console.error('产物必须在项目目录内：' + rel);
  process.exit(1);
}

/* 同一工作区的并发构建排队：先到先建 */
const LOCK = path.join(ROOT, 'work', '.build.lock');
const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
for (let i = 0; i < 240; i++) {
  try { fs.writeFileSync(LOCK, String(process.pid), {flag: 'wx'}); break; }
  catch { sleep(250); }
}
const release = () => { try { fs.unlinkSync(LOCK); } catch {} };
process.on('exit', release);

const pre = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'prebuild.js')], {stdio: 'inherit', cwd: ROOT});
if (pre.status !== 0) process.exit(pre.status ?? 1);

/* astryx export 不会覆盖不是它写的文件 */
if (fs.existsSync(out)) fs.unlinkSync(out);
fs.mkdirSync(path.dirname(out), {recursive: true});

const CLI = path.join(ROOT, 'node_modules', '@astryxdesign', 'cli', 'clients', 'cli', 'bin', 'astryx.mjs');
const r = spawnSync(process.execPath, [CLI, 'experimental', 'export', 'src/page.tsx',
  '--out', rel, '--title', 'Casualties: Unknown 存档修改器'], {stdio: 'inherit', cwd: ROOT});
if (r.status !== 0) {
  console.error('构建失败: ' + (r.error ? r.error.message : 'exit ' + r.status));
  process.exit(r.status ?? 1);
}
console.log('构建完成: ' + rel + ' (' + (fs.statSync(out).size / 1024).toFixed(0) + ' KB)');
