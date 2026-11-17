import gzip, pathlib
src = pathlib.Path('work/save.json').read_text(encoding='utf-8')
f = src.replace('"hunger":83.1026459', '"hunger":"八十八"')
# 直接用 UTF-8 字节压 gzip —— 不经过 ASCII, 所以 .sv 里带 >=0x80 的字节
pathlib.Path('work/verify/cases/f_nonascii_bytes.sv').write_bytes(gzip.compress(f.encode('utf-8')))
print('f: 原始 UTF-8 字节压 gzip ->', len(pathlib.Path('work/verify/cases/f_nonascii_bytes.sv').read_bytes()), 'bytes')
