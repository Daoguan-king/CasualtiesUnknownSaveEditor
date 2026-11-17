/* ================= 外壳：导航 / 文件 / 启动 ================= */
var NAV = [
  {sec:'档案'},
  {id:'overview', ico:'▣\uFE0E', label:'概览'},
  {sec:'身体'},
  {id:'body',     ico:'♥\uFE0E', label:'医疗面板'},
  {id:'limbs',    ico:'✚\uFE0E', label:'肢体损伤'},
  {id:'skills',   ico:'▲\uFE0E', label:'技能'},
  {sec:'物品'},
  {id:'items',    ico:'▤\uFE0E', label:'物品栏'},
  {sec:'世界'},
  {id:'world',    ico:'◈\uFE0E', label:'世界与进度'},
  {id:'settings', ico:'≡\uFE0E', label:'运行设置'},
  {id:'recipes', ico:'✦\uFE0E', label:'配方进度'},
  {sec:'文件'},
  {id:'json',     ico:'⌗\uFE0E', label:'原始 JSON'},
  {id:'export',   ico:'⇩\uFE0E', label:'校验与导出'}
];

function applyArtVars(){
  var st = document.documentElement.style;
  Object.keys(ART.user || {}).forEach(function(k){ st.setProperty('--u-' + k, 'url("' + ART.user[k] + '")'); });
  Object.keys(ART.ui || {}).forEach(function(k){ st.setProperty('--i-' + k, 'url("' + ART.ui[k] + '")'); });
}

function buildRail(){
  var rail = document.getElementById('rail');
  clear(rail);
  NAV.forEach(function(n){
    if (n.sec){ rail.appendChild(h('div', {class:'railsec', text:n.sec})); return; }
    var b = h('button', {class:'railbtn', 'data-panel':n.id, onclick:function(){ S.panel = n.id; renderPanel(); }},
      h('span', {class:'ico', text:n.ico}), h('span', {text:n.label}), h('span', {class:'dot'}));
    if (S.panel === n.id) b.classList.add('on');
    rail.appendChild(b);
  });
  rail.appendChild(h('div', {class:'railsec', text:'存档路径'}));
  rail.appendChild(h('div', {class:'railpath', text:'…\LocalLow\Orsoniks\CasualtiesUnknown\save.sv'}));
}

function renderPanel(){
  buildRail();
  var content = document.getElementById('content');
  clear(content);
  if (!S.save){
    content.appendChild(h('div', {class:'empty'},
      h('div', {class:'big', text:'▤'}),
      h('div', {style:'color:var(--fg);font-size:14px;margin-bottom:6px', html:'把 <b>save.sv</b> 拖进窗口'}),
      h('div', {text:'或点右上角「打开存档」'}),
      h('div', {class:'hint', style:'margin-top:12px', html:'C:\Users\Administrator\AppData\LocalLow\Orsoniks\CasualtiesUnknown\save.sv<br>建议先关掉游戏，并复制一份 save.sv 备份'})));
    refreshFooter();
    return;
  }
  var fn = Panels[S.panel] || Panels.overview;
  try { fn(content); }
  catch (e){
    content.appendChild(h('div', {class:'note bad', text:'渲染出错：' + e.message}));
    console.error(e);
  }
  refreshFooter();
}

/* ---------- 读取 ---------- */
async function loadBytes(bytes, name, handle){
  var text = await gunzip(bytes);
  var json;
  try { json = JSON.parse(text); }
  catch (e){ throw new Error('gzip 解开了，但内容不是合法 JSON：' + e.message); }
  if (!json.body) throw new Error('这份文件不像 Casualties: Unknown 存档（缺少 body）');
  S.save = json;
  S.orig = JSON.parse(JSON.stringify(json));
  S.fileName = name || 'save.sv';
  S.fileHandle = handle || null;
  S.panel = 'overview'; S.sel = null;
  updateFileChip();
  renderPanel();
  toast('已载入 ' + S.fileName + '（body ' + Object.keys(json.body).length + ' 项 / 物品 ' + (json.items||[]).length + ' 件）');
}

async function loadFile(file){
  try {
    var bytes = new Uint8Array(await file.arrayBuffer());
    var handle = window.__lastHandle || null;
    window.__lastHandle = null;
    await loadBytes(bytes, file.name, handle);
  } catch (e){ toast('载入失败：' + e.message, true); console.error(e); }
}

async function openPicker(){
  if (window.showOpenFilePicker){
    try {
      var hs = await window.showOpenFilePicker({ multiple:false,
        types:[{description:'Casualties 存档', accept:{'application/octet-stream':['.sv','.sav','.json']}}] });
      var fh = hs[0], f = await fh.getFile();
      window.__lastHandle = fh;
      await loadFile(f);
      return;
    } catch (e){
      if (e && e.name === 'AbortError') return;
      console.warn('picker 不可用，回退 input', e);
    }
  }
  document.getElementById('fileinput').click();
}

function updateFileChip(){
  var chip = document.getElementById('filechip');
  clear(chip);
  if (S.save){
    chip.className = 'loaded';
    chip.appendChild(h('span', {class:'fname', text:S.fileName}));
    chip.appendChild(h('span', {class:'tag', text: S.fileHandle ? '可覆盖原文件' : '需另存'}));
  } else {
    chip.className = '';
    chip.appendChild(h('span', {class:'tag', text:'未载入存档'}));
  }
}

/* ---------- 写回 ---------- */
async function doSave(asDownload){
  if (!S.save) return;
  var v = validate();
  if (v.errs.length){
    if (!confirm('发现 ' + v.errs.length + ' 个会破坏存档的错误：\n\n' +
      v.errs.slice(0,6).map(function(e){ return '· ' + e.msg; }).join('\n') + '\n\n仍要写入吗？（不推荐）')) return;
  }
  var bytes = await gzipText(toAsciiJson(S.save));
  var written = false;
  if (S.fileHandle && !asDownload){
    try {
      var w = await S.fileHandle.createWritable();
      await w.write(bytes); await w.close();
      written = true;
    } catch (e){ toast('覆盖原文件失败：' + e.message + '，改为下载', true); }
  }
  if (!written){
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes], {type:'application/gzip'}));
    a.download = 'save.sv';
    document.body.appendChild(a); a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    toast('已生成 save.sv，请放回存档目录替换原文件');
  } else {
    toast('已写回 ' + S.fileName);
  }
  S.orig = JSON.parse(JSON.stringify(S.save));
  refreshFooter();
  renderPanel();
}

/* ---------- 启动 ---------- */
function boot(){
  applyArtVars();
  document.getElementById('btnOpen').addEventListener('click', openPicker);
  document.getElementById('btnSave').addEventListener('click', function(){ doSave(false); });
  document.getElementById('fileinput').addEventListener('change', function(e){
    var f = e.target.files && e.target.files[0];
    if (f) loadFile(f);
    e.target.value = '';
  });

  var dz = document.getElementById('drop'), depth = 0;
  window.addEventListener('dragenter', function(e){ e.preventDefault(); depth++; dz.classList.add('show'); });
  window.addEventListener('dragover', function(e){ e.preventDefault(); });
  window.addEventListener('dragleave', function(e){ e.preventDefault(); if (--depth <= 0){ depth = 0; dz.classList.remove('show'); } });
  window.addEventListener('drop', function(e){
    e.preventDefault(); depth = 0; dz.classList.remove('show');
    var f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) loadFile(f);
  });
  updateFileChip();
  renderPanel();
}
document.addEventListener('DOMContentLoaded', boot);
