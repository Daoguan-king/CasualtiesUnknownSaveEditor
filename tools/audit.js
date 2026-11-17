/* 独立审计：对照游戏源码/save.json 复核 work/data/*.json，不信任 agent 自述 */
const fs = require('fs');
const path = require('path');
const W = __dirname + '/../work';
const rd = p => fs.readFileSync(p, 'utf8');
const jd = p => JSON.parse(rd(p));
let bad = 0;
const ok = (c, m, x) => { if (!c) bad++; console.log((c ? 'PASS' : 'FAIL') + ' | ' + m + (x !== undefined ? ' | ' + x : '')); };

const save = jd(W + '/save.json');
const items = jd(W + '/data/items.json');
const recipes = jd(W + '/data/recipes.json');
const settings = jd(W + '/data/runsettings.json');
const containers = jd(W + '/data/containers.json');
const itemsCs = rd(W + '/decompile/Item.cs');
const recipesCs = rd(W + '/decompile/Recipes.cs');

// ---- items ----
ok(items.items.length === 300, 'items 条数 300', items.items.length);
const ids = new Set(items.items.map(i => i.id));
ok(ids.size === 300, 'item id 无重复', ids.size);
const missingInSrc = items.items.filter(i => itemsCs.indexOf('GlobalItems.Add("' + i.id + '"') < 0);
ok(missingInSrc.length === 0, '每个 id 都能在 Item.cs 里找到注册', missingInSrc.map(x => x.id).slice(0,5).join(','));
const noName = items.items.filter(i => !i.name);
ok(noName.length === 0, '每个物品都有中文名', noName.length);
const saveIds = [...new Set(save.items.map(i => i.id))];
const notInDb = saveIds.filter(id => !ids.has(id));
ok(notInDb.length === 0, '存档里的物品 id 全在库中', notInDb.join(','));

// ---- recipes：对照 Recipes.cs 里 result 的 id 顺序 ----
const srcResults = [...recipesCs.matchAll(/result = new RecipeResult\s*\{\s*\r?\n\s*id = "([^"]+)"/g)].map(m => m[1]);
ok(srcResults.length === 137, 'Recipes.cs 中 result id 顺序抽取 137 个', srcResults.length);
ok(recipes.recipes.length === 137, 'recipes 条数 137', recipes.recipes.length);
ok(recipes.recipes.every((r, i) => r.index === i), 'index 从 0 连续无洞');
const mismatch = recipes.recipes.filter((r, i) => srcResults[i] !== r.resultId);
ok(mismatch.length === 0, '每个 index 的 resultId 与源码顺序一致', mismatch.slice(0,5).map(m => m.index + ':' + m.resultId + '≠' + srcResults[m.index]).join(' '));
ok(recipes.recipes.length === save.savedRecipeData.saved.length, 'recipes 数 == save.savedRecipeData.saved 长度', save.savedRecipeData.saved.length);
const noRecipeName = recipes.recipes.filter(r => !r.resultName);
ok(noRecipeName.length === 0, '每个配方产物都有中文名', noRecipeName.length);
// 配方产物可以是"液体"（RecipeResult.id 指向液体 id），因此非物品产物必须能在 Lang 表里查到
const lang = jd('D:/SteamLibrary/steamapps/common/Casualties Unknown/CasualtiesUnknown_Data/Lang/zh-CN.json');
const badResult = recipes.recipes.filter(r => !ids.has(r.resultId) && !(lang.other && lang.other[r.resultId]));
ok(badResult.length === 0, '配方产物要么是物品、要么是已注册液体', badResult.map(r => r.resultId).slice(0,5).join(','));
const liquidOut = recipes.recipes.filter(r => !ids.has(r.resultId));
ok(liquidOut.length > 0, '液体产物配方存在且已定位到 other 表', liquidOut.length);
const liquidNoName = liquidOut.filter(r => !r.resultName);
ok(liquidNoName.length === 0, '液体产物也有中文名', liquidNoName.length);

// ---- runSettings ----
const saveKeys = save.runSettings.map(x => x.Item1);
ok(settings.settings.length === 51, 'runsettings 条数 51', settings.settings.length);
const metaKeys = new Set(settings.settings.map(s => s.key));
const missingKeys = saveKeys.filter(k => !metaKeys.has(k));
ok(missingKeys.length === 0, 'save 的 51 个 key 全部有元数据', missingKeys.join(','));
ok(saveKeys.length === 51, 'save 里确有 51 个 runSettings', saveKeys.length);
const typeMismatch = [];
settings.settings.forEach(s => {
  const e = save.runSettings.find(x => x.Item1 === s.key); if (!e) return;
  const t = typeof e.Item2;
  if (s.type === 'bool' && t !== 'boolean') typeMismatch.push(s.key + ':bool≠' + t);
  if (s.type !== 'bool' && t === 'boolean') typeMismatch.push(s.key + ':' + s.type + '≠boolean');
});
ok(typeMismatch.length === 0, '元数据类型与存档实际值类型一致', typeMismatch.join(' '));
const noLabel = settings.settings.filter(s => !s.label);
console.log('INFO | runsettings 无中文名的条数: ' + noLabel.length + (noLabel.length ? ' -> ' + noLabel.map(s => s.key).slice(0,10).join(',') : ''));

// ---- containers ----
ok(containers.ok === true, 'containers.ok', containers.ok);
const cids = containers.containerIds || [];
ok(cids.length === 25, 'containerIds 25 个', cids.length);
const cNotInItems = cids.filter(id => !ids.has(id));
ok(cNotInItems.length === 0, 'container id 全在物品库中', cNotInItems.join(','));
const catContainer = items.items.filter(i => i.category === 'container').length;
console.log('INFO | items.category=container 有 ' + catContainer + ' 个；containers 表 25 个（两者不必相等）');

console.log('\nAUDIT DONE fails=' + bad);
process.exit(bad ? 1 : 0);