import re, pathlib, sys

src = pathlib.Path('work/save.json').read_text(encoding='utf-8')

# a: 原样
pathlib.Path('work/verify/cases/a_original.json').write_text(src, encoding='ascii', newline='')
print('a: 原样           ', len(src), 'chars')

# b: body.corpsesSeen 是 dll 里的 System.Int32, 改成小数
assert src.count('"corpsesSeen":47') == 1, 'literal not found'
b = src.replace('"corpsesSeen":47', '"corpsesSeen":47.5')
pathlib.Path('work/verify/cases/b_broken_int_field.json').write_text(b, encoding='ascii', newline='')
print('b: corpsesSeen 47 -> 47.5   (int 字段给小数)')

# c: body.hunger 是 System.Single -> 100 ; items[0].condition 是 System.Single -> 1.0
i = src.index('"items":')
m = re.search(r'"condition":([0-9.eE+-]+)', src[i:])
assert m, 'condition not found'
start, end = i + m.start(), i + m.end()
c = src[:start] + '"condition":1.0' + src[end:]
assert c.count('"hunger":83.1026459') == 1, 'hunger literal not found'
c = c.replace('"hunger":83.1026459', '"hunger":100.0')
pathlib.Path('work/verify/cases/c_edited_ok.json').write_text(c, encoding='ascii', newline='')
print('c: hunger 83.1026459 -> 100.0 ; items[0].condition', src[start+11:end], '-> 1.0')
print('c 与 a 的差异长度:', len(c) - len(src))
