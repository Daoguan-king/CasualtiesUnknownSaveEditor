#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Extract every liquid from the decompiled Liquids.cs into data/liquids.json.

Sources (read-only):
  work/decompile/Liquids.cs            -> Registry + DangerList
  work/decompile/LiquidType.cs         -> public fields of LiquidType
  <Lang>/zh-CN.json, <Lang>/EN.json    -> names, table "other" (keyed by localeName)

Output: work/data/liquids.json
    {generatedBy, count, missingNames, liquids:[{id, localeName, name, nameEn,
     color, valuePerLiter, danger}]}
"""
import json
import math
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)                      # work/
REPO = os.path.dirname(ROOT)                      # Casualties_Unknown/
DECOMPILE = os.path.join(ROOT, "decompile")
LIQUIDS_CS = os.path.join(DECOMPILE, "Liquids.cs")
LIQUIDTYPE_CS = os.path.join(DECOMPILE, "LiquidType.cs")
LANG_DIR = r"D:\SteamLibrary\steamapps\common\Casualties Unknown\CasualtiesUnknown_Data\Lang"
ZH = os.path.join(LANG_DIR, "zh-CN.json")
EN = os.path.join(LANG_DIR, "EN.json")
OUT = os.path.join(ROOT, "data", "liquids.json")


class ParseError(Exception):
    pass


def read(path):
    with open(path, encoding="utf-8-sig") as fh:
        return fh.read()


def brace_block(src, start):
    """Return (inner_text, end_index_of_closing_brace) for the '{' at src[start]."""
    if src[start] != "{":
        raise ParseError("expected '{' at offset %d" % start)
    depth = 0
    i = start
    n = len(src)
    while i < n:
        c = src[i]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return src[start + 1:i], i
        i += 1
    raise ParseError("unbalanced braces from offset %d" % start)


def block_after(src, anchor):
    """Inner text of the first '{...}' after the literal anchor."""
    i = src.index(anchor)
    return brace_block(src, src.index("{", i + len(anchor)))[0]


def top_level_assignments(body):
    """Field assignments at brace-depth 0 of an object initializer body.

    Expressions may contain lambdas / nested initializers, so a value runs from
    '=' to the next comma that sits at depth 0.
    """
    out = {}
    depth = 0
    i = 0
    n = len(body)
    while i < n:
        c = body[i]
        if c in "{([":
            depth += 1
        elif c in "})]":
            depth -= 1
        elif depth == 0:
            m = re.match(r"\s*([A-Za-z_]\w*)\s*=(?!=)\s*", body[i:i + 200])
            if m and (i == 0 or body[i - 1] in "\n\t,; }"):
                name = m.group(1)
                j = i + m.end()
                d = 0
                k = j
                while k < n:
                    ch = body[k]
                    if ch in "{([":
                        d += 1
                    elif ch in "})]":
                        d -= 1
                    elif ch == "," and d == 0:
                        break
                    k += 1
                out.setdefault(name, body[j:k].strip())
                i = k + 1
                continue
        i += 1
    return out


NUM_LIT = r"(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?"


def eval_scalar(expr, context=""):
    """Evaluate a C# numeric literal/expression made of numbers and byte.MaxValue."""
    e = expr.strip()
    e = e.replace("byte.MaxValue", "255").replace("byte.MinValue", "0")
    e = e.replace("float.MaxValue", "3.4028235e38")
    e = re.sub(r"(\d)f\b", r"\1", e)
    e = e.replace("F", "")
    if not re.fullmatch(r"[0-9.eE+\-*/() \t]+", e):
        raise ParseError("unsupported numeric expression %r (%s)" % (expr, context))
    try:
        v = eval(e, {"__builtins__": {}}, {})  # sanitised above: digits/operators only
    except Exception as exc:
        raise ParseError("cannot evaluate %r (%s): %s" % (expr, context, exc))
    return float(v)


def eval_color(expr, context=""):
    """'new Color32(a, b, c, d)' (bytes) or 'new Color(r, g, b[, a])' (0..1 floats).

    Returns '#rrggbb' lowercase; alpha is dropped.
    """
    e = expr.strip()
    m = re.match(r"new\s+(Color32|Color)\s*\((.*)\)\s*$", e, re.S)
    if not m:
        raise ParseError("unsupported color expression %r (%s)" % (expr, context))
    kind, args_src = m.group(1), m.group(2)
    args = []
    depth = 0
    cur = ""
    for ch in args_src:
        if ch in "([":
            depth += 1
        elif ch in ")]":
            depth -= 1
        if ch == "," and depth == 0:
            args.append(cur)
            cur = ""
        else:
            cur += ch
    args.append(cur)
    args = [a.strip() for a in args if a.strip()]
    if len(args) < 3:
        raise ParseError("color with %d args: %r (%s)" % (len(args), expr, context))
    vals = [eval_scalar(a, context) for a in args[:3]]
    maxv = 255.0 if kind == "Color32" else 1.0
    bytes_out = []
    for v, raw in zip(vals, args[:3]):
        if v < -0.001 or v > maxv + 0.001:
            raise ParseError("channel %r out of range for %s (%s)" % (raw, kind, context))
        if kind == "Color32":
            b = int(round(v))
        else:
            b = int(math.floor(v * 255.0 + 0.5))
        bytes_out.append(max(0, min(255, b)))
    return "#%02x%02x%02x" % tuple(bytes_out)


def parse_entries(registry_body):
    """Split the Registry initializer body on '["id"] = new LiquidType { ... }'."""
    entries = []
    depth = 0
    i = 0
    n = len(registry_body)
    pat = re.compile(r'\[\s*"([^"]+)"\s*\]\s*=\s*new\s+LiquidType\s*')
    while i < n:
        c = registry_body[i]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
        elif c == "[" and depth == 0:
            m = pat.match(registry_body, i)
            if m:
                body, end = brace_block(registry_body, registry_body.index("{", m.end()))
                entries.append((m.group(1), body))
                i = end + 1
                continue
        i += 1
    return entries


def parse_danger_list(src):
    body = block_after(src, "DangerList = new List<string>")
    return [s for s in re.findall(r'"([^"]*)"', body)]


def load_table(path, table="other"):
    with open(path, encoding="utf-8-sig") as fh:
        doc = json.load(fh)
    return doc.get(table) or {}


def main():
    src = read(LIQUIDS_CS)
    registry_body = block_after(src, "Registry = new Dictionary")
    danger_list = parse_danger_list(src)
    entries = parse_entries(registry_body)

    zh_other = load_table(ZH)
    en_other = load_table(EN)

    liquids = []
    problems = []
    missing_zh = []
    missing_en = {}
    seen = set()

    for pos, (lid, body) in enumerate(entries):
        ctx = "entry #%d [%s]" % (pos + 1, lid)
        if lid in seen:
            problems.append("duplicate id %r" % lid)
        seen.add(lid)

        fields = top_level_assignments(body)

        locale = None
        if "localeName" in fields:
            lm = re.match(r'"([^"]*)"', fields["localeName"])
            if not lm:
                raise ParseError("localeName is not a string literal: %r (%s)"
                                 % (fields["localeName"], ctx))
            locale = lm.group(1)

        if "color" not in fields:
            raise ParseError("no color assigned (%s)" % ctx)
        color = eval_color(fields["color"], ctx)

        vpl = None
        if "valuePerLiter" in fields:
            vpl = eval_scalar(fields["valuePerLiter"], ctx)

        name = zh_other.get(locale) if locale else None
        name_en = en_other.get(locale) if locale else None
        if name is None:
            missing_zh.append(locale if locale else "<no localeName:%s>" % lid)
        if name_en is None and locale:
            missing_en.setdefault(locale, []).append(lid)

        liquids.append({
            "id": lid,
            "localeName": locale,
            "name": name,
            "nameEn": name_en,
            "color": color,
            "valuePerLiter": None if vpl is None else round(vpl, 4),
            "danger": lid in danger_list,
        })

    liquids.sort(key=lambda d: d["id"])

    doc = {
        "generatedBy": "tools/extract_liquids.py",
        "count": len(liquids),
        "missingNames": missing_zh,
        "liquids": liquids,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=2)
        fh.write("\n")

    # ---- self-checks -----------------------------------------------------
    print("Registry entries parsed : %d" % len(entries))
    print("liquids written         : %d" % doc["count"])
    print("unique ids              : %d" % len(seen))
    bad_color = [l["id"] for l in liquids if not re.fullmatch(r"#[0-9a-f]{6}", l["color"])]
    print("colors failing #rrggbb  : %s" % (bad_color or "none"))
    print("danger ids              : %d -> %s" % (sum(1 for l in liquids if l["danger"]),
          ", ".join(l["id"] for l in liquids if l["danger"])))
    print("missingNames (zh-CN)    : %d %s" % (len(missing_zh), missing_zh))
    print("missing EN names        : %s" % (missing_en or "none"))
    if problems:
        print("PROBLEMS: %s" % problems)
    w = next((l for l in liquids if l["id"] == "water"), None)
    print("water                   : %s" % json.dumps(w, ensure_ascii=False))
    # field inventory of LiquidType (for the report, not for the JSON schema)
    lt_fields = re.findall(r"public\s+[\w<>\[\], .]+?\s+(\w+)\s*[;=]", read(LIQUIDTYPE_CS))
    print("LiquidType public fields: %s" % ", ".join(lt_fields))

    ok = (doc["count"] == len(entries) and len(seen) == len(entries)
          and not bad_color and not problems)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
