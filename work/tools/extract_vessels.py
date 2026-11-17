#!/usr/bin/env python3
"""解析外部整理的两张容器表 -> data/vessels.json（只读源表格，不改表）。"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT_PATH = DATA / "vessels.json"
ITEMS_PATH = DATA / "items.json"

CONTAINER_XLSX = Path(r"C:\Users\Administrator\Downloads\物品容器数据7.0.1.xlsx")
LIQUID_XLSX = Path(r"C:\Users\Administrator\Downloads\液体容器数据7.0.1.xlsx")

CONTAINER_SHEET = "容器总览"
LIQUID_SHEET = "液体容器数据"

ID_HEADERS = ("英文ID", "英文名", "原名")
NUM_RE = re.compile(r"^\s*([-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)\s*(%|x|X|u|U)?\s*$")
IDENT_RE = re.compile(r"^[A-Za-z0-9_.\-]+$")
TAG_SPLIT_RE = re.compile(r"[、,，/]")
TAG_NAME_RE = re.compile(r"^\s*([^（(]+?)\s*(?:[（(].*[）)])?\s*$")

# 容器总览：表头 -> (字段名, 类型)
CONTAINER_FIELDS = {
    "英文ID": ("id", "text"),
    "中文名": ("name", "text"),
    "容量": ("capacity", "num"),
    "单件重量上限": ("maxWeightPerItem", "num"),
    "负重乘数": ("encumberanceMult", "num"),
    "重量": ("weight", "num"),
    "容器物品限制": ("tagRestriction", "tags"),
    "腐坏时间(分钟)": ("decayMinutes", "num"),
}
CONTAINER_ORDER = ["id", "name", "capacity", "maxWeightPerItem", "encumberanceMult",
                   "weight", "tagRestriction", "decayMinutes"]

# 液体容器数据：表头 -> (字段名, 类型)
LIQUID_FIELDS = {
    "英文名": ("id", "text"),
    "中文名": ("name", "text"),
    "容积": ("capacity", "num"),
    "满重/u": ("fullWeight", "num"),
    "每升增重/u": ("weightPerLiter", "num"),
    "空重/u": ("emptyWeight", "num"),
    "重量随液体量改变": ("weightScales", "bool"),
    "仅限手持": ("handOnly", "bool"),
}
LIQUID_ORDER = ["id", "name", "capacity", "fullWeight", "weightPerLiter",
                "emptyWeight", "weightScales", "handOnly"]


def text_of(value) -> str:
    if value is None:
        return ""
    return str(value).strip()


def to_number(value):
    """能转数字就转数字（容忍 %/x/u 后缀），否则原样保留字符串，空 -> None。"""
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value
    raw = text_of(value)
    if not raw:
        return None
    m = NUM_RE.match(raw)
    if not m:
        return raw
    num = m.group(1)
    return float(num) if ("." in num or "e" in num.lower()) else int(num)


def to_bool(value):
    """是/否 -> true/false；其他值原样保留。"""
    raw = text_of(value)
    if not raw:
        return None
    if raw == "是":
        return True
    if raw == "否":
        return False
    return raw


def to_tags(value):
    """「无限制」= 无标签限制 -> []；「bullet（子弹）」-> 取原始 tag；空 -> None。"""
    raw = text_of(value)
    if not raw:
        return None
    if raw in ("无限制", "—", "-", "N/A"):
        return []
    tags = []
    for piece in TAG_SPLIT_RE.split(raw):
        piece = piece.strip()
        if not piece:
            continue
        m = TAG_NAME_RE.match(piece)
        tag = (m.group(1) if m else piece).strip()
        if tag:
            tags.append(tag)
    return tags


def convert(kind: str, value):
    if kind == "num":
        return to_number(value)
    if kind == "bool":
        return to_bool(value)
    if kind == "tags":
        return to_tags(value)
    raw = text_of(value)
    return raw if raw else None


def locate_header(ws):
    """定位真实表头行：含「英文ID」/「英文名」/「原名」的首行。"""
    limit = min(ws.max_row, 50)
    for row in ws.iter_rows(min_row=1, max_row=limit, max_col=ws.max_column):
        headers = [text_of(c.value) for c in row]
        if any(h in ID_HEADERS for h in headers):
            return row[0].row, headers
    raise SystemExit(f"[{ws.title}] 找不到含 {ID_HEADERS} 的表头行")


def read_rows(ws, header_row: int, headers):
    """表头之后 id 列为合法标识符的行；空行、标题行、注释行（如「字段说明：…」）跳过。"""
    id_col = next(i for i, h in enumerate(headers) if h in ID_HEADERS)
    out, skipped = [], []
    for row in ws.iter_rows(min_row=header_row + 1, max_row=ws.max_row, max_col=len(headers)):
        cells = [c.value for c in row]
        ident = text_of(cells[id_col]) if id_col < len(cells) else ""
        if not ident:
            continue
        if not IDENT_RE.match(ident):
            skipped.append((row[0].row, ident))
            continue
        out.append((row[0].row, ident, cells))
    return id_col, out, skipped


def build_records(headers, rows, fields, order):
    records = []
    for excel_row, ident, cells in rows:
        rec = {name: None for name in order}
        extra = {}
        for idx, header in enumerate(headers):
            if not header:
                continue
            value = cells[idx] if idx < len(cells) else None
            if header in fields:
                name, kind = fields[header]
                rec[name] = convert(kind, value)
            else:
                converted = to_number(value)
                extra[header] = converted
        rec["id"] = ident
        if extra:
            rec["extra"] = extra
        rec["_row"] = excel_row
        records.append(rec)
    return records


def load_item_ids():
    data = json.loads(ITEMS_PATH.read_text(encoding="utf-8"))
    items = data.get("items") if isinstance(data, dict) else data
    return {str(it.get("id")) for it in items if isinstance(it, dict) and it.get("id")}


def check_ids(label, records, item_ids):
    ids = [r["id"] for r in records]
    dupes = sorted({i for i in ids if ids.count(i) > 1})
    blanks = ids.count("")
    hit = [i for i in ids if i in item_ids]
    miss = [i for i in ids if i not in item_ids]
    print(f"  {label}: 行数={len(records)} unique_id={len(set(ids))} 空id={blanks} 重复id={dupes or '无'}")
    print(f"  {label}: 命中物品库 {len(hit)}/{len(ids)}，未命中 {len(miss)}: {miss or '（无）'}")
    return hit, miss


def main(argv):
    container_xlsx = Path(argv[1]) if len(argv) > 1 else CONTAINER_XLSX
    liquid_xlsx = Path(argv[2]) if len(argv) > 2 else LIQUID_XLSX

    wb_c = openpyxl.load_workbook(container_xlsx, data_only=True)
    ws_c = wb_c[CONTAINER_SHEET]
    c_header_row, c_headers = locate_header(ws_c)
    _, c_rows, c_skipped = read_rows(ws_c, c_header_row, c_headers)
    containers = build_records(c_headers, c_rows, CONTAINER_FIELDS, CONTAINER_ORDER)

    wb_l = openpyxl.load_workbook(liquid_xlsx, data_only=True)
    ws_l = wb_l[LIQUID_SHEET]
    l_header_row, l_headers = locate_header(ws_l)
    _, l_rows, l_skipped = read_rows(ws_l, l_header_row, l_headers)
    liquids = build_records(l_headers, l_rows, LIQUID_FIELDS, LIQUID_ORDER)

    print(f"[{container_xlsx.name}] sheet={CONTAINER_SHEET} 真实表头行={c_header_row} "
          f"数据行={len(containers)} (首行 {c_rows[0][0]}, 末行 {c_rows[-1][0]}) 列头 {len(c_headers)} "
          f"跳过非标识符行={len(c_skipped)}")
    print(f"[{liquid_xlsx.name}] sheet={LIQUID_SHEET} 真实表头行={l_header_row} "
          f"数据行={len(liquids)} (首行 {l_rows[0][0]}, 末行 {l_rows[-1][0]}) 列头 {len(l_headers)} "
          f"跳过非标识符行={len(l_skipped)}")
    for row_no, value in c_skipped + l_skipped:
        print(f"    跳过 第{row_no}行 id列原文: {value[:40]!r}")

    item_ids = load_item_ids()
    print(f"物品库: {ITEMS_PATH.relative_to(ROOT)} 共 {len(item_ids)} 个 id")
    ch, cm = check_ids("itemContainers", containers, item_ids)
    lh, lm = check_ids("liquidVessels", liquids, item_ids)
    all_ids = [r["id"] for r in containers + liquids]
    print(f"  合计: {len(all_ids)} 条，命中 {len(ch) + len(lh)}，未命中 {len(cm) + len(lm)}")

    payload = {
        "generatedBy": "tools/extract_vessels.py",
        "source": [container_xlsx.name, liquid_xlsx.name],
        "itemContainers": [{k: v for k, v in r.items() if k != "_row"} for r in containers],
        "liquidVessels": [{k: v for k, v in r.items() if k != "_row"} for r in liquids],
    }
    OUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"已写出 {OUT_PATH.relative_to(ROOT)} ({OUT_PATH.stat().st_size} 字节)")


if __name__ == "__main__":
    main(sys.argv)
