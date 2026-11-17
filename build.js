/* 把 src/ + work/data/*.json + 美术资源 打包成单个 HTML */
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const DATA = path.join(ROOT, 'work', 'data');
const ART = path.join(ROOT, 'work', 'art', 'out');
const USER_ART = path.join(ROOT, 'UI草图', '素材');
const OUT = path.join(ROOT, 'dist');

const rd = (p, fb) => { try { return fs.readFileSync(p, 'utf8'); } catch (e) { if (fb !== undefined) return fb; throw e; } };
const jd = (name, fb) => {
  const p = path.join(DATA, name);
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { console.warn('  ! 缺少 ' + name + '，使用空数据'); return fb; }
};
const dataUri = p => 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');
/* PNG 头里直接读宽高（IHDR：宽/高各 4 字节大端） */
const pngSize = p => { const b = fs.readFileSync(p); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

const data = {
  items:          jd('items.json', {items:[]}),
  recipes:        jd('recipes.json', {recipes:[]}),
  runsettings:    jd('runsettings.json', {settings:[]}),
  bodyfields:     jd('bodyfields.json', {fields:[]}),
  limbs:          jd('limbs.json', {limbs:[]}),
  meta:           jd('meta.json', {}),
  containers:     jd('containers.json', {ok:false}),
  liquids:        jd('liquids.json', {liquids:[]}),
  liquidcapacity: jd('liquidcapacity.json', {items:{}}),
  vessels:        jd('vessels.json', {}),
  slots:          jd('slots.json', {slots:[]})
};

/* ---------- 美术资源 ---------- */
const art = { ui: {}, user: {}, items: {}, iconSize: {}, missingIcons: [] };

// 1) 用户整理的游戏 UI 贴图（像素小图，按整数倍放大）
if (fs.existsSync(USER_ART)) {
  for (const f of fs.readdirSync(USER_ART)) {
    if (!f.toLowerCase().endsWith('.png')) continue;
    art.user[f.replace(/\.png$/i, '')] = dataUri(path.join(USER_ART, f));
  }
}

// 光标：浏览器对自定义光标有尺寸上限（超过会被整条规则忽略），用 32px 版本
const CUR = path.join(ROOT, 'work', 'art', 'uicursor32.png');
if (fs.existsSync(CUR)) art.user.uicursor = dataUri(CUR);

// 2) 解包出来、界面确实要用的 UI 件（九宫格/图标）
const UI_WANT = ['uiBlock','uiBlockSmall','uiBlockNano','uiBlockMini','uioutline','darkenedUiBlockNano',
  'uigradientblack','UISprite','UIMask','UIElement8px','radialWorn',
  'favouriteyes','favouritenot','weighticon','hearticon','copyicon','pasteicon','pinicon','saveicon',
  'sleepIcon','exitIcon','threatenIcon'];
let index = [];
try { index = JSON.parse(fs.readFileSync(path.join(ART, 'index.json'), 'utf8')).textures || []; } catch (e) { console.warn('  ! 缺少 index.json，界面将缺少 UI 件'); }
const byName = {};
for (const t of index) { if (t.ok === false) continue; if (!byName[t.name]) byName[t.name] = t; }
for (const n of UI_WANT) {
  const t = byName[n];
  if (!t) { console.warn('  ! 缺少 UI 件 ' + n); continue; }
  art.ui[n] = dataUri(path.join(ROOT, 'work', 'art', t.path));
}

// 3) 物品图标：以 item prefab 的 SpriteRenderer 反查结果为准（itemicons.json），
//    没有记录时退回"贴图名 == 物品 id"的老办法
const itemIds = new Set(data.items.items.map(i => i.id));
const TEX = {};
for (const t of index) { if (t.ok === false) continue; if (!TEX[t.name]) TEX[t.name] = t; }
let ICONS = {};
try { ICONS = JSON.parse(fs.readFileSync(path.join(DATA, 'itemicons.json'), 'utf8')).icons || {}; }
catch (e) { console.warn('  ! 缺少 itemicons.json，退回同名匹配'); }
for (const id of itemIds) {
  const texName = ICONS[id] || id;
  const t = TEX[texName];
  if (t){
    const full = path.join(ROOT, 'work', 'art', t.path);
    art.items[id] = dataUri(full);
    art.iconSize[id] = pngSize(full);
  }
  else art.missingIcons.push(id);
}

/* ---------- 组装 ---------- */
let tpl = rd(path.join(SRC, 'template.html'));
const parts = {
  '/*__CSS__*/':   rd(path.join(SRC, 'theme.css')),
  '/*__DATA__*/':  JSON.stringify(data),
  '/*__ART__*/':   JSON.stringify(art),
  '/*__CORE__*/':  rd(path.join(SRC, 'core.js')),
  '/*__PANELS__*/':rd(path.join(SRC, 'panels.js')),
  '/*__APP__*/':   rd(path.join(SRC, 'app.js'))
};
const ICONP = path.join(USER_ART, 'dunestare.png');
if (fs.existsSync(ICONP)) tpl = tpl.replace('<!--__ICON__-->', dataUri(ICONP));
else tpl = tpl.replace('<link rel="icon" href="<!--__ICON__-->">', '');

for (const [marker, content] of Object.entries(parts)) {
  const i = tpl.indexOf(marker);
  if (i < 0) throw new Error('模板缺少标记 ' + marker);
  tpl = tpl.slice(0, i) + content + tpl.slice(i + marker.length);
}

fs.mkdirSync(OUT, { recursive: true });
const outFile = path.join(OUT, 'CasualtiesUnknown存档修改器.html');
fs.writeFileSync(outFile, tpl, 'utf8');

if (process.argv.includes('--selftest')) {
  const svPath = 'C:/Users/Administrator/AppData/LocalLow/Orsoniks/CasualtiesUnknown/save.sv';
  let svB64;
  try { svB64 = fs.readFileSync(svPath).toString('base64'); }
  catch (e) {
    const zlib = require('zlib');
    svB64 = zlib.gzipSync(fs.readFileSync(path.join(ROOT, 'work', 'save.json'))).toString('base64');
  }
  const test = tpl
    .replace('</body>', '<script>window.__TEST_SV_B64__="' + svB64 + '";</script>\n<script>' + rd(path.join(SRC, 'selftest.js')) + '</script>\n</body>');
  fs.writeFileSync(path.join(OUT, 'selftest.html'), test, 'utf8');
}

console.log('构建完成: ' + outFile);
console.log('  大小      : ' + (fs.statSync(outFile).size / 1024).toFixed(1) + ' KB');
console.log('  物品库    : ' + data.items.items.length + '（图标 ' + Object.keys(art.items).length + '，缺 ' + art.missingIcons.length + '）');
console.log('  配方/设置 : ' + data.recipes.recipes.length + ' / ' + data.runsettings.settings.length);
console.log('  身体/肢体 : ' + data.bodyfields.fields.length + ' / ' + data.limbs.limbs.length);
console.log('  液体/容器 : ' + data.liquids.liquids.length + ' 种 / ' + (data.containers.containerIds||[]).length + ' 个');
console.log('  UI 件     : ' + Object.keys(art.ui).length + ' 个（解包） + ' + Object.keys(art.user).length + ' 个（素材目录）');
