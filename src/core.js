/* ================= 核心层：状态 / 编解码 / 校验 / 控件 ================= */
'use strict';

var DATA = window.__DATA || {};
var ART  = window.__ART  || { ui:{}, user:{}, items:{} };

var LIQCAP   = (DATA.liquidcapacity && DATA.liquidcapacity.items) || {};
var LIQUIDS  = (DATA.liquids && DATA.liquids.liquids) || [];
var VESSELS  = DATA.vessels || {};

var DB = {
  items: (DATA.items && DATA.items.items) || [],
  itemById: {},
  recipes: (DATA.recipes && DATA.recipes.recipes) || [],
  settings: (DATA.runsettings && DATA.runsettings.settings) || [],
  fields: (DATA.bodyfields && DATA.bodyfields.fields) || [],
  fieldByName: {},
  limbs: (DATA.limbs && DATA.limbs.limbs) || [],
  meta: DATA.meta || {},
  containers: (DATA.containers && DATA.containers.ok) ? DATA.containers : null,
  liquids: LIQUIDS,
  liquidById: {},
  liquidcapacity: LIQCAP,
  vessels: VESSELS,
  slots: (DATA.slots && DATA.slots.slots) || []
};
DB.items.forEach(function(it){ DB.itemById[it.id] = it; });
DB.liquids.forEach(function(l){ DB.liquidById[l.id] = l; });
DB.fields.forEach(function(f){ DB.fieldByName[f.name] = f; });

var HAND_SLOTS = (DB.meta.handSlots && DB.meta.handSlots.length) || 6;

/* 游戏 Item.ColorSwatches（Item.cs:32-41），索引 0~7 = 左→右 */
var SWATCHES = [
  {i:0, name:'白（默认）', hex:'#ffffff'},
  {i:1, name:'灰',       hex:'#808080'},
  {i:2, name:'绿',       hex:'#47ff47'},
  {i:3, name:'橙',       hex:'#f5ab2b'},
  {i:4, name:'品红',     hex:'#e655ff'},
  {i:5, name:'蓝紫',     hex:'#6655ff'},
  {i:6, name:'青',       hex:'#33ffff'},
  {i:7, name:'黄',       hex:'#fffc66'}
];
var WATERCOMP = 'WaterContainerItem, Assembly-CSharp, Version=0.0.0.0, Culture=neutral, PublicKeyToken=null';

var S = { save:null, orig:null, fileName:'', fileHandle:null, panel:'overview', sel:null };

/* ---------------- 名字 / 图标 ---------------- */
function itemName(id){ var c = DB.itemById[id]; return (c && c.name) || id; }
function stripTags(s){ return String(s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(); }
function itemDesc(id){ var c = DB.itemById[id]; return stripTags(c && c.desc); }
/* 游戏描述是 TMP 富文本（<color="red">…</color> / <i> / <b> / <size> …）。
   做法：先把整段转义，再只把白名单标签放回来 —— 原文里的标签不会漏成裸文本，
   也不可能注入任意 HTML；Unity 里常见的"只开不闭"的 <color> 交给浏览器自动收尾。 */
function richText(s){
  var esc = String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc
    .replace(/&lt;color=("?)([#\w]+)\1&gt;/gi, '<span style="color:$2">')
    .replace(/&lt;\/color&gt;/gi, '</span>')
    .replace(/&lt;b&gt;/gi, '<b>').replace(/&lt;\/b&gt;/gi, '</b>')
    .replace(/&lt;i&gt;/gi, '<i>').replace(/&lt;\/i&gt;/gi, '</i>')
    .replace(/&lt;br\s*\/?&gt;/gi, '<br>')
    .replace(/&lt;\/?[a-z][^&]{0,60}?&gt;/gi, '');
}
function itemDescRich(id){ var c = DB.itemById[id]; return richText(c && c.desc); }
function itemEn(id){ var c = DB.itemById[id]; return (c && c.nameEn) || ''; }
function itemIcon(id){ return ART.items[id] || null; }
function liquidName(id){ var l = DB.liquidById[id]; return (l && l.name) || id; }
function liquidColor(id){ var l = DB.liquidById[id]; return (l && l.color) || '#666666'; }
function itemCapacity(id){ var x = DB.liquidcapacity[id]; return x ? x.capacity : null; }
function isLiquidVessel(id){ return !!DB.liquidcapacity[id] || (DB.itemById[id] && DB.itemById[id]['class'] === 'LiquidItemInfo'); }
function wearSlotName(id){
  var arr = DB.meta.wearSlots || [];
  for (var i=0;i<arr.length;i++) if (arr[i].id === id) return arr[i].label || id;
  return id;
}
function charTypeName(v){
  var arr = DB.meta.charTypes || [];
  for (var i=0;i<arr.length;i++) if (String(arr[i].value) === String(v)) return arr[i].label;
  return '类型 ' + v;
}
function fieldMeta(n){ return DB.fieldByName[n] || null; }
function slotLabel(i){
  var arr = DB.meta.handSlots || [];
  for (var k=0;k<arr.length;k++) if (arr[k].index === i) return arr[k].label;
  return '槽位 ' + i;
}
function slotLimb(i){
  var arr = DB.meta.handSlots || [];
  for (var k=0;k<arr.length;k++) if (arr[k].index === i) return arr[k].limb || null;
  return null;
}
function limbMeta(i){ return DB.limbs[i] || {}; }

/* ---------------- DOM ---------------- */
function h(tag, attrs){
  var el = document.createElement(tag);
  if (attrs) for (var k in attrs){
    var v = attrs[k];
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style') el.setAttribute('style', v);
    else if (k.slice(0,2) === 'on') el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else el.setAttribute(k, v);
  }
  for (var i=2;i<arguments.length;i++) addKid(el, arguments[i]);
  return el;
}
function addKid(el, k){
  if (k === null || k === undefined || k === false) return;
  if (Array.isArray(k)){ k.forEach(function(x){ addKid(el, x); }); return; }
  if (k instanceof Node) el.appendChild(k);
  else el.appendChild(document.createTextNode(String(k)));
}
function clear(el){ while (el.firstChild) el.removeChild(el.firstChild); return el; }
function toast(msg, bad){
  var t = document.getElementById('toast');
  t.textContent = msg; t.className = 'show' + (bad ? ' bad' : '');
  clearTimeout(toast._t);
  toast._t = setTimeout(function(){ t.className = ''; }, 2600);
}
/* 游戏图标是 3×2 ~ 12×12 的小像素图，按非整数倍缩放会被最近邻采样吃掉整行/整列像素，
   看起来像"被裁断"。这里按贴图真实像素算整数倍放大，居中放进方框。 */
function iconBox(id, size){
  var src = itemIcon(id);
  var px = size || 26;
  var box = h('div', {class:'icon' + (src ? '' : ' ph')});
  box.style.width = box.style.height = px + 'px';
  if (src){
    var img = h('img', {src: src, alt: ''});
    var dim = (ART.iconSize || {})[id];
    if (dim && dim[0] && dim[1]){
      var k = Math.floor(Math.min(px / dim[0], px / dim[1]));
      if (k >= 1){
        img.style.width = (dim[0] * k) + 'px';
        img.style.height = (dim[1] * k) + 'px';
      }
    }
    box.appendChild(img);
  } else {
    box.appendChild(h('span', {text: (itemName(id) || '?').slice(0,1)}));
  }
  return box;
}

/* ---------------- gzip / ASCII ---------------- */
async function gunzip(bytes){
  if (typeof DecompressionStream === 'undefined') throw new Error('此浏览器不支持 DecompressionStream，请用 Edge/Chrome 103+');
  var s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(s).text();
}
async function gzipText(text){
  if (typeof CompressionStream === 'undefined') throw new Error('此浏览器不支持 CompressionStream，请用 Edge/Chrome 103+');
  var s = new Blob([new TextEncoder().encode(text)]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
/* 游戏用 Encoding.ASCII 读写档（SaveSystem.cs:458/469），非 ASCII 字节回读会变 '?' */
function toAsciiJson(obj){
  return JSON.stringify(obj).replace(/[\u007f-\uffff]/g, function(c){
    return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
  });
}

/* ---------------- 路径 / 差异 ---------------- */
function getPath(path){
  var o = S.save;
  for (var i=0;i<path.length;i++){ if (o === null || o === undefined) return undefined; o = o[path[i]]; }
  return o;
}
function setPath(path, val){
  var o = S.save;
  for (var i=0;i<path.length-1;i++){ if (!o[path[i]]) o[path[i]] = {}; o = o[path[i]]; }
  o[path[path.length-1]] = val;
}
function getOrig(path){ var o = S.orig; for (var i=0;i<path.length;i++){ if (o == null) return undefined; o = o[path[i]]; } return o; }
function isChanged(path){ return JSON.stringify(getOrig(path)) !== JSON.stringify(getPath(path)); }

function diffAll(a, b, prefix, out){
  prefix = prefix || []; out = out || [];
  if (a === b) return out;
  var ta = a === null ? 'null' : Array.isArray(a) ? 'array' : typeof a;
  var tb = b === null ? 'null' : Array.isArray(b) ? 'array' : typeof b;
  if (ta !== tb || (ta !== 'object' && ta !== 'array')){
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ path: prefix.join('.'), from: a, to: b });
    return out;
  }
  if (Array.isArray(a) || Array.isArray(b)){
    var n = Math.max(a ? a.length : 0, b ? b.length : 0);
    for (var i=0;i<n;i++) diffAll(a ? a[i] : undefined, b ? b[i] : undefined, prefix.concat(['['+i+']']), out);
    return out;
  }
  var keys = {};
  Object.keys(a||{}).forEach(function(k){ keys[k]=1; });
  Object.keys(b||{}).forEach(function(k){ keys[k]=1; });
  Object.keys(keys).forEach(function(k){ diffAll(a?a[k]:undefined, b?b[k]:undefined, prefix.concat([k]), out); });
  return out;
}
function changeCount(){ return diffAll(S.orig, S.save).length; }

/* ---------------- 控件 ---------------- */
function fNumber(path, opt){
  opt = opt || {};
  var cur = getPath(path);
  var row = h('div', {class:'ctl'});
  var inp = h('input', {type:'number', step: opt.step != null ? opt.step : 'any'});
  inp.value = cur;
  if (opt.min != null) inp.min = opt.min;
  if (opt.max != null) inp.max = opt.max;
  var rng = null;
  if (opt.min != null && opt.max != null){
    rng = h('input', {type:'range', min:opt.min, max:opt.max, step: opt.step != null ? opt.step : 0.01});
    rng.value = cur;
    rng.addEventListener('input', function(){ inp.value = rng.value; commit(); });
    row.appendChild(rng);
  }
  function commit(){
    var v = parseFloat(inp.value);
    if (isNaN(v)){ inp.value = getPath(path); return; }
    if (opt.int) v = Math.round(v);
    if (opt.min != null && v < opt.min) v = opt.min;
    if (opt.max != null && v > opt.max) v = opt.max;
    setPath(path, v);
    inp.value = v;
    if (rng) rng.value = v;
    var f = inp.closest('.field'); if (f) f.classList.toggle('changed', isChanged(path));
    refreshFooter();
  }
  inp.addEventListener('change', commit);
  inp.addEventListener('input', function(){ commit(); });
  row.appendChild(inp);
  return row;
}
function fBool(path){
  var inp = h('input', {type:'checkbox'});
  inp.checked = !!getPath(path);
  inp.addEventListener('change', function(){
    setPath(path, inp.checked);
    var f = inp.closest('.field'); if (f) f.classList.toggle('changed', isChanged(path));
    refreshFooter();
  });
  return h('div', {class:'ctl'}, h('label', {class:'sw'}, inp, h('span')));
}
function fText(path, ph){
  var inp = h('input', {type:'text', value: getPath(path) || ''});
  if (ph) inp.placeholder = ph;
  inp.addEventListener('change', function(){ setPath(path, inp.value); var f = inp.closest('.field'); if (f) f.classList.toggle('changed', isChanged(path)); refreshFooter(); });
  return h('div', {class:'ctl'}, inp);
}
function fSelect(path, options, opt){
  opt = opt || {};
  var cur = getPath(path);
  var sel = h('select');
  options.forEach(function(o){
    var v = (typeof o === 'object') ? o.value : o;
    var t = (typeof o === 'object') ? o.label : o;
    var op = h('option', {value: v, text: String(t)});
    if (String(v) === String(cur)) op.selected = true;
    sel.appendChild(op);
  });
  sel.addEventListener('change', function(){
    var v = sel.value;
    if (opt.numeric) v = parseFloat(v);
    setPath(path, v);
    var f = sel.closest('.field'); if (f) f.classList.toggle('changed', isChanged(path));
    refreshFooter();
    if (opt.onChange) opt.onChange(v);
  });
  return h('div', {class:'ctl'}, sel);
}
function fieldRow(label, key, ctl, extra){
  var lbl = h('div', {class:'lbl'}, h('span', {text: label}), key ? h('span', {class:'k', text: key}) : null);
  return h('div', {class:'field'}, lbl, ctl, h('div', {class:'tag', text: extra || ''}));
}
/* 面板容器：ph = 标题栏 */
function panel(title, count, kids, cls){
  var el = h('div', {class:'panel' + (cls ? ' ' + cls : '')});
  el.appendChild(h('div', {class:'ph'},
    h('span', {class:'t', text: title}),
    count != null ? h('span', {class:'n', text: String(count)}) : null));
  var b = h('div', {class:'pb'});
  (kids || []).forEach(function(k){ if (k) b.appendChild(k); });
  el.appendChild(b);
  return el;
}

/* ---------------- 校验 ---------------- */
function validate(){
  var errs = [], warns = [];
  if (!S.save) return { errs:[{msg:'尚未载入存档'}], warns:[] };
  var j = S.save;
  var need = ['body','limbs','items','itemComponents','bodyComponents','limbComponents','savedRecipeData','runSettings'];
  need.forEach(function(k){ if (j[k] === undefined) errs.push({msg:'缺少顶层字段 ' + k}); });
  if (Array.isArray(j.items) && Array.isArray(j.itemComponents) && j.items.length !== j.itemComponents.length)
    errs.push({msg:'items 与 itemComponents 长度不一致（' + j.items.length + ' vs ' + j.itemComponents.length + '）'});
  if (Array.isArray(j.limbs) && Array.isArray(j.limbComponents) && j.limbs.length !== j.limbComponents.length)
    errs.push({msg:'limbs 与 limbComponents 长度不一致'});
  if (j.savedRecipeData && Array.isArray(j.savedRecipeData.saved) && DB.recipes.length && j.savedRecipeData.saved.length !== DB.recipes.length)
    warns.push({msg:'配方表长度 ' + j.savedRecipeData.saved.length + ' 与当前配方数 ' + DB.recipes.length + ' 不同'});

  var isContainer = function(id){
    if (DB.containers && DB.containers.containerIds) return DB.containers.containerIds.indexOf(id) >= 0;
    return null;
  };
  var slotHead = {}, wearHead = {}, unknown = [];
  (j.items||[]).forEach(function(it, i){
    if (!DB.itemById[it.id]) unknown.push('#' + i + ' ' + it.id);
    if (typeof it.condition !== 'number' || isNaN(it.condition) || it.condition < 0)
      errs.push({msg:'物品 #' + i + ' condition 非法: ' + it.condition});
    else if (it.condition > 1) warns.push({msg:'物品 #' + i + ' condition=' + it.condition + ' > 1'});
    if (it.slot >= 0){
      if (it.slot >= HAND_SLOTS) warns.push({msg:'物品 #' + i + ' 槽位 ' + it.slot + ' 超出 0-' + (HAND_SLOTS-1)});
      if (!(it.slot in slotHead)) slotHead[it.slot] = {i:i, id:it.id, n:0}; else slotHead[it.slot].n++;
    } else if (it.wearSlot == null){
      warns.push({msg:'物品 #' + i + ' 既无槽位也无穿戴位'});
    } else {
      if (!(it.wearSlot in wearHead)) wearHead[it.wearSlot] = {i:i, id:it.id, n:0}; else wearHead[it.wearSlot].n++;
    }
  });
  if (unknown.length) warns.push({msg:'有 ' + unknown.length + ' 件物品 id 不在物品表中，读档会被跳过：' + unknown.slice(0,8).join('，')});
  Object.keys(slotHead).forEach(function(s){
    var hd = slotHead[s];
    if (!hd.n || isContainer(hd.id) === true) return;
    warns.push({msg: slotLabel(+s) + ' 里有 ' + (hd.n+1) + ' 件物品，但宿主「' + itemName(hd.id) + '」' + (isContainer(hd.id) === false ? '不是容器' : '容器属性未知')});
  });
  Object.keys(wearHead).forEach(function(w){
    var hd = wearHead[w];
    if (!hd.n || isContainer(hd.id) === true) return;
    warns.push({msg:'穿戴位 ' + wearSlotName(w) + ' 里有 ' + (hd.n+1) + ' 件物品，但宿主「' + itemName(hd.id) + '」' + (isContainer(hd.id) === false ? '不是容器' : '容器属性未知')});
  });
  DB.fields.forEach(function(f){
    if (f.csharpType !== 'int') return;
    [['body', f.name], ['body','skills', f.name]].forEach(function(p){
      var v = getPath(p);
      if (typeof v === 'number' && !Number.isInteger(v))
        errs.push({msg: p.join('.') + ' 是 int 字段，给小数 ' + v + ' 会被静默四舍五入成 ' + Math.round(v)});
    });
  });
  if (j.cheatedSave === true) warns.push({msg:'cheatedSave = true：读档后会禁用本次运行的成就'});
  return { errs: errs, warns: warns };
}

/* ---------------- 底部状态 ---------------- */
function refreshFooter(){
  var el = document.getElementById('status');
  if (!el) return;
  if (!S.save){ el.textContent = '未载入存档'; return; }
  var n = changeCount();
  if (n) el.innerHTML = '已修改 <b>' + n + '</b> 处'; else el.textContent = '与原文件一致';
  var badge = document.getElementById('savebadge');
  if (badge){
    badge.className = 'badge ' + (n ? 'warn' : 'ok');
    badge.textContent = n ? '有未保存修改' : '干净';
  }
  var rail = document.querySelectorAll('#rail .railbtn');
  for (var i=0;i<rail.length;i++){
    var p = rail[i].dataset.panel;
    rail[i].classList.toggle('dirty', !!S.save && panelDirty(p));
  }
}
/* 重渲染当前页但不弹回顶部：液体弹窗改动后，详情/圆盘/列表都要跟着变 */
function rerenderKeepScroll(){
  var c = document.getElementById('content');
  var top = c ? c.scrollTop : 0;
  renderPanel();
  if (c) c.scrollTop = top;
}
function panelDirty(p){
  return diffAll(S.orig, S.save).some(function(x){ return pathInPanel(x.path, p); });
}
function pathInPanel(path, p){
  if (!path) return false;
  if (p === 'body')   return path.indexOf('body.') === 0 && path.indexOf('body.skills') !== 0;
  if (p === 'skills') return path.indexOf('body.skills') === 0;
  if (p === 'limbs')  return path.indexOf('limbs.') === 0 || path.indexOf('limbComponents') === 0;
  if (p === 'items')  return path.indexOf('items.') === 0 || path.indexOf('itemComponents') === 0;
  if (p === 'world')  return ['biome','endlessLoops','totalTraveled','runTime','cHeight','cAge','cId','cVer','character','isMercRun','cheatedSave','trapRarity','lootRarity','caloriesConsumed','lastHappiness'].indexOf(path.split('.')[0]) >= 0;
  if (p === 'settings') return path.indexOf('runSettings') === 0;
  if (p === 'recipes')  return path.indexOf('savedRecipeData') === 0;
  return false;
}
window.CU = { S:S, DB:DB, ART:ART, h:h, iconBox:iconBox, getPath:getPath, setPath:setPath, isChanged:isChanged,
  fieldRow:fieldRow, fNumber:fNumber, fBool:fBool, fText:fText, fSelect:fSelect, panel:panel, toast:toast,
  refreshFooter:refreshFooter, rerenderKeepScroll:rerenderKeepScroll, itemName:itemName, validate:validate, diffAll:diffAll, changeCount:changeCount,
  clear:clear, itemDesc:itemDesc, itemDescRich:itemDescRich, richText:richText, stripTags:stripTags, itemEn:itemEn, itemIcon:itemIcon, wearSlotName:wearSlotName, charTypeName:charTypeName,
  fieldMeta:fieldMeta, toAsciiJson:toAsciiJson, HAND_SLOTS:HAND_SLOTS, SWATCHES:SWATCHES, WATERCOMP:WATERCOMP,
  liquidName:liquidName, liquidColor:liquidColor, itemCapacity:itemCapacity, isLiquidVessel:isLiquidVessel,
  slotLabel:slotLabel, slotLimb:slotLimb, limbMeta:limbMeta };
