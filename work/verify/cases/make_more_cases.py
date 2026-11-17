import re, pathlib

src = pathlib.Path('work/save.json').read_text(encoding='utf-8')

# d: 多个"软"缺陷 —— 非 ASCII 字符 + 不存在的 body 字段 + 文本塞进 float + 物品 id 打错
i = src.index('"items":[')
m = re.search(r'"id":"([^"]*)"', src[i:])
d = src[:i+m.start()] + '"id":"claws_typo"' + src[i+m.end():]
assert d.count('"hunger":83.1026459') == 1
d = d.replace('"hunger":83.1026459', '"hunger":"八十八"')
d = d.replace('{"body":{', '{"body":{"zzNotAField":1,', 1)
pathlib.Path('work/verify/cases/d_soft_defects.json').write_text(d, encoding='utf-8', newline='')
print('d: 非 ASCII 字符 + zzNotAField + hunger 变文本 + items[0].id 打错')

# e: 截断的 gzip —— 模拟下载/复制坏掉
raw = pathlib.Path('work/verify/cases/a_original.sv').read_bytes()
pathlib.Path('work/verify/cases/e_corrupt_gzip.sv').write_bytes(raw[:len(raw)//2])
print('e: a_original.sv 截一半 -> e_corrupt_gzip.sv', len(raw)//2, 'bytes')
