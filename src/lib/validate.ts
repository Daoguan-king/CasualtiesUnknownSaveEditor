/* 结构校验：复现 SaveSystem.TryLoadGame 的失败条件（详见 work/verify/REPORT.md） */
import {DB, HAND_SLOTS, isContainerItem, itemName, slotLabel, wearSlotName} from './data';
import {store, getPath} from './store';

export type Msg = {msg: string};

export function validate(): {errs: Msg[]; warns: Msg[]} {
  const errs: Msg[] = [];
  const warns: Msg[] = [];
  const j = store.get().save;
  if (!j) return {errs: [{msg: '尚未载入存档'}], warns: []};

  const need = ['body', 'limbs', 'items', 'itemComponents', 'bodyComponents', 'limbComponents', 'savedRecipeData', 'runSettings'];
  for (const k of need) if (j[k] === undefined) errs.push({msg: '缺少顶层字段 ' + k});

  if (Array.isArray(j.items) && Array.isArray(j.itemComponents) && j.items.length !== j.itemComponents.length)
    errs.push({msg: 'items 与 itemComponents 长度不一致（' + j.items.length + ' vs ' + j.itemComponents.length + '）'});
  if (Array.isArray(j.limbs) && Array.isArray(j.limbComponents) && j.limbs.length !== j.limbComponents.length)
    errs.push({msg: 'limbs 与 limbComponents 长度不一致'});
  if (j.savedRecipeData && Array.isArray(j.savedRecipeData.saved) && DB.recipes.length &&
      j.savedRecipeData.saved.length !== DB.recipes.length)
    warns.push({msg: '配方表长度 ' + j.savedRecipeData.saved.length + ' 与当前配方数 ' + DB.recipes.length + ' 不同'});

  const slotHead: Record<string, {i: number; id: string; n: number}> = {};
  const wearHead: Record<string, {i: number; id: string; n: number}> = {};
  const unknown: string[] = [];

  (j.items || []).forEach((it: any, i: number) => {
    if (!DB.itemById[it.id]) unknown.push('#' + i + ' ' + it.id);
    if (typeof it.condition !== 'number' || isNaN(it.condition) || it.condition < 0)
      errs.push({msg: '物品 #' + i + ' condition 非法: ' + it.condition});
    else if (it.condition > 1) warns.push({msg: '物品 #' + i + ' condition=' + it.condition + ' > 1'});
    if (it.slot >= 0) {
      if (it.slot >= HAND_SLOTS) warns.push({msg: '物品 #' + i + ' 槽位 ' + it.slot + ' 超出 0-' + (HAND_SLOTS - 1)});
      if (!(it.slot in slotHead)) slotHead[it.slot] = {i, id: it.id, n: 0};
      else slotHead[it.slot].n++;
    } else if (it.wearSlot == null) {
      warns.push({msg: '物品 #' + i + ' 既无槽位也无穿戴位'});
    } else if (!(it.wearSlot in wearHead)) {
      wearHead[it.wearSlot] = {i, id: it.id, n: 0};
    } else wearHead[it.wearSlot].n++;
  });

  if (unknown.length)
    warns.push({msg: '有 ' + unknown.length + ' 件物品 id 不在物品表中，读档会被跳过：' + unknown.slice(0, 8).join('，')});

  for (const s of Object.keys(slotHead)) {
    const hd = slotHead[s];
    if (!hd.n || isContainerItem(hd.id) === true) continue;
    warns.push({msg: slotLabel(+s) + ' 里有 ' + (hd.n + 1) + ' 件物品，但宿主「' + itemName(hd.id) + '」' +
      (isContainerItem(hd.id) === false ? '不是容器' : '容器属性未知')});
  }
  for (const w of Object.keys(wearHead)) {
    const hd = wearHead[w];
    if (!hd.n || isContainerItem(hd.id) === true) continue;
    warns.push({msg: '穿戴位 ' + wearSlotName(w) + ' 里有 ' + (hd.n + 1) + ' 件物品，但宿主「' + itemName(hd.id) + '」' +
      (isContainerItem(hd.id) === false ? '不是容器' : '容器属性未知')});
  }

  for (const f of DB.fields) {
    if (f.csharpType !== 'int') continue;
    for (const p of [['body', f.name], ['body', 'skills', f.name]]) {
      const v = getPath(p);
      if (typeof v === 'number' && !Number.isInteger(v))
        errs.push({msg: p.join('.') + ' 是 int 字段，给小数 ' + v + ' 会被静默四舍五入成 ' + Math.round(v)});
    }
  }
  if (j.cheatedSave === true) warns.push({msg: 'cheatedSave = true：读档后会禁用本次运行的成就'});
  return {errs, warns};
}
