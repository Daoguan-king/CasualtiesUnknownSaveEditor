import UnityPy, os, collections
base = r"D:/SteamLibrary/steamapps/common/Casualties Unknown/CasualtiesUnknown_Data"
files = ["resources.assets","sharedassets0.assets","sharedassets1.assets","globalgamemanagers.assets"]
print("UnityPy", getattr(UnityPy, "__version__", "?"))
for f in files:
    p = os.path.join(base, f)
    try:
        env = UnityPy.load(p)
    except Exception as e:
        print(f, "LOAD FAIL", repr(e)[:120]); continue
    cnt = collections.Counter()
    names = collections.defaultdict(list)
    for obj in env.objects:
        t = obj.type.name
        cnt[t] += 1
        if t in ("Texture2D", "Sprite", "Font") and len(names[t]) < 400:
            try:
                n = obj.peek_name()
            except Exception:
                n = None
            if n:
                names[t].append(n)
    print("==", f, "objects:", sum(cnt.values()), "| top:", ", ".join(k + "=" + str(v) for k, v in cnt.most_common(8)))
    for t in ("Texture2D", "Sprite", "Font"):
        if names[t]:
            print("    ", t, "sample:", ", ".join(names[t][:14]))
