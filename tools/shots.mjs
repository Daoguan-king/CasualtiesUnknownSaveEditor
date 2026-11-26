/* 截图流水线：把成品 HTML + 一份真实存档注入成探针页，再用 Chromium 逐页截图
   用法: node tools/shots.mjs [--out work/shots] [--width 1680] [--height 1050] [--panel items|all] [--tag after] */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = path.resolve(import.meta.dirname, '..');
const BROWSERS = path.join(ROOT, '.pw-browsers');
if (fs.existsSync(BROWSERS) && !process.env.PLAYWRIGHT_BROWSERS_PATH) process.env.PLAYWRIGHT_BROWSERS_PATH = BROWSERS;
const {chromium} = await import('playwright');

const argv = process.argv.slice(2);
const arg = (name, fb) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 ? argv[i + 1] : fb;
};
const OUT = path.resolve(ROOT, arg('out', 'work/shots'));
const W = Number(arg('width', 1680));
const H = Number(arg('height', 1050));
const TAG = arg('tag', 'shot');
const PANELS = ['overview', 'body', 'limbs', 'skills', 'items', 'world', 'settings', 'recipes', 'json', 'export'];
const panelArg = arg('panel', 'all');
const panels = panelArg === 'all' ? PANELS : panelArg.split(',');
const DIST = path.resolve(ROOT, arg('html', 'dist/CasualtiesUnknown存档修改器.html'));

/* 存档：优先用真实 save.sv，其次把 work/save.json 压成 gzip */
const SV = 'C:/Users/Administrator/AppData/LocalLow/Orsoniks/CasualtiesUnknown/save.sv';
let svBytes;
if (fs.existsSync(SV)) svBytes = fs.readFileSync(SV);
else svBytes = zlib.gzipSync(fs.readFileSync(path.join(ROOT, 'work', 'save.json')));

fs.mkdirSync(OUT, {recursive: true});
const probeDir = path.join(ROOT, 'work', 'probe');
fs.mkdirSync(probeDir, {recursive: true});
const probePath = path.join(probeDir, 'probe-' + TAG + '-' + W + '.html');
const html = fs.readFileSync(DIST, 'utf8').replace(
  '<head>',
  '<head><script>window.__PROBE_SV_B64__="' + svBytes.toString('base64') + '";</script>'
);
fs.writeFileSync(probePath, html);
const url = 'file:///' + probePath.replace(/\\/g, '/');

const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: W, height: H}, deviceScaleFactor: 1});
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

for (const p of panels) {
  await page.goto(url + '#' + p);
  await page.waitForTimeout(900);
  const file = path.join(OUT, TAG + '-' + p + '.png');
  await page.screenshot({path: file});
  console.log('shot ' + path.relative(ROOT, file));
}
await browser.close();
if (errors.length) {
  console.log('--- 页面错误 ---');
  for (const e of [...new Set(errors)].slice(0, 12)) console.log(e);
}
