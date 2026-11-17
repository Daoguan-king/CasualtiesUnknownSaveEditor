/* 校验 work/art/README.md 里提到的素材名是否真实存在于 names.txt
   范围：只查"素材清单"段落（`- **…**：` 开头的行 + 九宫格表格行）里的反引号名字，
   并排除分类名、字体族名、C# API 名。 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const names = new Set(fs.readFileSync(path.join(ROOT, 'work/art/out/names.txt'), 'utf8')
  .split('\n').map(l => l.split('\t')[0]).filter(Boolean));
const md = fs.readFileSync(path.join(ROOT, 'work/art/README.md'), 'utf8');

const NOT_ASSET = new Set(['ui', 'font', 'anim', 'item', 'char', 'other',
  'Retro Gaming', 'RetroGamingFIXED', 'Consolas', 'unifont-17.0.04', 'NotoAscii']);

const lines = md.split('\n').filter(l => l.startsWith('- **') || l.trim().startsWith('| `'));
const toks = [];
lines.forEach(l => {
  [...l.matchAll(/`([^`]+)`/g)].forEach(m => {
    const t = m[1].trim();
    if (!t || /[\/.]/.test(t) || /^[…@]/.test(t)) return;   // 路径/API/省略号/at-rule 跳过
    if (/\s/.test(t) && !NOT_ASSET.has(t)) return;           // 带空格的说明性文字跳过
    if (NOT_ASSET.has(t)) return;
    toks.push(t);
  });
});
const uniq = [...new Set(toks)];
const missing = uniq.filter(t => !names.has(t));
console.log('清单段落里的素材名:', uniq.length, '| 不存在:', missing.length);
if (missing.length) { console.log('  ✗ ' + missing.join(', ')); process.exit(1); }
console.log('  ✓ 全部存在于 names.txt');
