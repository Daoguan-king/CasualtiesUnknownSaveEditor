#!/usr/bin/env python3
"""生成 data/runsettings.json —— 数据源 decompile/RunSettings.cs 的 RunSettings.settingTypes。

本地化规则（全部来自反编译源码，未作任何翻译）：
  RunSettingDisplay.cs:25  transform.GetChild(0).text = Locale.GetOther("runset" + ass.name)
  RunSettingDisplay.cs:29  uITooltip.tipDesc      = Locale.GetOther("runset" + ass.name + "dsc")
  RunSettingDisplay.cs:78  dropdown 选项文本       = Locale.GetOther("runset" + ass.name + choices[i])
  Locale.cs:29-32          GetOther(str) -> GetString(str, 3)
  Locale.cs:103-108        case 3: currentLang.other.TryGetValue(str) 否则回显原键
  => 键 = 'runset' + 设置名 / 'runset' + 设置名 + 'dsc' / 'runset' + 设置名 + 选项, 查 zh-CN.json 的 other 表。
     查不到写 null，不编造。
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]          # work/
SRC = ROOT / "decompile" / "RunSettings.cs"
OUT = ROOT / "data" / "runsettings.json"
SAVE = ROOT / "save.json"
LANG_ZH = Path(r"D:\SteamLibrary\steamapps\common\Casualties Unknown\CasualtiesUnknown_Data\Lang\zh-CN.json")

LABEL_CONVENTION = (
    "label = zh-CN.json.other['runset' + name]（RunSettingDisplay.cs:25 Locale.GetOther(\"runset\"+ass.name)）；"
    "desc = other['runset' + name + 'dsc']（RunSettingDisplay.cs:29）；"
    "dropdown 每个选项 = other['runset' + name + choice]（RunSettingDisplay.cs:78）；"
    "Locale.GetOther 即 GetString(str,3) 查 currentLang.other 表，缺失时游戏回显原键（Locale.cs:103-108），"
    "本文件遇缺失写 null、不编造。"
)

TYPES = {"RunSettingBool": "bool", "RunSettingFloat": "float", "RunSettingDropdown": "dropdown"}
FIELDS = {  # 可写字段：基类 divider(RunSetting.cs:5) + 子类字段(RunSettingFloat.cs:5-7)
    "RunSettingBool": ("divider",),
    "RunSettingFloat": ("limits", "wholeNum", "postfix", "divider"),
    "RunSettingDropdown": ("choices", "divider"),
}

# ---------------------------------------------------------------- 扫描工具


def brace_block(s, start):
    assert s[start] == "{", s[start : start + 20]
    depth = 0
    for j in range(start, len(s)):
        c = s[j]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return s[start + 1 : j], j
    raise ValueError("unbalanced braces")


def paren_block(s, start):
    assert s[start] == "(", s[start : start + 20]
    depth = 0
    for j in range(start, len(s)):
        c = s[j]
        if c == "(":
            depth += 1
        elif c == ")":
            depth -= 1
            if depth == 0:
                return s[start + 1 : j], j
    raise ValueError("unbalanced parens")


def split_top(s):
    parts, depth, last = [], 0, 0
    for j, c in enumerate(s):
        if c in "{([":
            depth += 1
        elif c in "})]":
            depth -= 1
        elif c == "," and depth == 0:
            parts.append(s[last:j])
            last = j + 1
    parts.append(s[last:])
    return [p.strip() for p in parts if p.strip()]


def assignments(body):
    out = []
    for part in split_top(body):
        name, sep, val = part.partition("=")
        if not sep:
            raise ValueError("not an assignment: " + part[:60])
        out.append((name.strip(), val.strip()))
    return out


def fnum(tok):
    return float(tok.strip().rstrip("fF"))


def csharp_str(tok):
    m = re.search(r'"([^"]*)"', tok)
    return m.group(1) if m else None


# ---------------------------------------------------------------- 解析 RunSettings.cs


def parse_setting_types(src):
    m = re.search(r"settingTypes\s*=\s*new\s+List<RunSetting>\s*\{", src)
    if not m:
        raise SystemExit("找不到 RunSettings.settingTypes")
    body, _ = brace_block(src, src.index("{", m.start()))
    settings = []
    for el in split_top(body):
        tm = re.match(r"new\s+(RunSetting\w+)\s*\(", el)
        if not tm:
            raise ValueError("unexpected setting element: " + el[:80])
        typename = tm.group(1)
        if typename not in TYPES:
            raise ValueError("unknown setting class: " + typename)
        args, pend = paren_block(el, el.index("(", tm.start()))
        parts = split_top(args)
        s = {"key": csharp_str(parts[0]), "class": typename, "type": TYPES[typename],
             "limits": None, "wholeNum": False, "postfix": None, "choices": None,
             "divider": None, "label": None, "desc": None, "optionsLabels": None}
        if typename == "RunSettingDropdown":
            if len(parts) < 2:
                raise ValueError("dropdown without choices: " + el[:80])
            arr = parts[1]
            ab = arr.index("{")
            inner, _ = brace_block(arr, ab)
            s["choices"] = [csharp_str(p) for p in split_top(inner)]
        rest = el[pend + 1 :].strip()
        if rest.startswith("{"):
            inner, _ = brace_block(rest, 0)
            for name, v in assignments(inner):
                if name not in FIELDS[typename]:
                    raise ValueError(f"unknown field {name} on {typename}")
                if name == "limits":
                    lm = re.search(r"RangeF\s*\(([^)]*)\)", v)
                    if not lm:
                        raise ValueError("unexpected limits: " + v)
                    lo, hi = split_top(lm.group(1))
                    s["limits"] = (fnum(lo), fnum(hi))
                elif name == "wholeNum":
                    s["wholeNum"] = v == "true"
                elif name == "postfix":
                    s["postfix"] = csharp_str(v)
                elif name == "divider":
                    s["divider"] = csharp_str(v)
        settings.append(s)
    return settings


# ---------------------------------------------------------------- 主流程


def main():
    src = SRC.read_text(encoding="utf-8-sig")
    parsed = parse_setting_types(src)

    other = {}
    lang_source = None
    if LANG_ZH.is_file():
        other = json.loads(LANG_ZH.read_text(encoding="utf-8-sig")).get("other") or {}
        lang_source = str(LANG_ZH)

    keys = [s["key"] for s in parsed]
    if len(keys) != len(set(keys)):
        raise SystemExit("settingTypes 里有重复 key")

    out = []
    missing_labels, missing_descs, missing_options = [], [], []
    for s in parsed:
        label = other.get("runset" + s["key"])
        desc = other.get("runset" + s["key"] + "dsc")
        if label is None:
            missing_labels.append(s["key"])
        if desc is None:
            missing_descs.append(s["key"])
        options = s["choices"]
        options_labels = None
        if options is not None:
            options_labels = []
            for opt in options:
                lab = other.get("runset" + s["key"] + opt)
                if lab is None:
                    missing_options.append(s["key"] + ":" + opt)
                options_labels.append(lab)
        is_float = s["type"] == "float"
        out.append(
            {
                "key": s["key"],
                "type": s["type"],
                "label": label,
                "desc": desc,
                "min": s["limits"][0] if is_float else None,
                "max": s["limits"][1] if is_float else None,
                "wholeNum": s["wholeNum"] if is_float else False,
                "postfix": s["postfix"] if is_float else None,
                "options": options,
                "optionsLabels": options_labels,
                "divider": s["divider"],
                "class": s["class"],
            }
        )
        if is_float and s["limits"] is None:
            raise SystemExit("float 设置缺 limits: " + s["key"])

    doc = {
        "generatedBy": "tools/extract_runsettings.py",
        "count": len(out),
        "labelConvention": LABEL_CONVENTION,
        "settings": out,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    # ------------------------------------------------------------ 自检 / 覆盖校验
    print(f"source           : {SRC}")
    print(f"locale           : {lang_source or '(不可用 -> label/desc 全为 null)'}")
    print(f"settings.count   : {doc['count']}")
    kinds = {}
    for s in out:
        kinds[s["type"]] = kinds.get(s["type"], 0) + 1
    print(f"type 分布        : {kinds}")
    print(f"divider 设置     : {[(s['key'], s['divider']) for s in out if s['divider']]}")
    print(f"缺 label         : {missing_labels or '无'}")
    print(f"缺 desc          : {missing_descs or '无'}")
    print(f"缺选项文案       : {missing_options or '无'}")

    save_keys = []
    if SAVE.is_file():
        save = json.loads(SAVE.read_text(encoding="utf-8-sig"))
        save_keys = [x["Item1"] for x in save["runSettings"]]
        covered = [k for k in save_keys if k in set(keys)]
        gaps = [k for k in save_keys if k not in set(keys)]
        extra = [k for k in keys if k not in set(save_keys)]
        print(f"save.runSettings : {len(save_keys)} 个 key, 去重 {len(set(save_keys))}")
        print(f"覆盖率           : {len(covered)}/{len(save_keys)}  {'PASS' if not gaps else 'FAIL 缺: ' + str(gaps)}")
        print(f"代码多出的 key   : {extra or '无'}")
        print(f"顺序与代码一致   : {save_keys == keys}")
    else:
        print("save.json 不可用：跳过覆盖校验")

    for key in ("timelimit", "ambientlight", "unchipped"):
        item = next((s for s in out if s["key"] == key), None)
        print(f"--- {key} ---")
        print(json.dumps(item, ensure_ascii=False))
    json.loads(OUT.read_text(encoding="utf-8"))  # 可解析自检
    print(f"written          : {OUT}  (JSON 可解析)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
