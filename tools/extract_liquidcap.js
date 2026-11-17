/* 从 Item.cs 的 GlobalItems.Add(id, new LiquidItemInfo{...}) 里抽 capacity / autoFill */
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, '..', 'work', 'decompile', 'Item.cs');
const OUT = path.join(__dirname, '..', 'work', 'data', 'liquidcapacity.json');
const src = fs.readFileSync(SRC, 'utf8');

function scanBlock(from){
  // from 指向 '{' 的位置，返回配平后的块内容
  let depth = 0;
  for (let i = from; i < src.length; i++){
    const c = src[i];
    if (c === '"'){ i++; while (i < src.length && src[i] !== '"'){ if (src[i] === '\\') i++; i++; } continue; }
    if (c === '{') depth++;
    else if (c === '}'){ depth--; if (depth === 0) return src.slice(from + 1, i); }
  }
  return null;
}

const re = /GlobalItems\.Add\("([^"]+)",\s*new\s+(LiquidItemInfo|ItemInfo)\s*\{/g;
const items = {};
let m;
while ((m = re.exec(src))){
  const id = m[1], cls = m[2];
  const open = src.indexOf('{', m.index + m[0].length - 1);
  const body = scanBlock(open);
  if (!body) continue;
  if (cls !== 'LiquidItemInfo') continue;
  const cap = /\bcapacity\s*=\s*(-?[0-9.]+)f?/.exec(body);
  const auto = /\bautoFill\s*=\s*(true|false)/.exec(body);
  const defl = /\bdefaultContents\s*=/.test(body);
  items[id] = {
    capacity: cap ? parseFloat(cap[1]) : null,
    autoFill: auto ? auto[1] === 'true' : false,
    hasDefaultContents: defl
  };
}
const out = { generatedBy: 'tools/extract_liquidcap.js', source: 'work/decompile/Item.cs', count: Object.keys(items).length, items };
fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8');
const noCap = Object.entries(items).filter(([k, v]) => v.capacity == null).map(([k]) => k);
console.log('LiquidItemInfo 条目:', out.count);
console.log('无 capacity:', noCap.length, noCap.slice(0, 10).join(','));
console.log('样例:', JSON.stringify({ waterbottle: items['waterbottle'], ceftriaxone: items['ceftriaxone'], sodacan: items['sodacan'] }, null, 0));
