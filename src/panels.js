/* ================= 面板层 =================
   全站只用 theme.css 第 3 层的组件拼装：.panel / .field / .btn / .tbl / .tile / .list / .note
   页面里不写颜色、字号、边框。 */
var Panels = {};

/* ---------- 通用 ---------- */
function fmtTime(sec){
  sec = Math.round(sec || 0);
  var hh = Math.floor(sec/3600), mm = Math.floor(sec%3600/60), ss = sec%60;
  return hh + ':' + String(mm).padStart(2,'0') + ':' + String(ss).padStart(2,'0');
}
/* 绑定任意值的开关（运行设置 / 配方不走 S.save 路径） */
function switchCtl(checked, onchange){
  var inp = h('input', {type:'checkbox', checked: !!checked});
  if (onchange) inp.addEventListener('change', function(){ onchange(inp.checked); });
  return h('div', {class:'ctl'}, h('label', {class:'sw'}, inp, h('span')));
}
function th(text, cls){ return h('th', {class: cls || null, text: text}); }
function toolRow(){ 
  var el = h('div', {class:'toolrow'});
  for (var i=0;i<arguments.length;i++) addKid(el, arguments[i]);
  return el;
}
function card(t, v, bad){
  return h('div', {class:'card'}, h('div', {class:'k', text:t}),
    h('div', {class:'v' + (bad ? ' bad' : ''), title:String(v), text:String(v)}));
}

/* ================= 概览 ================= */
Panels.overview = function(root){
  var j = S.save;
  root.appendChild(h('h2', {class:'ptitle', text:'概览'}));
  root.appendChild(h('p', {class:'sub', text:'当前存档的概要'}));

  var cards = h('div', {class:'cards'});
  cards.appendChild(card('角色', charTypeName(j.character)));
  cards.appendChild(card('身高 / 年龄', j.cHeight + ' cm / ' + j.cAge + ' y'));
  cards.appendChild(card('当前层数', j.biome));
  cards.appendChild(card('行进距离', (j.totalTraveled||0) + ' m'));
  cards.appendChild(card('游玩时长', fmtTime(j.runTime||0)));
  cards.appendChild(card('摄食热量', j.caloriesConsumed + ' Cal'));
  cards.appendChild(card('携带物品', (j.items||[]).length + ' 件'));
  cards.appendChild(card('已解锁配方', ((j.savedRecipeData||{}).saved||[]).filter(function(x){return x.Item1;}).length + ' / ' + ((j.savedRecipeData||{}).saved||[]).length));
  cards.appendChild(card('作弊标记', j.cheatedSave ? '已标记' : '无作弊', j.cheatedSave));
  cards.appendChild(card('佣兵局', j.isMercRun ? '是' : '否'));
  root.appendChild(cards);

  var PRESETS = [
    {t:'伤势全愈', f:function(){ (S.save.limbs||[]).forEach(function(l){
        l.skinHealth=100; l.muscleHealth=100; l.pain=0; l.bleedAmount=0; l.infectionAmount=0;
        l.broken=false; l.splinted=false; l.dislocated=false; l.infected=false;
        l.shrapnel=0; l.blockedBleeding=false; l.dismembered=false; l.dislocationTimer=0; l.boneHealTimer=0;
      }); }},
    {t:'状态拉满', f:function(){ var b=S.save.body;
        ['hunger','thirst','stamina','energy','bloodOxygen','bloodVolume','consciousness','brainHealth','immunity'].forEach(function(k){ if (k in b) b[k]=100; });
        if ('temperature' in b) b.temperature=37; if ('shock' in b) b.shock=0; if ('painShock' in b) b.painShock=0; }},
    {t:'疾病清零', f:function(){ var b=S.save.body;
        ['sicknessAmount','radiationSickness','septicShock','internalBleeding','hemothorax','strokeAmount','brainGrowSickness','venomTotal','venomCurrent','venomFake','fibrillationProgress','hearingLoss','traumaAmount','wetness','dirtyness'].forEach(function(k){ if (k in b) b[k]=0; }); }},
    {t:'耐久全满', f:function(){ (S.save.items||[]).forEach(function(it){ it.condition=1; }); }},
    {t:'解锁配方', f:function(){ var s=(S.save.savedRecipeData||{}).saved; if (s) s.forEach(function(x){ x.Item1=true; }); }},
    {t:'技能 +5', f:function(){ var sk=S.save.body.skills; ['STR','RES','INT'].forEach(function(k){ if (k in sk) sk[k]=(sk[k]||0)+5; }); }},
    {t:'撤销全部', f:function(){ S.save = JSON.parse(JSON.stringify(S.orig)); }}
  ];
  var bar = h('div', {class:'btnrow'});
  PRESETS.forEach(function(p){
    bar.appendChild(h('button', {class:'btn', text:p.t, onclick:function(){ p.f(); toast('已应用：' + p.t); renderPanel(); refreshFooter(); }}));
  });
  root.appendChild(panel('一键预设', PRESETS.length + ' 项',
    [bar, h('p', {class:'hint', style:'margin:10px 0 0', text:'当前有 ' + changeCount() + ' 处改动未保存'})]));
};

/* ================= 物品 ================= */
function getWaterComp(i){
  var c = (S.save.itemComponents || [])[i];
  if (!c) return null;
  if (c[WATERCOMP]) return { comp:c[WATERCOMP], key:WATERCOMP };
  for (var k in c) if (k.indexOf('WaterContainerItem') === 0) return { comp:c[k], key:k };
  return null;
}
/* 列表与瓦片上的"耐久"：液体容器的 condition 是装填率（= 液体总量 / 容量），
   直接显示 x/y ml 才和游戏内一致；其余物品显示百分比。 */
function fillLabel(i){
  var it = (S.save.items || [])[i];
  if (!it) return '';
  if (isLiquidVessel(it.id)){
    var w = getWaterComp(i), st = (w && w.comp && w.comp.stack) || [];
    var cap = itemCapacity(it.id);
    var t = st.reduce(function(a, x){ return a + (x.amount || 0); }, 0);
    return Math.round(t) + (cap != null ? '/' + cap : '') + ' ml';
  }
  return Math.round(it.condition * 100) + '%';
}
function removeItems(kill){
  var j = S.save, ki = [], kc = [];
  (j.items||[]).forEach(function(it, i){ if (kill[i]) return; ki.push(it); kc.push((j.itemComponents||[])[i] || {}); });
  j.items = ki; j.itemComponents = kc;
}

Panels.items = function(root){
  var items = S.save.items || [];

  function gkey(it){ return it.slot >= 0 ? ('s'+it.slot) : (it.wearSlot ? ('w'+it.wearSlot) : null); }
  var perGroup = {};
  items.forEach(function(it, i){ var k = gkey(it); if (k) (perGroup[k] = perGroup[k] || []).push(i); });
  function groupOf(i){ var k = gkey(items[i]); return k ? perGroup[k] : [i]; }
  function isHead(i){ return groupOf(i)[0] === i; }
  function childrenOf(i){ return isHead(i) ? groupOf(i).slice(1) : []; }

  if (S.sel == null || S.sel >= items.length) S.sel = items.length ? 0 : null;

  var wrap = h('div', {class:'inv3'});

  /* ---- 左：径向六槽（六片半圆贴图拼环） + 穿戴 ---- */
  var left = h('div');
  var slotIdx = {};
  items.forEach(function(it, i){ if (it.slot >= 0 && !(it.slot in slotIdx)) slotIdx[it.slot] = i; });
  // 六片半圆素材是同一段圆弧的六次旋转；圆心相对各片左上角的偏移由像素半径拟合得出（内≈45 外≈92 像素）
  var WEDGES = [
    {s:2, img:'radialUp',        a:0,   w:91, h:48, ox:45.5, oy:89.0},
    {s:1, img:'radialUpRight',   a:60,  w:66, h:78, ox:-24.0, oy:76.5},
    {s:5, img:'radialDownRight', a:120, w:66, h:80, ox:-25.0, oy:0.5},
    {s:4, img:'radialDown',      a:180, w:92, h:50, ox:46.0, oy:-41.0},
    {s:3, img:'radialDownLeft',  a:240, w:68, h:81, ox:92.0, oy:0.0},
    {s:0, img:'radialUpLeft',    a:300, w:68, h:80, ox:92.0, oy:78.5}
  ];
  var SCALE = 2, STAGE = 368, R_MID = 67.0;
  var selHead = (S.sel != null && items[S.sel]) ? groupOf(S.sel)[0] : null;
  var stage = h('div', {class:'radialstage'});
  stage.style.width = STAGE + 'px';
  stage.style.height = STAGE + 'px';
  stage.appendChild(h('div', {class:'radialplate'}));

  WEDGES.forEach(function(wd){
    var idx = slotIdx[wd.s];
    var on = idx != null && selHead === idx;
    var wedge = h('div', {
      class:'wedge' + (idx == null ? ' empty' : '') + (on ? ' on' : ''),
      style:'left:' + (STAGE/2 - wd.ox*SCALE) + 'px;top:' + (STAGE/2 - wd.oy*SCALE) + 'px;'
          + 'width:' + (wd.w*SCALE) + 'px;height:' + (wd.h*SCALE) + 'px',
      title: slotLabel(wd.s) + (slotLimb(wd.s) ? ' · ' + slotLimb(wd.s) : ''),
      onclick:function(){
        if (idx == null){ toast(slotLabel(wd.s) + ' 是空的'); return; }
        S.sel = idx; renderPanel();
      }
    });
    var wedgeArt = ART.user[wd.img];
    if (wedgeArt) wedge.appendChild(h('img', {src: wedgeArt, alt:''}));

    var rad = wd.a * Math.PI / 180;
    var mx = STAGE/2 + Math.sin(rad) * R_MID * SCALE;
    var my = STAGE/2 - Math.cos(rad) * R_MID * SCALE;
    stage.appendChild(wedge);
    stage.appendChild(h('div', {class:'wface', style:'left:' + mx + 'px;top:' + my + 'px'},
      idx != null ? iconBox(items[idx].id, 32) : h('span', {class:'x', text:'空'}),
      h('span', {class:'sl', text: slotLabel(wd.s)}),
      idx != null ? h('span', {class:'du', text: fillLabel(idx)}) : null));
  });

  stage.appendChild(h('div', {class:'radialcore'},
    h('div', {class:'coretitle', text:'物品栏'}),
    h('div', {class:'coresub', text: items.length + ' 件'})));

  left.appendChild(h('div', {class:'panel'},
    h('div', {class:'ph'}, h('span', {class:'t', text:'槽位'}), h('span', {class:'n', text: HAND_SLOTS + ' 个'})),
    h('div', {class:'pb', style:'padding:10px 0 0'}, stage)));

  var wear = {};
  items.forEach(function(it, i){ if (it.slot < 0 && it.wearSlot){ (wear[it.wearSlot] = wear[it.wearSlot] || []).push(i); } });
  var wgrid = h('div', {class:'tiles'});
  var woreOrder = (DB.meta.wearSlots || []).map(function(w){ return w.id; });
  Object.keys(wear).sort(function(a,b){ return woreOrder.indexOf(a) - woreOrder.indexOf(b); }).forEach(function(wid){
    var head = wear[wid][0];
    wgrid.appendChild(h('button', {class:'tile' + (selHead === head ? ' on' : ''),
      title: wearSlotName(wid), onclick:function(){ S.sel = head; renderPanel(); }},
      iconBox(items[head].id, 30),
      h('span', {class:'tn', text: wearSlotName(wid)}),
      wear[wid].length > 1 ? h('span', {class:'tbadge warn', text:'+' + (wear[wid].length - 1)}) : null));
  });
  if (!Object.keys(wear).length) wgrid.appendChild(h('p', {class:'hint', text:'没有穿戴中的物品'}));
  left.appendChild(panel('穿戴', Object.keys(wear).length + ' 位', [wgrid]));
  wrap.appendChild(left);

  /* ---- 中：详情 ---- */
  var mid = h('div');
  if (S.sel != null && items[S.sel]){
    var i = S.sel, it = items[i], head = groupOf(i)[0], hItem = items[head];
    var kids = childrenOf(head);
    var where = it.slot >= 0 ? slotLabel(it.slot) : ('穿戴 · ' + wearSlotName(it.wearSlot));
    var hostName = isHead(i) ? null : itemName(hItem.id);

    mid.appendChild(h('div', {class:'dthead'},
      iconBox(it.id, 40),
      h('div', {class:'dtt'},
        h('div', {class:'dtn', text: itemName(it.id)}),
        h('div', {class:'dti', text: it.id + (itemEn(it.id) ? '  ·  ' + itemEn(it.id) : '')})),
      h('div', {class:'dtwhere', text: where})));

    if (hostName) mid.appendChild(h('div', {class:'note',
      text:'这件物品装在容器「' + hostName + '」里（读档时会被塞进它的 Container）。下面四项改的都是这一件。'}));
    mid.appendChild(h('div', {class:'dtdesc', html: itemDescRich(it.id) || '（无描述）'}));

    var rows = [];
    /* 改动标记：与原始快照逐字段比对，改回原值即消失 */
    var origItem = (S.orig && S.orig.items && S.orig.items[i]) || null;
    function differs(key){
      if (!origItem) return false;
      return JSON.stringify(origItem[key]) !== JSON.stringify(it[key]);
    }
    function paint(row, chg){ row.classList.toggle('changed', !!chg); }
    /* 耐久 / 装填量
       液体容器的 condition 不是耐久，而是"装填率"——游戏在 WaterContainerItem.UpdateCondition()
       里把它算成 CurrentTotal / Capacity（WaterContainerItem.cs:231-234），
       所以这类物品给一个百分比输入没有意义：改成直接填液体体积，再按比例重算每一份液体并同步 condition。 */
    var isVessel = isLiquidVessel(it.id);
    var wcomp = getWaterComp(i);
    var vstack = (wcomp && wcomp.comp && wcomp.comp.stack) || [];
    var vcap = itemCapacity(it.id);
    function vTotal(){ return vstack.reduce(function(a, x){ return a + (x.amount || 0); }, 0); }
    function vPct(){ return vcap ? Math.round(vTotal() / vcap * 1000) / 10 : 0; }
    function syncCondition(){ if (vcap) it.condition = Math.min(1, Math.round(vTotal() / vcap * 10000) / 10000); }
    function setVolume(target){
      if (!vstack.length){ toast('这件容器里还没有液体，先在下方「液体」里添加一种', true); return false; }
      var cur = vTotal();
      if (cur <= 0) vstack.forEach(function(s, k){ s.amount = k === 0 ? target : 0; });
      else {
        var k = target / cur;
        vstack.forEach(function(s){ s.amount = Math.round((s.amount || 0) * k * 100) / 100; });
      }
      syncCondition();
      return true;
    }
    var condRow;
    if (isVessel){
      var volIn = h('input', {type:'number', min:'0', max: vcap != null ? String(vcap) : null, step:'1', value:String(Math.round(vTotal()))});
      var volTag = h('span', {class:'tag', text:'/ ' + (vcap != null ? vcap : '?') + ' ml（' + vPct() + '%）'});
      condRow = fieldRow('装填量', 'condition = 液体总量 / 容量', h('div', {class:'ctl'}, volIn, volTag), '');
      volIn.addEventListener('change', function(){
        var v = parseFloat(volIn.value);
        if (isNaN(v)){ volIn.value = String(Math.round(vTotal())); return; }
        if (vcap != null) v = Math.min(vcap, v);
        if (!setVolume(Math.max(0, v))){ volIn.value = String(Math.round(vTotal())); return; }
        volIn.value = String(Math.round(vTotal()));
        volTag.textContent = '/ ' + (vcap != null ? vcap : '?') + ' ml（' + vPct() + '%）';
        paint(condRow, differs('condition')); refreshFooter();
      });
    } else {
      var pct = Math.round(it.condition * 1000) / 10;
      var condIn = h('input', {type:'number', min:'0', max:'100', step:'0.1', value:String(pct)});
      condRow = fieldRow('耐久', 'condition', h('div', {class:'ctl'}, condIn, h('span', {class:'tag', text:'%'})), '');
      condIn.addEventListener('change', function(){
        var v = parseFloat(condIn.value); if (isNaN(v)) return;
        v = Math.max(0, Math.min(100, v)); it.condition = Math.round(v * 10) / 1000; condIn.value = String(v);
        paint(condRow, differs('condition')); refreshFooter();
      });
    }
    paint(condRow, differs('condition'));
    rows.push(condRow);
    /* 位置 */
    var slotOpts = [];
    for (var s2 = 0; s2 < HAND_SLOTS; s2++) slotOpts.push({value:'s'+s2, label: slotLabel(s2)});
    var slotsMeta = (DB.meta.wearSlots || []).slice();
    items.forEach(function(x){ if (x.wearSlot && !slotsMeta.some(function(w){return w.id===x.wearSlot;})) slotsMeta.push({id:x.wearSlot, label:x.wearSlot}); });
    slotsMeta.forEach(function(w){ slotOpts.push({value:'w:'+w.id, label:'穿戴 · ' + (w.label||w.id)}); });
    var posSel = h('select');
    slotOpts.forEach(function(o){
      var op = h('option', {value:o.value, text:o.label});
      var cur = it.slot >= 0 ? 's'+it.slot : 'w:'+it.wearSlot;
      if (o.value === cur) op.selected = true;
      posSel.appendChild(op);
    });
    var posRow = fieldRow('位置', 'slot / wearSlot', h('div', {class:'ctl'}, posSel), '');
    posSel.addEventListener('change', function(){
      var v = posSel.value;
      if (v.charAt(0) === 's'){ it.slot = parseInt(v.slice(1)); it.wearSlot = null; }
      else { it.slot = -1; it.wearSlot = v.slice(2); }
      paint(posRow, differs('slot') || differs('wearSlot'));
      refreshFooter();
      toast('位置已改为 ' + (it.slot >= 0 ? slotLabel(it.slot) : wearSlotName(it.wearSlot)));
    });
    paint(posRow, differs('slot') || differs('wearSlot'));
    rows.push(posRow);
    /* 收藏 + 颜色 */
    var fav = h('input', {type:'checkbox', checked: it.favourited});
    var favRow = null;
    fav.addEventListener('change', function(){
      it.favourited = fav.checked;
      if (favRow) paint(favRow, differs('favourited') || differs('swatch'));
      refreshFooter();
    });
    var chips = h('div', {class:'swatches'});
    SWATCHES.forEach(function(sw){
      var c = h('button', {class:'chip' + ((it.swatch|0)===sw.i ? ' on':''), style:'background:'+sw.hex, title:'#'+sw.i+' '+sw.name,
        onclick:function(){
          it.swatch = sw.i;
          var all = chips.querySelectorAll('.chip');
          for (var q=0;q<all.length;q++) all[q].classList.toggle('on', +all[q].dataset.i === sw.i);
          if (favRow) paint(favRow, differs('favourited') || differs('swatch'));
          refreshFooter();
        }});
      c.dataset.i = sw.i; chips.appendChild(c);
    });
    favRow = fieldRow('收藏 / 颜色', 'favourited / swatch',
      h('div', {class:'ctl'}, h('label', {class:'sw'}, fav, h('span')), chips), '');
    paint(favRow, differs('favourited') || differs('swatch'));
    rows.push(favRow);
    /* 自定义名 */
    var lab = h('input', {type:'text', value: it.label || '', placeholder:'（无）'});
    var labRow = fieldRow('自定义名', 'label', h('div', {class:'ctl'}, lab), '');
    lab.addEventListener('change', function(){
      it.label = lab.value;
      paint(labRow, differs('label'));
      refreshFooter();
    });
    paint(labRow, differs('label'));
    rows.push(labRow);
    /* 液体 */
    if (isVessel){
      var tot = vTotal();
      var liq = h('div', {class:'ctl'},
        h('div', {class:'liqline' + (vcap && tot > vcap ? ' over' : '')},
          vstack.length
            ? vstack.map(function(x){ return h('span', {class:'liqchip'}, h('span', {class:'dot', style:'background:'+liquidColor(x.liquidId)}), liquidName(x.liquidId) + ' ' + Math.round(x.amount)); })
            : h('span', {class:'tag', text:'空'}),
          h('span', {class:'tag', text: Math.round(tot) + (vcap ? '/' + vcap : '') + ' ml'})),
        h('button', {class:'btn sm', text:'编辑', onclick:function(){ liquidDialog(i); }}));
      rows.push(fieldRow('液体', 'WaterContainerItem.stack', liq, ''));
    }
    mid.appendChild(panel('详细参数', rows.length + ' 项', rows));

    /* 容器内容 */
    if (kids.length){
      var kl = h('div', {class:'list'});
      kids.forEach(function(ci){
        kl.appendChild(h('div', {
          class:'lrow clickable' + (S.sel === ci ? ' on' : ''),
          title:'点一下编辑这件物品（耐久 / 位置 / 颜色 / 名称 / 液体）',
          onclick:function(){ S.sel = ci; renderPanel(); }
        },
          iconBox(items[ci].id),
          h('span', {class:'ln', text: itemName(items[ci].id)}),
          h('span', {class:'li', text: items[ci].id}),
          h('span', {class:'lv', text: fillLabel(ci)}),
          h('button', {class:'btn sm', text:'✕', title:'从容器中移除',
            onclick:function(ev){ if (ev && ev.stopPropagation) ev.stopPropagation(); var k={}; k[ci]=1; removeItems(k); toast('已移除'); S.sel = head; renderPanel(); refreshFooter(); }})));
      });
      mid.appendChild(panel('容器内容', kids.length + ' 件',
        [kl, h('p', {class:'hint', style:'margin:8px 0 0', text:'点一行即可编辑容器里的这件物品；✕ 从容器中移除。'})]));
    }
    var ops = h('div', {class:'btnrow'});
    if (!isHead(i)) ops.appendChild(h('button', {class:'btn', text:'← 回到「' + itemName(hItem.id) + '」',
      onclick:function(){ S.sel = head; renderPanel(); }}));
    if (isVessel){
      ops.appendChild(h('button', {class:'btn', text:'装满液体', onclick:function(){
        if (vcap == null){ toast('这件物品的容量未知，无法自动装满', true); return; }
        if (!vstack.length){ toast('先在「液体」里添加一种液体', true); return; }
        setVolume(vcap); toast('已装满'); renderPanel(); refreshFooter();
      }}));
    } else {
      ops.appendChild(h('button', {class:'btn', text:'耐久满', onclick:function(){ it.condition = 1; renderPanel(); refreshFooter(); }}));
    }
    ops.appendChild(h('button', {class:'btn', text:'删除此物品', onclick:function(){
      var kk = {}; kk[i] = 1;
      var kidsToKill = isHead(i) ? childrenOf(i) : [];
      if (kidsToKill.length && confirm('这个槽位里还有 ' + kidsToKill.length + ' 件物品在它的容器中。\n确定 = 一起删除；取消 = 只删这一件')) kidsToKill.forEach(function(x){ kk[x] = 1; });
      removeItems(kk); S.sel = null; toast('已删除'); renderPanel(); refreshFooter();
    }}));
    mid.appendChild(panel('操作', null, [ops]));
  } else {
    mid.appendChild(panel('详细参数', null, [h('div', {class:'empty', text:'左侧点一个槽位或穿戴位查看物品'})]));
  }
  wrap.appendChild(mid);

  /* ---- 右：添加物品 ---- */
  var right = h('div', {class:'invright'});
  var q = h('input', {type:'search', placeholder:'搜索物品以添加…'});
  var condAdd = h('input', {type:'number', min:'0', max:'100', step:'1', value:'100'});
  var targetSel = h('select');
  for (var s3 = 0; s3 < HAND_SLOTS; s3++){
    var occ = items.some(function(x){ return x.slot === s3; });
    targetSel.appendChild(h('option', {value:'s'+s3, text: slotLabel(s3) + (occ ? '（已占用）' : '（空）')}));
  }
  (DB.meta.wearSlots || []).forEach(function(w){
    targetSel.appendChild(h('option', {value:'w:'+w.id, text:'穿戴 · ' + (w.label||w.id)}));
  });
  var hostable = [];
  items.forEach(function(x, i){ if (DB.containers && DB.containers.containerIds && DB.containers.containerIds.indexOf(x.id) >= 0) hostable.push({i:i, it:x}); });
  if (hostable.length){
    var og = h('optgroup', {label:'放进已有容器'});
    hostable.forEach(function(o){
      var where = o.it.slot >= 0 ? slotLabel(o.it.slot) : ('穿戴 · ' + wearSlotName(o.it.wearSlot));
      og.appendChild(h('option', {value:'c'+o.i, text:'容器内 · ' + itemName(o.it.id) + '（' + where + '）'}));
    });
    targetSel.appendChild(og);
  }

  var sortSel = h('select');
  [['name','按名字'],['size','按图标大小'],['cat','按分类']].forEach(function(o){ sortSel.appendChild(h('option', {value:o[0], text:o[1]})); });

  var list = h('div', {class:'list'});
  var picked = null;
  var cnt = h('span', {class:'tag'});

  function renderAdd(){
    clear(list);
    var kw = (q.value||'').trim().toLowerCase();
    var arr = DB.items.filter(function(it){
      return !kw || (it.name && it.name.indexOf(kw) >= 0) || it.id.toLowerCase().indexOf(kw) >= 0 || (it.nameEn && it.nameEn.toLowerCase().indexOf(kw) >= 0);
    });
    if (sortSel.value === 'size') arr = arr.slice().sort(function(a,b){ return (b.weight||0) - (a.weight||0); });
    else if (sortSel.value === 'cat') arr = arr.slice().sort(function(a,b){ return String(a.category).localeCompare(String(b.category)) || a.id.localeCompare(b.id); });
    else arr = arr.slice().sort(function(a,b){ return a.id.localeCompare(b.id); });
    var shown = arr.slice(0, 400);
    shown.forEach(function(it){
      list.appendChild(h('div', {class:'lrow' + (picked === it.id ? ' on' : ''), title: stripTags(it.desc) || it.id,
        onclick:function(){ picked = it.id; clear(list); renderAdd(); }},
        iconBox(it.id),
        h('span', {class:'ln', text: it.name || it.id}),
        h('span', {class:'li', text: it.id}),
        h('span', {class:'lv', text: it.weight != null ? it.weight + 'u' : ''})));
    });
    if (!shown.length) list.appendChild(h('p', {class:'hint', text:'没有匹配的物品'}));
    else if (arr.length > shown.length) list.appendChild(h('p', {class:'hint', text:'还有 ' + (arr.length - shown.length) + ' 条未显示，请再输入关键字'}));
    cnt.textContent = '显示 ' + shown.length + ' / ' + DB.items.length;
  }
  q.addEventListener('input', renderAdd);
  sortSel.addEventListener('change', renderAdd);

  var addBtn = h('button', {class:'btn primary', text:'确认添加', onclick:function(){
    if (!picked){ toast('先在下方列表里选一个物品', true); return; }
    var v = targetSel.value;
    /* 液体容器的 condition 是装填率：新加的容器一律按"空瓶"入库（condition=0 + 空 stack），
       想装什么去详情页的「液体」里加 —— 这样不会出现"耐久 100% 但一滴水没有"的自相矛盾档。 */
    var pickedIsVessel = isLiquidVessel(picked);
    var pctIn = Math.round(Math.max(0, Math.min(100, parseFloat(condAdd.value)||100)) * 10) / 1000;
    var item = {id:picked, condition: pickedIsVessel ? 0 : pctIn,
                slot:-1, wearSlot:null, favourited:false, label:'', swatch:0};
    var newComp = {};
    if (pickedIsVessel) newComp[WATERCOMP] = {stack:[]};
    var comps2 = (S.save.itemComponents = S.save.itemComponents || []);
    if (v.charAt(0) === 's'){ item.slot = parseInt(v.slice(1)); }
    else if (v.charAt(0) === 'w'){ item.wearSlot = v.slice(1); }
    else {
      var pi = parseInt(v.slice(1)), parent = S.save.items[pi];
      if (!parent){ toast('宿主已不存在', true); return; }
      item.slot = parent.slot; item.wearSlot = parent.wearSlot;
      S.save.items.splice(pi+1, 0, item); comps2.splice(pi+1, 0, newComp);
      S.sel = pi+1; toast('已放进 ' + itemName(parent.id) + ' 的容器' + (pickedIsVessel ? '（空容器）' : ''));
      renderPanel(); refreshFooter(); return;
    }
    S.save.items.push(item); comps2.push(newComp);
    S.sel = S.save.items.length - 1;
    toast('已添加：' + itemName(picked) + (pickedIsVessel ? '（空容器，去「液体」里装）' : ''));
    renderPanel(); refreshFooter();
  }});

  right.appendChild(panel('添加物品', null, [
    toolRow(q),
    fieldRow('耐久', 'condition', h('div', {class:'ctl'}, condAdd, h('span', {class:'tag', text:'%'})), ''),
    fieldRow('放到', '槽位 / 容器', h('div', {class:'ctl'}, targetSel), ''),
    h('p', {class:'hint', style:'margin:6px 0 0', text:'液体容器（水瓶 / 注射器 / 汽水罐…）的耐久就是装填率，添加时按空容器入库，装液体请到详情页。'}),
    h('div', {class:'btnrow', style:'margin-top:10px'}, addBtn)]));
  right.appendChild(panel('全部物品', null, [toolRow(sortSel, cnt), list]));
  wrap.appendChild(right);

  root.appendChild(wrap);
  renderAdd();
};

function liquidDialog(i){
  var it = S.save.items[i], cap = itemCapacity(it.id);
  var overlay = h('div', {class:'overlay'});
  function close(){ if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }
  var body = h('div', {class:'mb'});
  function rowsText(stack){
    var t = stack.reduce(function(a,x){ return a + (x.amount||0); }, 0);
    return '合计 ' + Math.round(t) + (cap ? ' / 容量 ' + cap + ' ml（' + (Math.round(t / cap * 1000) / 10) + '%）' : ' ml')
      + (cap && t > cap ? '　⚠ 超出容量' : '') + '　·　耐久（装填率）随液体自动同步';
  }
  function redraw(){
    clear(body);
    var w = getWaterComp(i);
    if (!w && isLiquidVessel(it.id)){
      body.appendChild(h('div', {class:'note', text:'这件物品在游戏里能装液体，但存档里没有它的液体组件记录。创建后耐久会置 0（液体容器的耐久就是装填率）。'}));
      body.appendChild(h('div', {class:'btnrow'},
        h('button', {class:'btn', text:'创建液体组件', onclick:function(){
          var cs = (S.save.itemComponents = S.save.itemComponents || []);
          cs[i] = cs[i] || {}; cs[i][WATERCOMP] = {stack:[]};
          it.condition = 0;
          refreshFooter(); rerenderKeepScroll(); redraw();
        }})));
      return;
    }
    if (!w){ body.appendChild(h('div', {class:'note', text:'这件物品不是液体容器。'})); return; }
    var stack = w.comp.stack = (w.comp.stack || []);
    function totalNow(){ return stack.reduce(function(a, x){ return a + (x.amount || 0); }, 0); }
    function syncCond(){
      if (!cap) return;
      it.condition = Math.min(1, Math.round(totalNow() / cap * 10000) / 10000);
    }
    /* 弹窗里的任何改动都要让后面的详情/圆盘/列表当场跟着变（不再需要切页才刷新） */
    function afterChange(){ refreshFooter(); rerenderKeepScroll(); }
    var tot = h('p', {class:'hint', text: rowsText(stack)});
    body.appendChild(tot);
    stack.forEach(function(s, idx){
      var sel = h('select');
      DB.liquids.forEach(function(l){ var op = h('option', {value:l.id, text:(l.name||l.id)}); if (l.id===s.liquidId) op.selected = true; sel.appendChild(op); });
      if (!DB.liquidById[s.liquidId]){ var op2 = h('option', {value:s.liquidId, text:s.liquidId+'（未知）'}); op2.selected = true; sel.appendChild(op2); }
      var dot = h('span', {class:'dot', style:'background:'+liquidColor(s.liquidId)});
      sel.addEventListener('change', function(){ s.liquidId = sel.value; dot.style.background = liquidColor(s.liquidId); tot.textContent = rowsText(stack); afterChange(); });
      var amt = h('input', {type:'number', step:'1', value:String(s.amount)});
      amt.addEventListener('change', function(){
        var v = parseFloat(amt.value); if (isNaN(v)) return;
        s.amount = Math.max(0, v); syncCond();
        tot.textContent = rowsText(stack); afterChange();
      });
      body.appendChild(h('div', {class:'lrow'}, dot, sel, amt, h('span', {class:'lv', text:'ml'}),
        h('button', {class:'btn sm', text:'✕', onclick:function(){ stack.splice(idx,1); syncCond(); afterChange(); redraw(); }})));
    });
    if (!stack.length) body.appendChild(h('p', {class:'hint', text:'（空）'}));
    body.appendChild(h('div', {class:'btnrow', style:'margin-top:12px'},
      h('button', {class:'btn', text:'＋ 添加一种液体', onclick:function(){
        var used = stack.reduce(function(a,x){ return a + (x.amount||0); }, 0);
        var left = cap ? Math.max(0, Math.round(cap - used)) : 100;
        stack.push({liquidId:'water', amount: left || 100});
        syncCond(); afterChange(); redraw();
      }})));
  }
  overlay.appendChild(h('div', {class:'modal'},
    h('div', {class:'mh'},
      h('span', {class:'t', text:'液体内容 · ' + itemName(it.id)}),
      h('span', {class:'n', text: it.id + (cap ? '  ·  容量 ' + cap + ' ml' : '  ·  容量未知')})),
    body,
    h('div', {class:'mf'}, h('button', {class:'btn', text:'关闭', onclick:close}))));
  overlay.addEventListener('click', function(e){ if (e.target === overlay) close(); });
  document.body.appendChild(overlay);
  redraw();
}

/* ================= 肢体（剪影热区） ================= */
var LIMB_HOT = [
  {i:0,  x:50, y:15, n:'头部'},   {i:1,  x:50, y:31, n:'胸部'},  {i:2,  x:50, y:45, n:'腹部'},
  {i:3,  x:33, y:31, n:'右上臂'}, {i:4,  x:19, y:31, n:'右前臂'}, {i:5,  x:7,  y:31, n:'右手'},
  {i:6,  x:66, y:31, n:'左上臂'}, {i:7,  x:80, y:31, n:'左前臂'}, {i:8,  x:93, y:31, n:'左手'},
  {i:9,  x:42, y:60, n:'右大腿'}, {i:10, x:42, y:75, n:'右小腿'}, {i:11, x:42, y:86, n:'右脚'},
  {i:12, x:57, y:60, n:'左大腿'}, {i:13, x:57, y:75, n:'左小腿'}, {i:14, x:57, y:86, n:'左脚'}
];
var LIMB_LABELS = {
  skinHealth:'皮肤健康', muscleHealth:'肌肉健康', dislocated:'脱臼', broken:'骨折', splinted:'已固定',
  infected:'已感染', infectionAmount:'感染度', pain:'疼痛', bleedAmount:'出血量',
  dislocationTimer:'脱臼计时', boneHealTimer:'骨骼愈合计时', blockedBleeding:'出血已止住',
  shrapnel:'异物/弹片', furBloodAmount:'毛发血污', disinfectionTime:'消毒计时',
  bandageSlowAmount:'绷带减缓', skinHealAmount:'皮肤愈合量', dismembered:'已截断', prostheticInfo:'假肢信息'
};

Panels.limbs = function(root){
  if (S.sel == null || S.sel > 20) S.sel = 0;
  var limbs = S.save.limbs || [];
  var wrap = h('div', {class:'split'});

  var stage = h('div', {class:'bodystage'});
  stage.appendChild(h('img', {src: ART.user.experimentBody || '', class:'bodyimg', alt:''}));
  LIMB_HOT.forEach(function(p){
    var m = limbMeta(p.i);
    var lm = limbs[p.i] || {};
    var bad = lm.broken || lm.dislocated || lm.dismembered || lm.infected || (lm.pain||0) > 20 || (lm.bleedAmount||0) > 0;
    stage.appendChild(h('button', {
      class:'hot' + (S.sel === p.i ? ' on' : '') + (bad ? ' hurt' : ''),
      style:'left:' + p.x + '%;top:' + p.y + '%',
      title: (m.label || p.n) + '  ·  皮肤 ' + Math.round(lm.skinHealth||0) + '%  肌肉 ' + Math.round(lm.muscleHealth||0) + '%',
      onclick:function(){ S.sel = p.i; renderPanel(); }
    }, h('span', {class:'hn', text: m.label || p.n})));
  });
  wrap.appendChild(h('div', {},
    h('h2', {class:'ptitle', text:'肢体损伤'}),
    h('p', {class:'sub', text:'可以点击兽体上的部位查看/修改该肢体。红点=有伤（骨折/脱臼/感染/疼痛/出血）。'}),
    panel('人体图', '15 部位', [stage])));

  var right = h('div');
  var idx = S.sel, lm = limbs[idx] || {}, meta = limbMeta(idx);
  right.appendChild(h('div', {class:'dthead'},
    h('div', {class:'dtt'},
      h('div', {class:'dtn', text: meta.label || ('肢体 #' + idx)}),
      h('div', {class:'dti', text:'limbs[' + idx + ']' + (meta.limb ? '  ·  ' + meta.limb : '') + (meta.isVital ? '  ·  要害' : '')})),
    h('div', {class:'dtwhere'},
      (lm.broken ? '骨折 ' : '') + (lm.dislocated ? '脱臼 ' : '') + (lm.infected ? '感染 ' : '') + (lm.dismembered ? '截断 ' : ''))));

  var rows = [];
  Object.keys(lm).forEach(function(k){
    var v = lm[k];
    if (v === null || typeof v === 'object') return;
    var ctl, unit = '';
    if (typeof v === 'boolean'){ ctl = fBool(['limbs', idx, k]); unit = 'bool'; }
    else if (typeof v === 'string'){ ctl = fText(['limbs', idx, k]); unit = 'string'; }
    else {
      var isInt = Number.isInteger(v);
      ctl = fNumber(['limbs', idx, k], {step: isInt ? 1 : 0.01, int:isInt});
      unit = isInt ? 'int' : 'float';
    }
    var row = fieldRow(LIMB_LABELS[k] || k, k, ctl, unit);
    if (isChanged(['limbs', idx, k])) row.classList.add('changed');
    rows.push(row);
  });
  right.appendChild(panel('详细参数', rows.length + ' 项', rows));

  var bar = h('div', {class:'btnrow'});
  bar.appendChild(h('button', {class:'btn', text:'这个部位治好', onclick:function(){
    var l = limbs[idx];
    l.skinHealth = 100; l.muscleHealth = 100; l.pain = 0; l.bleedAmount = 0; l.infectionAmount = 0;
    l.broken = false; l.splinted = false; l.dislocated = false; l.infected = false;
    l.shrapnel = 0; l.blockedBleeding = false; l.dismembered = false;
    renderPanel(); refreshFooter();
  }}));
  bar.appendChild(h('button', {class:'btn', text:'全部治好', onclick:function(){
    (S.save.limbs||[]).forEach(function(l){
      l.skinHealth = 100; l.muscleHealth = 100; l.pain = 0; l.bleedAmount = 0; l.infectionAmount = 0;
      l.broken = false; l.splinted = false; l.dislocated = false; l.infected = false;
      l.shrapnel = 0; l.blockedBleeding = false; l.dismembered = false;
    });
    renderPanel(); refreshFooter();
  }}));
  right.appendChild(panel('快捷操作', null, [bar]));
  wrap.appendChild(right);
  root.appendChild(wrap);
};

/* ================= 医疗面板（分组卡片 + 标准字段行） ================= */
Panels.body = function(root){
  var b = S.save.body || {};
  root.appendChild(h('h2', {class:'ptitle', text:'医疗面板'}));
  root.appendChild(h('p', {class:'sub', text:'这里有在游戏医疗面板中中看不见的数值'}));

  var cards = h('div', {class:'cards'});
  cards.appendChild(card('角色类型', charTypeName(S.save.character)));
  cards.appendChild(card('身高', S.save.cHeight + ' cm'));
  cards.appendChild(card('年龄', S.save.cAge + ' y'));
  cards.appendChild(card('编号', '#' + S.save.cId));
  root.appendChild(cards);

  var blocks = {}, order = [];
  Object.keys(b).forEach(function(k){
    if (k === 'skills') return;
    var m = fieldMeta(k) || {};
    var g = m.group || '其他';
    if (!blocks[g]){ blocks[g] = []; order.push(g); }
    blocks[g].push(k);
  });

  var grid = h('div', {class:'vgrid'});
  order.forEach(function(g){
    var rows = blocks[g].map(function(k){
      var m = fieldMeta(k) || {};
      var v = b[k];
      if (typeof v === 'boolean') return fieldRow(m.label || k, k, fBool(['body', k]), 'bool');
      var ctl = fNumber(['body', k], {
        min: m.min, max: m.max,
        int: m.csharpType === 'int',
        step: m.csharpType === 'int' ? 1 : 0.01
      });
      var row = fieldRow(m.label || k, k, ctl, '');
      if (isChanged(['body', k])) row.classList.add('changed');
      return row;
    });
    grid.appendChild(panel(g, blocks[g].length + ' 项', rows));
  });
  root.appendChild(grid);
};

/* ================= 技能（统一表格） ================= */
function skInput(path, opt){
  opt = opt || {};
  var inp = h('input', {type:'number', step: opt.int ? '1' : '0.01', value:String(getPath(path))});
  inp.addEventListener('change', function(){
    var v = parseFloat(inp.value);
    if (isNaN(v)){ inp.value = String(getPath(path)); return; }
    if (opt.int) v = Math.round(v);
    setPath(path, v); inp.value = String(v);
    var r = inp.closest('tr'); if (r) r.classList.toggle('changed', isChanged(path));
    refreshFooter();
  });
  return inp;
}
Panels.skills = function(root){
  var sk = (S.save.body && S.save.body.skills) || {};
  root.appendChild(h('h2', {class:'ptitle', text:'技能'}));
  root.appendChild(h('p', {class:'sub', text:'这里是你的游戏技能树'}));

  var ATTRS = [
    {k:'STR', label:'力量', exp:'expSTR', min:'minSTR', max:'maxSTR', mult:'STRGainMult'},
    {k:'RES', label:'耐力', exp:'expRES', min:'minRES', max:'maxRES', mult:'RESGainMult'},
    {k:'INT', label:'智力', exp:'expINT', min:'minINT', max:'maxINT', mult:'INTGainMult'}
  ];
  var tbody = h('tbody');
  ATTRS.forEach(function(a){
    if (!(a.k in sk)) return;
    tbody.appendChild(h('tr', {},
      h('td', {}, h('span', {class:'mono', style:'color:var(--accent);font-size:13px', text:a.k})),
      h('td', {class:'nm', text:a.label}),
      h('td', {class:'num'}, skInput(['body','skills',a.k], {int:true})),
      h('td', {class:'num'}, skInput(['body','skills',a.exp])),
      h('td', {class:'num'}, skInput(['body','skills',a.min], {int:true})),
      h('td', {class:'num'}, skInput(['body','skills',a.max], {int:true})),
      h('td', {class:'num'}, skInput(['body','skills',a.mult]))));
  });
  var tbl = h('table', {class:'tbl fixed'},
    h('thead', {}, h('tr', {},
      th('属性','colattr'), th('名称'), th('数值','num colnum'), th('经验','num colnum'),
      th('下限','num colnum'), th('上限','num colnum'), th('倍率','num colnum'))),
    tbody);
  root.appendChild(panel('属性与经验', ATTRS.length + ' 属性', [h('div', {class:'tblwrap'}, tbl)]));
};

/* ================= 世界 ================= */
Panels.world = function(root){
  root.appendChild(h('h2', {class:'ptitle', text:'世界与进度'}));
  root.appendChild(h('p', {class:'sub', text:'这里显示游戏进度和基本信息'}));
  var rows = [];
  function num(key, label, opt, unit){
    var row = fieldRow(label, key, fNumber([key], opt || {step:1, int:true}), unit || 'int');
    if (isChanged([key])) row.classList.add('changed');
    rows.push(row);
  }
  num('biome', '层数 biome', {step:1, int:true, min:1});
  num('endlessLoops', '无尽循环');
  num('totalTraveled', '已行进距离', {step:1, int:true}, 'm');
  num('caloriesConsumed', '累计热量');
  num('cHeight', '身高', {step:1, int:true}, 'cm');
  num('cAge', '年龄', {step:1, int:true}, 'y');
  num('cId', '编号');
  num('cVer', '外观版本');
  num('runTime', '游玩时长', {step:1, int:true}, 's');
  num('trapRarity', '陷阱倍率', {step:0.01}, 'float');
  num('lootRarity', '战利品倍率', {step:0.01}, 'float');
  rows.push(fieldRow('角色类型', 'character',
    fSelect(['character'], (DB.meta.charTypes || [{value:0,label:'类型 0'}]).map(function(c){ return {value:c.value, label:c.value + ' · ' + c.label}; }), {numeric:true}), 'int'));
  rows.push(fieldRow('佣兵局', 'isMercRun', fBool(['isMercRun']), 'bool'));
  rows.push(fieldRow('作弊标记', 'cheatedSave', fBool(['cheatedSave']), 'bool'));
  root.appendChild(panel('世界状态', rows.length + ' 项', rows));
  root.appendChild(h('div', {class:'note warn', html:'<b>cheatedSave = true</b> 会让游戏在读档时禁用本次运行的成就。手动改档本身不会被检测。'}));
};

/* ================= 运行设置 ================= */
Panels.settings = function(root){
  var arr = S.save.runSettings || [];
  var byKey = {};
  arr.forEach(function(x){ byKey[x.Item1] = x; });
  var origVal = {};
  ((S.orig && S.orig.runSettings) || []).forEach(function(x){ origVal[x.Item1] = x.Item2; });
  root.appendChild(h('h2', {class:'ptitle', text:'运行设置'}));
  root.appendChild(h('p', {class:'sub', text:'这里是游戏的基本运行设置'}));
  var rows = [], seen = {};
  DB.settings.forEach(function(m){
    var e = byKey[m.key];
    if (!e) return;
    seen[m.key] = 1;
    var row = null;
    function paint(){ if (row) row.classList.toggle('changed', JSON.stringify(origVal[m.key]) !== JSON.stringify(e.Item2)); }
    var ctl;
    if (m.type === 'bool'){
      ctl = switchCtl(!!e.Item2, function(v){ e.Item2 = v; paint(); refreshFooter(); });
    } else if (m.type === 'dropdown'){
      var sel = h('select');
      (m.options || []).forEach(function(o, oi){
        var lab = (m.optionsLabels && m.optionsLabels[oi]) ? (m.optionsLabels[oi] + ' (' + o + ')') : o;
        var op = h('option', {value:String(oi), text:lab});
        if (Number(e.Item2) === oi) op.selected = true;
        sel.appendChild(op);
      });
      sel.addEventListener('change', function(){ var iv = parseInt(sel.value); e.Item2 = (typeof e.Item2 === 'number') ? iv : String(iv); paint(); refreshFooter(); });
      ctl = h('div', {class:'ctl'}, sel);
    } else {
      var inp = h('input', {type:'number', step: m.wholeNum ? '1' : '0.01', value:String(e.Item2)});
      if (m.min != null) inp.min = m.min;
      if (m.max != null) inp.max = m.max;
      inp.addEventListener('change', function(){
        var v = parseFloat(inp.value); if (isNaN(v)) return;
        if (m.min != null) v = Math.max(m.min, v);
        if (m.max != null) v = Math.min(m.max, v);
        e.Item2 = (typeof e.Item2 === 'number') ? v : String(v);
        inp.value = String(v); paint(); refreshFooter();
      });
      ctl = h('div', {class:'ctl'}, inp);
    }
    var rng = (m.min != null && m.max != null) ? (m.min + '~' + m.max) : (m.type === 'bool' ? 'bool' : '');
    row = fieldRow(m.label || m.key, m.key, ctl, (m.postfix || '') + ' ' + rng);
    paint();
    rows.push(row);
  });
  arr.forEach(function(e){
    if (seen[e.Item1]) return;
    var row = null;
    function paint(){ if (row) row.classList.toggle('changed', JSON.stringify(origVal[e.Item1]) !== JSON.stringify(e.Item2)); }
    var ctl;
    if (typeof e.Item2 === 'boolean'){
      ctl = switchCtl(e.Item2, function(v){ e.Item2 = v; paint(); refreshFooter(); });
    } else {
      var i2 = h('input', {type:'number', step:'0.01', value:String(e.Item2)});
      i2.addEventListener('change', function(){ var v = parseFloat(i2.value); if (isNaN(v)) return; e.Item2 = (typeof e.Item2 === 'number') ? v : String(v); paint(); refreshFooter(); });
      ctl = h('div', {class:'ctl'}, i2);
    }
    row = fieldRow(e.Item1, e.Item1, ctl, '未知项');
    paint();
    rows.push(row);
  });
  root.appendChild(panel('全部设置', rows.length + ' / ' + arr.length, rows));
};

/* ================= 配方（统一表格） ================= */
Panels.recipes = function(root){
  var saved = (S.save.savedRecipeData && S.save.savedRecipeData.saved) || [];
  root.appendChild(h('h2', {class:'ptitle', text:'配方进度'}));
  root.appendChild(h('p', {class:'sub', text:'这里有游戏的物品解锁进度'}));

  var q = h('input', {type:'search', placeholder:'搜索产物…'});
  var cnt = h('span', {class:'tag', text: saved.filter(function(x){return x.Item1;}).length + ' / ' + saved.length + ' 已制作'});
  var unlock = h('button', {class:'btn', text:'全部标记已制作', onclick:function(){ saved.forEach(function(x){ x.Item1 = true; }); renderPanel(); refreshFooter(); }});
  var tbody = h('tbody');

  function render(){
    clear(tbody);
    var kw = (q.value||'').trim();
    saved.forEach(function(e, i){
      var m = DB.recipes[i] || {};
      var nm = m.resultName || (m.resultId ? itemName(m.resultId) : ('#' + i));
      if (kw && nm.indexOf(kw) < 0 && String(i).indexOf(kw) < 0 && (m.resultId||'').indexOf(kw) < 0) return;
      var intIn = h('input', {type:'number', step:'1', value:String(e.Item2)});
      intIn.addEventListener('change', function(){ var v = parseInt(intIn.value); if (isNaN(v)) return; e.Item2 = v; refreshFooter(); });
      var ric = itemIcon(m.resultId);
      var rliq = !ric && DB.liquidById[m.resultId];
      var rbox = ric || rliq
        ? (rliq ? h('div', {class:'icon dot', style:'background:' + liquidColor(m.resultId), title:'液体 · ' + liquidName(m.resultId)})
                : iconBox(m.resultId))
        : h('div', {class:'icon', text:'?'});
      var sw = h('input', {type:'checkbox', checked: !!e.Item1});
      sw.addEventListener('change', function(){ e.Item1 = sw.checked; refreshFooter(); });
      tbody.appendChild(h('tr', {},
        h('td', {class:'colico'}, rbox),
        h('td', {class:'nm colname', text:nm}),
        h('td', {class:'mono colid', text: m.resultId || ''}),
        h('td', {class:'num colnum'}, intIn),
        h('td', {class:'colchk'}, h('label', {class:'sw'}, sw, h('span'))),
        h('td', {class:'colfill'})));
    });
  }
  q.addEventListener('input', render);
  render();

  var tbl = h('table', {class:'tbl fixed'},
    h('thead', {}, h('tr', {}, th('', 'colico'), th('产物', 'colname'), th('ID', 'colid'),
      th('INT', 'num colnum'), th('已制作', 'colchk'), th('', 'colfill'))),
    tbody);
  root.appendChild(panel('配方', null, [toolRow(q, cnt, unlock), h('div', {class:'tblwrap'}, tbl)]));
};

/* ================= 原始 JSON ================= */
Panels.json = function(root){
  root.appendChild(h('h2', {class:'ptitle', text:'原始 JSON'}));
  root.appendChild(h('p', {class:'sub', text:'写盘时所有非 ASCII 字符会转成 \\uXXXX（游戏用 Encoding.ASCII 读写）。'}));
  var full = JSON.stringify(S.save, null, 2);
  var cut = full.length > 400000;
  var txt = cut ? full.slice(0, 400000) : full;
  var lines = txt.split('\n');
  var nums = [];
  for (var ln = 1; ln <= lines.length; ln++) nums.push(ln);
  var gutter = h('pre', {class:'jpgut', text: nums.join('\n')});
  var code = h('pre', {class:'jscode', text: txt});
  root.appendChild(panel('save.sv', (full.length/1024).toFixed(1) + ' KB · ' + lines.length + ' 行' + (cut ? '（已截断预览）' : ''),
    [h('div', {class:'jsonview'}, gutter, code)]));
};

/* ================= 校验与导出 ================= */
Panels.export = function(root){
  var v = validate();
  var d = diffAll(S.orig, S.save);
  root.appendChild(h('h2', {class:'ptitle', text:'校验与导出'}));
  root.appendChild(h('p', {class:'sub', text:'共 ' + d.length + ' 处改动 · ' + v.errs.length + ' 个错误 · ' + v.warns.length + ' 个警告'}));

  var notes = h('div');
  if (!v.errs.length && !v.warns.length) notes.appendChild(h('div', {class:'note', text:'结构校验全部通过。'}));
  v.errs.forEach(function(e){ notes.appendChild(h('div', {class:'note bad', text:'错误：' + e.msg})); });
  v.warns.forEach(function(e){ notes.appendChild(h('div', {class:'note warn', text:'警告：' + e.msg})); });
  root.appendChild(panel('校验结果', null, [notes]));

  var tbody = h('tbody');
  d.forEach(function(x){
    tbody.appendChild(h('tr', {},
      h('td', {class:'mono', text:x.path}),
      h('td', {class:'num', style:'color:var(--bad)', text: fmtVal(x.from)}),
      h('td', {class:'mono', style:'text-align:center', text:'→'}),
      h('td', {class:'num', style:'color:var(--good)', text: fmtVal(x.to)})));
  });
  if (d.length){
    root.appendChild(panel('改动清单', d.length + ' 处', [h('div', {class:'tblwrap'},
      h('table', {class:'tbl'}, h('thead', {}, h('tr', {}, th('路径'), th('原值','num'), th(''), th('新值','num'))), tbody))]));
  } else {
    root.appendChild(panel('改动清单', '0 处', [h('p', {class:'hint', text:'没有改动'})]));
  }

  root.appendChild(panel('写盘', null, [
    h('div', {class:'btnrow'},
      h('button', {class:'btn primary', text:'保存到原文件', onclick:function(){ doSave(false); }}),
      h('button', {class:'btn', text:'另存为 save.sv', onclick:function(){ doSave(true); }})),
    h('div', {class:'note warn', html:'写盘前请确认游戏已关闭。游戏读档成功后会<b>删除</b> save.sv。本工具不自动备份 —— 请自己先复制一份。'})
  ]));
};

function fmtVal(v){
  if (v === undefined) return '(无)';
  var s = (typeof v === 'object') ? JSON.stringify(v) : String(v);
  return s.length > 60 ? s.slice(0,60) + '…' : s;
}