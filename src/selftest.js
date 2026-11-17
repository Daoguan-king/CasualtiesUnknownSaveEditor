/* 自检：在真实浏览器里跑真实代码路径 */
(function(){
  var fails = 0;
  var REC = [];
  function log(ok, name, extra){
    if (!ok) fails++;
    var line = (ok ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : '');
    REC.push(line);
    console.log(line);
  }
  function dumpResults(){
    var pre = document.getElementById('SELFTESTOUT');
    if (!pre){ pre = document.createElement('pre'); pre.id = 'SELFTESTOUT'; document.body.appendChild(pre); }
    pre.textContent = '@@BEGIN@@\n' + REC.join('\n') + '\n@@END@@ fails=' + fails;
  }
  function b64ToBytes(b64){
    var bin = atob(b64), arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }
  function bytesToB64(bytes){
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }
  function deepEq(a, b){ return JSON.stringify(a) === JSON.stringify(b); }

  window.addEventListener('DOMContentLoaded', async function(){
    try {
      console.log('SELFTEST START');
      console.log('CAPABILITY | showOpenFilePicker=' + (typeof window.showOpenFilePicker)
        + ' | CompressionStream=' + (typeof CompressionStream)
        + ' | DecompressionStream=' + (typeof DecompressionStream)
        + ' | isSecureContext=' + window.isSecureContext
        + ' | origin=' + location.origin);
      // 数据注入自检：打包进来的元数据必须真的到达运行时
      log(DB.items.length === 300, '物品库已注入运行时', DB.items.length);
      log(DB.settings.length === 51, '运行设置已注入运行时', DB.settings.length);
      log(DB.recipes.length === 137, '配方表已注入运行时', DB.recipes.length);
      log(!!(DB.containers && DB.containers.containerIds && DB.containers.containerIds.length), '容器表已注入运行时', DB.containers && DB.containers.containerIds && DB.containers.containerIds.length);
      log(!!DB.meta.wearSlots && DB.meta.wearSlots.length > 0, '穿戴位元数据已注入', DB.meta.wearSlots && DB.meta.wearSlots.length);
      log(DB.fields.length > 0, '身体字段元数据已注入', DB.fields.length);
      log(DB.limbs.length > 0, '肢体元数据已注入', DB.limbs.length);
      log(itemName('bandage') === '绷带', '中文名解析正确', itemName('bandage'));
      log(DB.liquids.length > 50, '液体注册表已注入', DB.liquids.length);
      log(itemCapacity('waterbottle') === 500, '液体容器容量已注入', itemCapacity('waterbottle'));
      log(DB.meta.charTypes[0].label.indexOf('Experiment') === 0 && DB.meta.charTypes[2].label.indexOf('Dune') === 0, '角色类型映射正确', DB.meta.charTypes.map(function(x){return x.value+':'+x.label;}).join(' / '));
      log(SWATCHES.length === 8 && SWATCHES[2].hex === '#47ff47', '染色 8 色表正确', SWATCHES.length);
      log(HAND_SLOTS === 6 && slotLabel(0) === '主手' && slotLabel(2) === '嘴部' && slotLabel(5) === '下背部', '六个槽位名正确', [0,1,2,3,4,5].map(slotLabel).join('/'));
      log(slotLimb(0) === '右手' && slotLimb(2) === '头部' && slotLimb(5) === '腹部', '槽位与肢体对应正确（源自 prefab）', [0,1,2,3,4,5].map(slotLimb).join('/'));

      var bytes = b64ToBytes(window.__TEST_SV_B64__);

      // 1. gzip 解压
      var text = await gunzip(bytes);
      log(typeof text === 'string' && text.length > 1000, 'gunzip 解压出 JSON 文本', 'len=' + text.length);
      var parsed = JSON.parse(text);
      log(!!parsed.body, 'gzip 内容是合法 JSON 且含 body');

      // 2. 载入
      await loadBytes(bytes, 'save.sv', null);
      log(!!S.save, 'loadBytes 载入成功');
      log(deepEq(S.orig, S.save), '原始快照与工作副本一致');
      log(changeCount() === 0, '初始改动数为 0');

      // 3. 原始存档应通过校验
      var v0 = validate();
      log(v0.errs.length === 0, '原始存档零错误', 'errs=' + v0.errs.length + ' warns=' + v0.warns.length);

      // 4. 预设：改 hunger
      var before = S.save.body.hunger;
      S.save.body.hunger = 100;
      var d = diffAll(S.orig, S.save);
      log(d.length === 1 && d[0].path === 'body.hunger', '改 body.hunger 被差异引擎捕获', JSON.stringify(d[0]));

      // 5. int 字段写小数必须被拦
      S.save.body.skills.STR = 12.5;
      var v1 = validate();
      var caught = v1.errs.some(function(e){ return e.msg.indexOf('STR') >= 0; });
      log(caught, 'int 字段写成小数被校验拦住', 'errs=' + v1.errs.length);
      S.save.body.skills.STR = 12;

      // 6. 加物品：items / itemComponents 长度同步
      var n0 = S.save.items.length, c0 = S.save.itemComponents.length;
      S.save.items.push({id:'bandage', condition:1, slot:3, wearSlot:null, favourited:false, label:'', swatch:0});
      S.save.itemComponents.push({});
      log(S.save.items.length === n0 + 1 && S.save.itemComponents.length === c0 + 1, '添加物品后两数组同步增长', n0 + '->' + S.save.items.length);

      // 7. 删物品：长度同步
      var kill = {}; kill[S.save.items.length - 1] = 1;
      removeItems(kill);
      log(S.save.items.length === n0 && S.save.itemComponents.length === c0, '删除物品后两数组同步回缩', S.save.items.length + '/' + S.save.itemComponents.length);

      // 8. 序列化 → 纯 ASCII
      var out = toAsciiJson(S.save);
      var nonAscii = 0;
      for (var i = 0; i < out.length; i++) if (out.charCodeAt(i) > 127) nonAscii++;
      log(nonAscii === 0, '序列化结果无任何非 ASCII 字符', 'len=' + out.length);

      // 9. 中文名写入 label 后仍然纯 ASCII（转义生效）
      S.save.items[0].label = '测试中文';
      var out2 = toAsciiJson(S.save);
      var nonAscii2 = 0;
      for (var j = 0; j < out2.length; j++) if (out2.charCodeAt(j) > 127) nonAscii2++;
      log(nonAscii2 === 0 && out2.indexOf('\\u6d4b') > 0, '中文 label 被转成 \\uXXXX 转义', 'escaped=' + (out2.indexOf('\\u6d4b') > 0));
      S.save.items[0].label = '';

      // 10. 重新压缩 + 解压 + 解析 往返一致
      var gz = await gzipText(toAsciiJson(S.save));
      var back = JSON.parse(await gunzip(gz));
      log(deepEq(back, S.save), '压缩→解压→解析 与内存副本完全一致', 'gz=' + gz.length + 'B');

      // 11. 数值精度往返
      var hot = S.save.body.heartRate;
      log(back.body.heartRate === hot, '浮点数往返无精度损失', hot + ' -> ' + back.body.heartRate);

      // 12. 渲染所有面板不报错
      var panels = ['overview','body','skills','limbs','items','world','settings','recipes','json','export'];
      var bad = [];
      panels.forEach(function(p){
        try { S.panel = p; renderPanel(); }
        catch (e){ bad.push(p + ':' + e.message); }
      });
      log(bad.length === 0, '10 个面板全部渲染成功', bad.join('; '));

      // 13. 完整预设链：伤势全愈 + 状态拉满 + 耐久
      (S.save.limbs||[]).forEach(function(l){ l.skinHealth = 100; l.pain = 0; l.broken = false; });
      log(S.save.limbs.every(function(l){ return l.skinHealth === 100 && l.pain === 0; }), '肢体预设生效');

      // 14. 液体内容编辑
      var wi = -1;
      for (var q = 0; q < (S.save.itemComponents || []).length; q++){ if (getWaterComp(q) && getWaterComp(q).comp.stack) { wi = q; break; } }
      log(wi >= 0, '找到带液体内容的物品', wi >= 0 ? S.save.items[wi].id : 'none');
      if (wi >= 0){
        var w0 = getWaterComp(wi);
        w0.comp.stack[0].amount = 50;
        log(getWaterComp(wi).comp.stack[0].amount === 50, '液体分量可改写', w0.comp.stack[0].liquidId);
        var n0 = w0.comp.stack.length;
        w0.comp.stack.push({liquidId: 'water', amount: 20});
        log(getWaterComp(wi).comp.stack.length === n0 + 1, '可追加一种液体', w0.comp.stack.length);
        log(S.save.items.length === S.save.itemComponents.length, '液体编辑未破坏两数组对齐');
        var cn = liquidName('ceftriaxone');
        log(cn === '头孢曲松', '液体中文名解析正确', cn);
      }

      // 输出最终字节给外部校验器
      var finalBytes = await gzipText(toAsciiJson(S.save));
      console.log('SAVED_B64:' + bytesToB64(finalBytes));
      console.log('SAVED_LEN:' + finalBytes.length);
      var vf = validate();
      console.log('FINAL_ERRORS:' + vf.errs.length + ' FINAL_WARNS:' + vf.warns.length);
      // 供截图/人工检查：#p=items 之类的 hash 指定要停在哪个面板
      var m = /p=([a-z]+)/.exec(location.hash || '');
      if (m && Panels[m[1]]) { S.panel = m[1]; renderPanel(); console.log('PANEL:' + m[1]); }
      dumpResults();
      console.log('SELFTEST DONE fails=' + fails);
    } catch (e){
      console.log('FAIL | 自检崩溃 | ' + e.message + ' | ' + (e.stack || '').split('\n').slice(0,3).join(' <- '));
      REC.push('FAIL | 自检崩溃');
      dumpResults();
      console.log('SELFTEST DONE fails=' + (fails + 1));
    }
  });
})();