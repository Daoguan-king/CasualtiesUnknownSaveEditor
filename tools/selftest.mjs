/* 浏览器内自检：真实存档 → 载入 → 改 → 撤销 → 写盘 → 校验产物
   用法: node tools/selftest.mjs [--html dist/…html] */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = path.resolve(import.meta.dirname, '..');
const BROWSERS = path.join(ROOT, '.pw-browsers');
if (fs.existsSync(BROWSERS) && !process.env.PLAYWRIGHT_BROWSERS_PATH) process.env.PLAYWRIGHT_BROWSERS_PATH = BROWSERS;
const {chromium} = await import('playwright');

const argv = process.argv.slice(2);
const arg = (name, fb) => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : fb; };
const DIST = path.resolve(ROOT, arg('html', 'dist/CasualtiesUnknown存档修改器.html'));

const SV = 'C:/Users/Administrator/AppData/LocalLow/Orsoniks/CasualtiesUnknown/save.sv';
const svBytes = fs.existsSync(SV) ? fs.readFileSync(SV) : zlib.gzipSync(fs.readFileSync(path.join(ROOT, 'work', 'save.json')));
const probeDir = path.join(ROOT, 'work', 'probe');
fs.mkdirSync(probeDir, {recursive: true});
const probePath = path.join(probeDir, 'selftest.html');
/* 探针：注入存档 + 截获产物 Blob（file:// 下浏览器下载事件不可靠，直接从 Blob 读字节） */
const probeScript = '<script>window.__PROBE_SV_B64__="' + svBytes.toString('base64') + '";'
  + 'window.__DL_BLOB__=null;(function(){var o=URL.createObjectURL.bind(URL);'
  + 'URL.createObjectURL=function(b){window.__DL_BLOB__=b;return o(b);};})();</script>';
fs.writeFileSync(probePath, fs.readFileSync(DIST, 'utf8').replace('<head>', '<head>' + probeScript));
const url = 'file:///' + probePath.replace(/\\/g, '/');

const results = [];
const check = (name, ok, detail) => { results.push({name, ok: !!ok, detail}); };

const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1680, height: 1050}, acceptDownloads: true});
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

/* 1) 载入 */
await page.goto(url + '#overview');
await page.waitForTimeout(1200);
const toolbar = await page.locator('body').innerText();
check('载入存档', toolbar.includes('save.sv'), '顶栏显示文件名');
check('初始干净', toolbar.includes('与原文件一致'), '未改动时状态文字');

/* 2) 预设改值 → 脏计数 */
await page.getByRole('button', {name: '耐久全满'}).click();
await page.waitForTimeout(400);
const afterPreset = await page.locator('body').innerText();
check('预设计入改动', /已修改 \d+ 处/.test(afterPreset), (afterPreset.match(/已修改 \d+ 处/) || [''])[0]);

/* 3) 撤销 */
await page.getByRole('button', {name: '撤销全部'}).click();
await page.waitForTimeout(400);
check('撤销回到干净', (await page.locator('body').innerText()).includes('与原文件一致'), '');

/* 4) 写盘产物 */
await page.getByRole('button', {name: '耐久全满'}).click();
await page.waitForTimeout(300);
await page.getByRole('button', {name: '保存', exact: true}).click();
await page.waitForTimeout(1200);
const raw = await page.evaluate(async () => {
  const b = window.__DL_BLOB__;
  if (!b) return null;
  const ab = await b.arrayBuffer();
  return Array.from(new Uint8Array(ab));
});
const bytes = raw ? Buffer.from(raw) : Buffer.alloc(0);
let parsed = null;
let jsonOk = false;
try { parsed = JSON.parse(zlib.gunzipSync(bytes).toString('utf8')); jsonOk = !!parsed.body; } catch {}
check('产物可解压为 JSON', jsonOk, bytes.length + ' bytes');
let text = '';
try { text = zlib.gunzipSync(bytes).toString('latin1'); } catch {}
const high = Array.from(text).filter(ch => ch.charCodeAt(0) >= 0x80).length;
check('产物纯 ASCII', jsonOk && high === 0, high + ' 个高位字节（解压后）');
check('改动写进产物', jsonOk && (parsed.items || []).every((it) => it.condition === 1), '');

/* 5) 十个面板都能渲染且无报错 */
const PANELS = {
  overview: '概览', body: '医疗面板', limbs: '肢体损伤', skills: '技能', items: '物品栏',
  world: '世界与进度', settings: '运行设置', recipes: '配方进度', json: '原始 JSON', export: '校验与导出'
};
for (const [p, title] of Object.entries(PANELS)) {
  errors.length = 0;
  await page.goto(url + '#' + p);
  await page.waitForTimeout(800);
  const text = await page.locator('body').innerText();
  check('面板渲染 ' + p, text.includes(title) && errors.length === 0, errors.slice(0, 2).join(' | '));
}

await browser.close();
const failed = results.filter(r => !r.ok);
console.log(JSON.stringify({checks: results.length, failed: failed.length, results}, null, 1));
process.exit(failed.length ? 1 : 0);
