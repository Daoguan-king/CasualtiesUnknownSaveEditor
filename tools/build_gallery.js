/* 把 work/art/out/index.json 生成可浏览的 work/art/gallery.html（file:// 直接打开） */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const ART = path.join(ROOT, 'work', 'art');
const IDX = path.join(ART, 'out', 'index.json');
const OUT = path.join(ART, 'gallery.html');

if (!fs.existsSync(IDX)) { console.error('缺少 ' + IDX + '，先跑 work/art/extract_textures.py'); process.exit(1); }
const idx = JSON.parse(fs.readFileSync(IDX, 'utf8'));
const tex = (idx.textures || []).filter(t => t && t.ok !== false);
const failed = (idx.textures || []).filter(t => t && t.ok === false);

const cats = {};
tex.forEach(t => { const c = t.category || 'other'; cats[c] = (cats[c] || 0) + 1; });

const data = tex.map(t => ({
  n: t.name, f: t.file, p: 'out/' + String(t.path).replace(/^out\//, ''),
  w: t.w, h: t.h, c: t.category || 'other', s: t.bytes || 0
}));

const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>Casualties: Unknown 贴图解包</title>
<style>
:root{--bg:#0a0c0f;--bg2:#12161c;--line:#232a34;--fg:#e7edf5;--fg2:#93a1b3;--fg3:#5f6c7c;--acc:#91d1ff}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.55 "Segoe UI","Microsoft YaHei",system-ui,sans-serif}
header{position:sticky;top:0;z-index:10;background:linear-gradient(180deg,#111821,#0d1218);border-bottom:1px solid var(--line);padding:12px 18px}
h1{margin:0 0 2px;font-size:16px;letter-spacing:.3px}
h1 small{color:var(--fg3);font-weight:400;margin-left:10px;font-size:12px}
.bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:10px}
input[type=search],select{background:#0b1016;border:1px solid var(--line);border-radius:7px;color:var(--fg);padding:7px 11px;font:inherit}
input[type=search]{min-width:260px}
input[type=search]:focus{outline:none;border-color:var(--acc)}
.chip{background:#161d26;border:1px solid var(--line);border-radius:20px;padding:4px 12px;cursor:pointer;color:var(--fg2);font-size:12.5px}
.chip.on{background:#15303f;border-color:#2c6f9e;color:var(--acc)}
.count{color:var(--fg3);font-size:12.5px;margin-left:auto}
main{padding:16px 18px 60px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(148px,1fr));gap:12px}
.card{background:var(--bg2);border:1px solid var(--line);border-radius:9px;overflow:hidden;cursor:zoom-in;transition:.12s}
.card:hover{border-color:#3d566f;transform:translateY(-2px)}
.thumb{height:104px;display:grid;place-items:center;overflow:hidden;
  background-color:#0e1319;background-image:linear-gradient(45deg,#1a2029 25%,transparent 25%),linear-gradient(-45deg,#1a2029 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#1a2029 75%),linear-gradient(-45deg,transparent 75%,#1a2029 75%);background-size:16px 16px;background-position:0 0,0 8px,8px -8px,-8px 0}
.thumb img{max-width:100%;max-height:100%;image-rendering:pixelated}
.meta{padding:7px 9px;border-top:1px solid var(--line)}
.nm{font-size:12px;color:var(--fg);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dim{font-size:11px;color:var(--fg3);font-family:ui-monospace,Consolas,monospace}
#lb{position:fixed;inset:0;background:rgba(4,7,10,.94);display:none;place-items:center;z-index:100}
#lb.show{display:grid}
#lb img{max-width:88vw;max-height:78vh;image-rendering:pixelated;background-color:#0e1319;
  background-image:linear-gradient(45deg,#1a2029 25%,transparent 25%),linear-gradient(-45deg,#1a2029 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#1a2029 75%),linear-gradient(-45deg,transparent 75%,#1a2029 75%);background-size:20px 20px;background-position:0 0,0 10px,10px -10px,-10px 0}
#lbinfo{position:fixed;bottom:22px;left:0;right:0;text-align:center;color:var(--fg2);font-family:ui-monospace,Consolas,monospace;font-size:12.5px}
#lbinfo b{color:var(--acc)}
.hint{color:var(--fg3);font-size:12px;margin-bottom:12px}
</style></head><body>
<header>
  <h1>Casualties: Unknown — 贴图解包<small>共 <span id="tot"></span> 张 · 来源：resources / sharedassets0 / sharedassets1 / globalgamemanagers</small></h1>
  <div class="bar">
    <input type="search" id="q" placeholder="搜索名字…（如 ui / button / icon / frame）">
    <select id="sort"><option value="name">按名字</option><option value="size">按面积</option><option value="wh">按宽度</option></select>
    <select id="minw"><option value="0">全部尺寸</option><option value="32">≥32px</option><option value="64">≥64px</option><option value="128">≥128px</option><option value="256">≥256px</option></select>
    <span id="chips"></span>
    <span class="count" id="cnt"></span>
  </div>
</header>
<main>
  <div class="hint">点任意图放大；放大后名字可选中复制。透明区域用棋盘格显示，便于判断 PNG 是否带透明通道。</div>
  <div class="grid" id="grid"></div>
</main>
<div id="lb"><img id="lbimg" alt=""></div>
<div id="lbinfo"></div>
<script>
const DATA = /*__DATA__*/;
const FAILED = /*__FAILED__*/;
const CATS = /*__CATS__*/;
let cat = 'all', q = '', minw = 0, sortBy = 'name';
const $ = id => document.getElementById(id);
$('tot').textContent = DATA.length + (FAILED.length ? '（另有 ' + FAILED.length + ' 张解码失败）' : '');

const chipWrap = $('chips');
function renderChips(){
  const list = [['all', '全部', DATA.length]].concat(Object.keys(CATS).sort().map(c => [c, c, CATS[c]]));
  chipWrap.innerHTML = '';
  list.forEach(([id, label, n]) => {
    const b = document.createElement('span');
    b.className = 'chip' + (cat === id ? ' on' : '');
    b.textContent = label + ' ' + n;
    b.onclick = () => { cat = id; renderChips(); render(); };
    chipWrap.appendChild(b);
  });
}

function render(){
  const ql = q.trim().toLowerCase();
  let list = DATA.filter(t =>
    (cat === 'all' || t.c === cat) &&
    t.w >= minw &&
    (!ql || t.n.toLowerCase().includes(ql))
  );
  if (sortBy === 'size') list.sort((a, b) => b.w * b.h - a.w * a.h);
  else if (sortBy === 'wh') list.sort((a, b) => b.w - a.w);
  else list.sort((a, b) => a.n.localeCompare(b.n));
  $('cnt').textContent = '显示 ' + list.length + ' / ' + DATA.length;
  const g = $('grid');
  g.innerHTML = '';
  const frag = document.createDocumentFragment();
  list.slice(0, 4000).forEach(t => {
    const d = document.createElement('div');
    d.className = 'card';
    d.innerHTML = '<div class="thumb"><img loading="lazy" src="' + t.p + '" alt=""></div>' +
      '<div class="meta"><div class="nm" title="' + t.n + '">' + t.n + '</div>' +
      '<div class="dim">' + t.w + '×' + t.h + ' · ' + t.f + '</div></div>';
    d.onclick = () => openLb(t);
    frag.appendChild(d);
  });
  g.appendChild(frag);
}

function openLb(t){
  $('lbimg').src = t.p;
  $('lb').classList.add('show');
  $('lbinfo').innerHTML = '<b>' + t.n + '</b>　' + t.w + '×' + t.h + '　' + t.c + '　' + t.p + '　（点击任意处关闭）';
}
$('lb').onclick = () => { $('lb').classList.remove('show'); $('lbimg').src = ''; };
$('q').oninput = e => { q = e.target.value; render(); };
$('sort').onchange = e => { sortBy = e.target.value; render(); };
$('minw').onchange = e => { minw = parseInt(e.target.value, 10); render(); };
document.addEventListener('keydown', e => { if (e.key === 'Escape') $('lb').classList.remove('show'); });
renderChips(); render();
</script></body></html>`;

const out = html
  .replace('/*__DATA__*/', JSON.stringify(data))
  .replace('/*__FAILED__*/', JSON.stringify(failed.map(f => ({ n: f.name, e: f.error }))))
  .replace('/*__CATS__*/', JSON.stringify(cats));
fs.writeFileSync(OUT, out, 'utf8');
console.log('gallery: ' + OUT);
console.log('  贴图 ' + data.length + ' 张 | 失败 ' + failed.length + ' | 分类: ' + Object.keys(cats).sort().join(', '));
console.log('  体积 ' + (fs.statSync(OUT).size / 1024).toFixed(1) + ' KB');
