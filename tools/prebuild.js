/* 把 work/data/*.json 与解包贴图打成 src/generated/*.json（构建期注入，产物仍是单文件） */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DATA = path.join(ROOT, 'work', 'data');
const ART = path.join(ROOT, 'work', 'art', 'out');
const USER_ART = path.join(ROOT, 'UI草图', '素材');
const OUT = path.join(ROOT, 'src', 'generated');

const jd = (name, fb) => {
  try { return JSON.parse(fs.readFileSync(path.join(DATA, name), 'utf8')); }
  catch { console.warn('  ! 缺少 ' + name + '，使用空数据'); return fb; }
};
const dataUri = p => 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');
/* PNG 头里直接读宽高（IHDR：宽/高各 4 字节大端） */
const pngSize = p => { const b = fs.readFileSync(p); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

const data = {
  items: jd('items.json', {items: []}),
  recipes: jd('recipes.json', {recipes: []}),
  runsettings: jd('runsettings.json', {settings: []}),
  bodyfields: jd('bodyfields.json', {fields: []}),
  limbs: jd('limbs.json', {limbs: []}),
  meta: jd('meta.json', {}),
  containers: jd('containers.json', {ok: false}),
  liquids: jd('liquids.json', {liquids: []}),
  liquidcapacity: jd('liquidcapacity.json', {items: {}}),
  vessels: jd('vessels.json', {}),
  slots: jd('slots.json', {slots: []})
};

const art = {ui: {}, user: {}, items: {}, iconSize: {}, missingIcons: []};

if (fs.existsSync(USER_ART)) {
  for (const f of fs.readdirSync(USER_ART)) {
    if (!f.toLowerCase().endsWith('.png')) continue;
    art.user[f.replace(/\.png$/i, '')] = dataUri(path.join(USER_ART, f));
  }
}
const CUR = path.join(ROOT, 'work', 'art', 'uicursor32.png');
if (fs.existsSync(CUR)) art.user.uicursor = dataUri(CUR);

const UI_WANT = ['uiBlock', 'uiBlockSmall', 'uiBlockNano', 'uiBlockMini', 'uioutline', 'darkenedUiBlockNano',
  'uigradientblack', 'UISprite', 'UIMask', 'UIElement8px', 'radialWorn',
  'favouriteyes', 'favouritenot', 'weighticon', 'hearticon', 'copyicon', 'pasteicon', 'pinicon', 'saveicon',
  'sleepIcon', 'exitIcon', 'threatenIcon'];
let index = [];
try { index = JSON.parse(fs.readFileSync(path.join(ART, 'index.json'), 'utf8')).textures || []; }
catch { console.warn('  ! 缺少 index.json，界面将缺少 UI 件'); }
const byName = {};
for (const t of index) { if (t.ok === false) continue; if (!byName[t.name]) byName[t.name] = t; }
for (const n of UI_WANT) {
  const t = byName[n];
  if (!t) continue;
  art.ui[n] = dataUri(path.join(ROOT, 'work', 'art', t.path));
}

const itemIds = new Set(data.items.items.map(i => i.id));
const TEX = {};
for (const t of index) { if (t.ok === false) continue; if (!TEX[t.name]) TEX[t.name] = t; }
let ICONS = {};
try { ICONS = JSON.parse(fs.readFileSync(path.join(DATA, 'itemicons.json'), 'utf8')).icons || {}; }
catch { console.warn('  ! 缺少 itemicons.json，退回同名匹配'); }
for (const id of itemIds) {
  const texName = ICONS[id] || id;
  const t = TEX[texName];
  if (t) {
    const full = path.join(ROOT, 'work', 'art', t.path);
    art.items[id] = dataUri(full);
    art.iconSize[id] = pngSize(full);
  } else art.missingIcons.push(id);
}

fs.mkdirSync(OUT, {recursive: true});
fs.writeFileSync(path.join(OUT, 'data.json'), JSON.stringify(data));
fs.writeFileSync(path.join(OUT, 'art.json'), JSON.stringify(art));
console.log('数据: ' + data.items.items.length + ' 物品 / ' + data.recipes.recipes.length + ' 配方 / ' + data.runsettings.settings.length + ' 设置');
console.log('美术: ' + Object.keys(art.items).length + ' 图标（缺 ' + art.missingIcons.length + '），' + Object.keys(art.user).length + ' 素材，' + Object.keys(art.ui).length + ' 解包 UI 件');
