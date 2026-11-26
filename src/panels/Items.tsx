/* 物品栏：六槽径向圆盘 + 穿戴格 + 选中详情 + 添加物品 + 液体弹窗。
   行为对齐旧版 src/panels.js:99-554（Panels.items / liquidDialog），
   圆盘几何常量照抄 panels.js:118-126（WEDGES/SCALE/STAGE/R_MID）。 */
import {Fragment, useEffect, useMemo, useState} from 'react';
import type {ReactNode} from 'react';
import {HStack, VStack, Stack, StackItem} from '@astryxdesign/core/Stack';
import {Grid} from '@astryxdesign/core/Grid';
import {Text} from '@astryxdesign/core/Text';
import {Heading} from '@astryxdesign/core/Heading';
import {Badge} from '@astryxdesign/core/Badge';
import {Button} from '@astryxdesign/core/Button';
import {TextInput} from '@astryxdesign/core/TextInput';
import {NumberInput} from '@astryxdesign/core/NumberInput';
import {Selector} from '@astryxdesign/core/Selector';
import {Switch} from '@astryxdesign/core/Switch';
import {List, ListItem} from '@astryxdesign/core/List';
import {Dialog, DialogHeader} from '@astryxdesign/core/Dialog';
import {Tooltip} from '@astryxdesign/core/Tooltip';
import {ScrollableArea} from '@astryxdesign/core/ScrollableArea';
import {SelectableCard} from '@astryxdesign/core/SelectableCard';
import {StatusDot} from '@astryxdesign/core/StatusDot';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {useToast} from '@astryxdesign/core/Toast';
import {Panel, Group, IconBox} from '../ui/kit';
import {useStore, store} from '../lib/store';
import {
  DB, ART, HAND_SLOTS, SWATCHES, WATERCOMP, itemName, itemEn, itemDescRaw,
  liquidName, liquidColor, itemCapacity, isLiquidVessel, wearSlotName,
  slotLabel, slotLimb
} from '../lib/data';
import {richNodes} from '../ui/rich';

/* ---------------- 旧实现照搬的常量与纯函数 ---------------- */

const WEDGES = [
  {s: 2, img: 'radialUp',        a: 0,   w: 91, h: 48, ox: 45.5, oy: 89.0},
  {s: 1, img: 'radialUpRight',   a: 60,  w: 66, h: 78, ox: -24.0, oy: 76.5},
  {s: 5, img: 'radialDownRight', a: 120, w: 66, h: 80, ox: -25.0, oy: 0.5},
  {s: 4, img: 'radialDown',      a: 180, w: 92, h: 50, ox: 46.0, oy: -41.0},
  {s: 3, img: 'radialDownLeft',  a: 240, w: 68, h: 81, ox: 92.0, oy: 0.0},
  {s: 0, img: 'radialUpLeft',    a: 300, w: 68, h: 80, ox: 92.0, oy: 78.5}
];
const SCALE = 2;
const STAGE = 368;
const R_MID = 67.0;

function gkey(it: any): string | null {
  return it.slot >= 0 ? 's' + it.slot : it.wearSlot ? 'w' + it.wearSlot : null;
}

function getWaterComp(save: any, i: number): {comp: any; key: string} | null {
  const c = (save.itemComponents || [])[i];
  if (!c) return null;
  if (c[WATERCOMP]) return {comp: c[WATERCOMP], key: WATERCOMP};
  for (const k of Object.keys(c)) if (k.startsWith('WaterContainerItem')) return {comp: c[k], key: k};
  return null;
}

function vTotal(stack: any[]): number {
  return stack.reduce((a, x) => a + (x.amount || 0), 0);
}

function syncCondition(it: any, stack: any[], cap: number | null): void {
  if (cap) it.condition = Math.min(1, Math.round(vTotal(stack) / cap * 10000) / 10000);
}

function fillLabel(save: any, i: number): string {
  const it = (save.items || [])[i];
  if (!it) return '';
  if (isLiquidVessel(it.id)) {
    const w = getWaterComp(save, i);
    const stack = (w && w.comp && w.comp.stack) || [];
    const cap = itemCapacity(it.id);
    const t = vTotal(stack);
    return Math.round(t) + (cap != null ? '/' + cap : '') + ' ml';
  }
  return Math.round(it.condition * 100) + '%';
}

/* 详情行：与 kit.FieldRow 同构，但 changed 由按 id 对齐的原始快照算出 */
function Row({label, code, changed, children}: {
  label: string; code?: string; changed?: boolean; children: ReactNode;
}) {
  return (
    <HStack gap={2} vAlign="center" width="100%" paddingBlock={0.5}>
      <HStack gap={1} vAlign="center" width="44%">
        <VStack gap={0} width="100%">
          <HStack gap={1} vAlign="center">
            {changed ? <StatusDot variant="warning" label="已修改" /> : null}
            <Text type="label" maxLines={1}>{label}</Text>
          </HStack>
          {code ? <Text type="code" size="xs" color="secondary" maxLines={1}>{code}</Text> : null}
        </VStack>
      </HStack>
      <VStack gap={0} width="56%">{children}</VStack>
    </HStack>
  );
}

/* ---------------- 左：六槽径向圆盘 ---------------- */

function RadialDisc({save, items, slotIdx, selHead, onPick}: {
  save: any; items: any[]; slotIdx: Record<number, number>;
  selHead: number | null; onPick: (i: number) => void;
}) {
  const showToast = useToast();
  return (
    <Stack data-stage="radial" style={{position: 'relative', width: STAGE, height: STAGE, margin: '0 auto'}}>
      <Stack
        style={{
          position: 'absolute', left: '50%', top: '50%', width: 362, height: 362,
          transform: 'translate(-50%, -50%)', zIndex: 0,
          background: 'var(--color-background-card)',
          border: 'var(--border-width) solid var(--color-border)',
          borderRadius: 'var(--radius-full)'
        }}
      />
      {WEDGES.map(wd => {
        const idx = slotIdx[wd.s];
        const on = idx != null && selHead === idx;
        const rad = wd.a * Math.PI / 180;
        const mx = STAGE / 2 + Math.sin(rad) * R_MID * SCALE;
        const my = STAGE / 2 - Math.cos(rad) * R_MID * SCALE;
        const art = ART.user[wd.img];
        return (
          <Fragment key={wd.s}>
            <Tooltip content={slotLabel(wd.s) + (slotLimb(wd.s) ? ' · ' + slotLimb(wd.s) : '')}>
              <Stack
                data-slot={String(wd.s)}
                data-state={idx == null ? 'empty' : on ? 'on' : 'idle'}
                role="button"
                tabIndex={idx == null ? -1 : 0}
                aria-label={slotLabel(wd.s) + (idx == null ? '（空）' : '：' + itemName(items[idx].id))}
                aria-pressed={on}
                onClick={() => {
                  if (idx == null) { showToast({body: slotLabel(wd.s) + ' 是空的', type: 'error'}); return; }
                  onPick(idx);
                }}
                onKeyDown={e => {
                  if (e.key !== 'Enter' && e.key !== ' ') return;
                  e.preventDefault();
                  if (idx == null) { showToast({body: slotLabel(wd.s) + ' 是空的', type: 'error'}); return; }
                  onPick(idx);
                }}
                style={{
                  position: 'absolute', left: STAGE / 2 - wd.ox * SCALE, top: STAGE / 2 - wd.oy * SCALE,
                  width: wd.w * SCALE, height: wd.h * SCALE, zIndex: 1,
                  opacity: idx == null ? 0.42 : on ? 1 : 0.9,
                  cursor: idx == null ? 'default' : 'pointer'
                }}
              >
                {art
                  ? <img src={art} alt="" draggable={false}
                      style={{width: '100%', height: '100%', display: 'block',
                        imageRendering: 'pixelated', mixBlendMode: 'multiply',
                        opacity: on ? 0.5 : 1}} />
                  : null}
              </Stack>
            </Tooltip>
            <Stack
              data-face={String(wd.s)}
              style={{
                position: 'absolute', left: mx, top: my, transform: 'translate(-50%, -50%)',
                zIndex: 2, width: 'max-content'
              }}
            >
              <VStack gap={0} hAlign="center" width="max-content">
                {idx != null
                  ? <IconBox id={items[idx].id} size={32} />
                  : <Text type="supporting" size="2xs" color="secondary">空</Text>}
                <Text type="label" size="2xs" textWrap="nowrap">{slotLabel(wd.s)}</Text>
                {idx != null
                  ? <Text type="code" size="2xs" textWrap="nowrap">{fillLabel(save, idx)}</Text>
                  : null}
              </VStack>
            </Stack>
          </Fragment>
        );
      })}
      <Stack
        style={{position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', zIndex: 3}}
        padding={2}
      >
        <VStack gap={0} hAlign="center">
          <Text type="code" size="sm" textWrap="nowrap">物品栏</Text>
          <Text type="supporting" size="2xs" textWrap="nowrap">{items.length + ' 件'}</Text>
        </VStack>
      </Stack>
    </Stack>
  );
}

/* ---------------- 液体弹窗 ---------------- */

function LiquidDialog({open, onClose, i}: {open: boolean; onClose: () => void; i: number | null}) {
  const st = useStore();
  const save = st.save;
  const items = (save && save.items) || [];
  const it = i != null ? items[i] : null;
  const cap = it ? itemCapacity(it.id) : null;
  const w = it ? getWaterComp(save, i!) : null;
  const stack = (w && w.comp && w.comp.stack) || [];
  const tot = vTotal(stack);

  const createComp = () => {
    store.mutate(s => {
      const cs = (s.itemComponents = s.itemComponents || []);
      cs[i!] = cs[i!] || {};
      cs[i!][WATERCOMP] = {stack: []};
      s.items[i!].condition = 0;
    });
  };

  return (
    <Dialog isOpen={open} onOpenChange={o => { if (!o) onClose(); }} width={660} padding={4}>
      {it ? (
        <Fragment>
          <DialogHeader
            title={'液体内容 · ' + itemName(it.id)}
            subtitle={it.id + (cap != null ? ' · 容量 ' + cap + ' ml' : ' · 容量未知')}
            onOpenChange={() => onClose()}
          />
          <VStack gap={3}>
            {!w && isLiquidVessel(it.id) ? (
              <Fragment>
                <Text type="body">这件物品在游戏里能装液体，但存档里没有它的液体组件记录。创建后耐久会置 0（液体容器的耐久就是装填率）。</Text>
                <HStack gap={2}>
                  <Button label="创建液体组件" onClick={createComp} />
                </HStack>
              </Fragment>
            ) : !w ? (
              <Text type="body">这件物品不是液体容器。</Text>
            ) : (
              <Fragment>
                <HStack gap={1.5} vAlign="center" wrap="wrap">
                  <Text type="body">
                    合计 {Math.round(tot)}{cap ? ' / 容量 ' + cap + ' ml（' + (Math.round(tot / cap * 1000) / 10) + '%）' : ' ml'}
                  </Text>
                  {cap && tot > cap ? <Badge variant="error" label="超出容量" /> : null}
                  <Text type="supporting" size="sm">耐久（装填率）随液体自动同步</Text>
                </HStack>
                {stack.map((s: any, idx: number) => {
                  const liquidOptions = DB.liquids.map((l: any) => ({value: l.id, label: l.name || l.id}));
                  if (!DB.liquidById[s.liquidId]) liquidOptions.push({value: s.liquidId, label: s.liquidId + '（未知）'});
                  return (
                    <HStack key={idx} gap={1.5} vAlign="center" width="100%">
                      <Stack style={{width: 10, height: 10, background: liquidColor(s.liquidId)}} />
                      <Selector
                        label="液体" isLabelHidden size="sm" width="100%" options={liquidOptions}
                        value={s.liquidId}
                        onChange={v => {
                          if (!v) return;
                          store.mutate(sv => {
                            const w2 = getWaterComp(sv, i!);
                            if (w2) w2.comp.stack[idx].liquidId = v;
                          });
                        }}
                      />
                      <NumberInput
                        label="数量" isLabelHidden size="sm" width={120} value={s.amount} min={0} step={1} units="ml"
                        onChange={v => {
                          store.mutate(sv => {
                            const w2 = getWaterComp(sv, i!);
                            if (!w2) return;
                            const stk = w2.comp.stack;
                            stk[idx].amount = Math.max(0, v);
                            syncCondition(sv.items[i!], stk, itemCapacity(sv.items[i!].id));
                          });
                        }}
                      />
                      <Button label="移除" size="sm" variant="ghost" onClick={() => {
                        store.mutate(sv => {
                          const w2 = getWaterComp(sv, i!);
                          if (!w2) return;
                          const stk = w2.comp.stack;
                          stk.splice(idx, 1);
                          syncCondition(sv.items[i!], stk, itemCapacity(sv.items[i!].id));
                        });
                      }} />
                    </HStack>
                  );
                })}
                {stack.length === 0 ? <Text type="supporting">（空）</Text> : null}
                <HStack gap={2}>
                  <Button label="＋ 添加一种液体" onClick={() => {
                    store.mutate(sv => {
                      const w2 = getWaterComp(sv, i!);
                      if (!w2) return;
                      const stk = (w2.comp.stack = w2.comp.stack || []);
                      const used = vTotal(stk);
                      const left = cap ? Math.max(0, Math.round(cap - used)) : 100;
                      stk.push({liquidId: 'water', amount: left || 100});
                      syncCondition(sv.items[i!], stk, cap);
                    });
                  }} />
                </HStack>
              </Fragment>
            )}
          </VStack>
        </Fragment>
      ) : null}
    </Dialog>
  );
}

/* ---------------- 物品栏面板 ---------------- */

export default function ItemsPanel() {
  const st = useStore();
  const showToast = useToast();
  const save = st.save || {};
  const items: any[] = save.items || [];

  const [sel, setSel] = useState<number | null>(() => (items.length ? 0 : null));
  const [liquidFor, setLiquidFor] = useState<number | null>(null);
  const [delAsk, setDelAsk] = useState<{i: number; kids: number[]} | null>(null);

  const [q, setQ] = useState('');
  const [sort, setSort] = useState('name');
  const [picked, setPicked] = useState<string | null>(null);
  const [condAdd, setCondAdd] = useState(100);
  const [target, setTarget] = useState('s0');

  useEffect(() => {
    if (sel != null && sel >= items.length) setSel(items.length ? 0 : null);
  }, [items.length, sel]);

  const groupOf = useMemo(() => {
    const perGroup: Record<string, number[]> = {};
    items.forEach((it, i) => {
      const k = gkey(it);
      if (k) (perGroup[k] = perGroup[k] || []).push(i);
    });
    return (i: number) => {
      const it = items[i];
      const k = it ? gkey(it) : null;
      return k ? perGroup[k] : [i];
    };
  }, [items]);

  const isHead = (i: number) => groupOf(i)[0] === i;
  const childrenOf = (i: number) => (isHead(i) ? groupOf(i).slice(1) : []);

  const slotIdx: Record<number, number> = {};
  items.forEach((it, i) => { if (it.slot >= 0 && !(it.slot in slotIdx)) slotIdx[it.slot] = i; });

  const selHead: number | null = sel != null && items[sel] ? groupOf(sel)[0] : null;

  const wear: Record<string, number[]> = {};
  items.forEach((it, i) => { if (it.slot < 0 && it.wearSlot) (wear[it.wearSlot] = wear[it.wearSlot] || []).push(i); });
  const metaWear = (DB.meta.wearSlots || []).map((w: any) => w.id);
  const wearOrder = Object.keys(wear).sort((a, b) => {
    const ia = metaWear.indexOf(a), ib = metaWear.indexOf(b);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });

  const it = sel != null ? items[sel] : null;
  const origItem = useMemo(() => {
    if (!it) return null;
    const oi = st.orig && st.orig.items ? st.orig.items : [];
    return oi.find((x: any) => x && x.id === it.id) || null;
  }, [st.orig, it]);
  const differs = (key: string) =>
    origItem ? JSON.stringify(origItem[key]) !== JSON.stringify(it[key]) : false;

  const patchItem = (i: number, patch: Record<string, any>) => {
    store.mutate(s => { const t = s.items[i]; if (t) Object.assign(t, patch); });
  };

  const applySetVolume = (i: number, target: number): boolean => {
    const w0 = getWaterComp(store.get().save, i);
    const stack0 = (w0 && w0.comp && w0.comp.stack) || [];
    if (!stack0.length) {
      showToast({body: '这件容器里还没有液体，先在下方「液体」里添加一种', type: 'error'});
      return false;
    }
    store.mutate(sv => {
      const w2 = getWaterComp(sv, i);
      if (!w2) return;
      const stk = w2.comp.stack;
      const cur = vTotal(stk);
      if (cur <= 0) stk.forEach((x: any, k: number) => { x.amount = k === 0 ? target : 0; });
      else {
        const k = target / cur;
        stk.forEach((x: any) => { x.amount = Math.round((x.amount || 0) * k * 100) / 100; });
      }
      syncCondition(sv.items[i], stk, itemCapacity(sv.items[i].id));
    });
    return true;
  };

  const removeItems = (kill: Set<number>) => {
    store.mutate(s => {
      const ki: any[] = [];
      const kc: any[] = [];
      (s.items || []).forEach((x: any, idx: number) => {
        if (kill.has(idx)) return;
        ki.push(x);
        kc.push((s.itemComponents || [])[idx] || {});
      });
      s.items = ki;
      s.itemComponents = kc;
    });
    setSel(null);
    showToast({body: '已删除'});
  };

  const changePos = (i: number, v: string) => {
    store.mutate(s => {
      const t = s.items[i];
      if (v.charAt(0) === 's') { t.slot = parseInt(v.slice(1), 10); t.wearSlot = null; }
      else { t.slot = -1; t.wearSlot = v.slice(2); }
    });
    const to = v.charAt(0) === 's' ? slotLabel(parseInt(v.slice(1), 10)) : wearSlotName(v.slice(2));
    showToast({body: '位置已改为 ' + to});
  };

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    let arr = DB.items.filter((d: any) =>
      !kw || (d.name && d.name.includes(kw)) ||
      d.id.toLowerCase().includes(kw) ||
      (d.nameEn && d.nameEn.toLowerCase().includes(kw)));
    if (sort === 'size') arr = arr.slice().sort((a: any, b: any) => (b.weight || 0) - (a.weight || 0));
    else if (sort === 'cat') arr = arr.slice().sort((a: any, b: any) =>
      String(a.category).localeCompare(String(b.category)) || a.id.localeCompare(b.id));
    else arr = arr.slice().sort((a: any, b: any) => a.id.localeCompare(b.id));
    return arr;
  }, [q, sort]);
  const shown = filtered.slice(0, 400);

  const posOptions: any[] = [];
  for (let s2 = 0; s2 < HAND_SLOTS; s2++) posOptions.push({value: 's' + s2, label: slotLabel(s2)});
  const wearMeta = (DB.meta.wearSlots || []).slice();
  items.forEach((x: any) => {
    if (x.wearSlot && !wearMeta.some((w: any) => w.id === x.wearSlot)) wearMeta.push({id: x.wearSlot, label: x.wearSlot});
  });
  wearMeta.forEach((w: any) => posOptions.push({value: 'w:' + w.id, label: '穿戴 · ' + (w.label || w.id)}));

  const targetOptions: any[] = [];
  for (let s3 = 0; s3 < HAND_SLOTS; s3++) {
    const occ = items.some((x: any) => x.slot === s3);
    targetOptions.push({value: 's' + s3, label: slotLabel(s3) + (occ ? '（已占用）' : '（空）')});
  }
  (DB.meta.wearSlots || []).forEach((w: any) =>
    targetOptions.push({value: 'w:' + w.id, label: '穿戴 · ' + (w.label || w.id)}));
  const hostable: {i: number; it: any}[] = [];
  items.forEach((x: any, idx: number) => {
    if (DB.containers && DB.containers.containerIds && DB.containers.containerIds.includes(x.id))
      hostable.push({i: idx, it: x});
  });
  if (hostable.length) {
    targetOptions.push({
      type: 'section',
      title: '放进已有容器',
      options: hostable.map(o => {
        const where = o.it.slot >= 0 ? slotLabel(o.it.slot) : '穿戴 · ' + wearSlotName(o.it.wearSlot);
        return {value: 'c' + o.i, label: '容器内 · ' + itemName(o.it.id) + '（' + where + '）'};
      })
    });
  }

  const addItem = () => {
    if (!picked) { showToast({body: '先在下方列表里选一个物品', type: 'error'}); return; }
    const v = target;
    if (v.charAt(0) === 'c') {
      const pi = parseInt(v.slice(1), 10);
      if (!items[pi]) { showToast({body: '宿主已不存在', type: 'error'}); return; }
    }
    const pickedIsVessel = !!isLiquidVessel(picked);
    const pctIn = Math.round(Math.max(0, Math.min(100, condAdd)) * 10) / 1000;
    const item: any = {
      id: picked, condition: pickedIsVessel ? 0 : pctIn,
      slot: -1, wearSlot: null, favourited: false, label: '', swatch: 0
    };
    const newComp: any = pickedIsVessel ? {[WATERCOMP]: {stack: []}} : {};
    let msg = '';
    store.mutate(s => {
      const comps = (s.itemComponents = s.itemComponents || []);
      if (v.charAt(0) === 's') {
        item.slot = parseInt(v.slice(1), 10);
        s.items.push(item); comps.push(newComp);
        setSel(s.items.length - 1);
        msg = '已添加：' + itemName(picked) + (pickedIsVessel ? '（空容器，去「液体」里装）' : '');
      } else if (v.charAt(0) === 'w') {
        item.wearSlot = v.slice(2);
        s.items.push(item); comps.push(newComp);
        setSel(s.items.length - 1);
        msg = '已添加：' + itemName(picked) + (pickedIsVessel ? '（空容器，去「液体」里装）' : '');
      } else {
        const pi = parseInt(v.slice(1), 10);
        const parent = s.items[pi];
        item.slot = parent.slot; item.wearSlot = parent.wearSlot;
        s.items.splice(pi + 1, 0, item); comps.splice(pi + 1, 0, newComp);
        setSel(pi + 1);
        msg = '已放进 ' + itemName(parent.id) + ' 的容器' + (pickedIsVessel ? '（空容器）' : '');
      }
    });
    showToast({body: msg});
  };

  /* 详情数据 */
  const head = it ? groupOf(sel!) [0] : null;
  const kids = head != null ? childrenOf(head) : [];
  const hostName = it && head != null && sel !== head ? itemName(items[head].id) : null;
  const where = it ? (it.slot >= 0 ? slotLabel(it.slot) : '穿戴 · ' + wearSlotName(it.wearSlot)) : '';
  const isVessel = it ? !!isLiquidVessel(it.id) : false;
  const wcomp = it ? getWaterComp(save, sel!) : null;
  const vstack = (wcomp && wcomp.comp && wcomp.comp.stack) || [];
  const vcap = it ? itemCapacity(it.id) : null;
  const vTot = vTotal(vstack);
  const vPct = vcap ? Math.round(vTot / vcap * 1000) / 10 : 0;
  const pctVal = it ? Math.round(it.condition * 1000) / 10 : 0;
  const desc = it ? richNodes(itemDescRaw(it.id)) : [];
  const rowCount = isVessel ? 5 : 4;

  const fillVessel = () => {
    if (vcap == null) { showToast({body: '这件物品的容量未知，无法自动装满', type: 'error'}); return; }
    if (!vstack.length) { showToast({body: '先在「液体」里添加一种液体', type: 'error'}); return; }
    applySetVolume(sel!, vcap);
    showToast({body: '已装满'});
  };

  return (
    <Panel title="物品栏" count={items.length + ' 件'}
      description="左：六槽径向圆盘与穿戴位；中：选中物品详情（液体容器按装填量同步 condition）；右：搜索添加物品。">
      <HStack gap={3} wrap="wrap" vAlign="start" width="100%">
        <VStack width={368} gap={3}>
          <Group title="槽位" count={HAND_SLOTS + ' 个'}>
            <RadialDisc save={save} items={items} slotIdx={slotIdx} selHead={selHead} onPick={setSel} />
          </Group>
          <Group title="穿戴" count={Object.keys(wear).length + ' 位'}>
            {wearOrder.length ? (
              <Grid columns={{minWidth: 104, max: 3}} gap={1.5}>
                {wearOrder.map(wid => {
                  const list = wear[wid];
                  const h = list[0];
                  return (
                    <SelectableCard
                      key={wid}
                      label={wearSlotName(wid) + (list.length > 1 ? ' 等 ' + list.length + ' 件' : '')}
                      isSelected={selHead === h}
                      onChange={() => setSel(h)}
                      padding={1.5}
                      width="100%"
                    >
                      <VStack gap={0.5} hAlign="center" width="100%">
                        <IconBox id={items[h].id} size={30} />
                        <Text type="label" size="2xs" maxLines={1} hasTruncateTooltip={false}>{wearSlotName(wid)}</Text>
                        {list.length > 1 ? <Badge variant="warning" label={'+' + (list.length - 1)} /> : null}
                      </VStack>
                    </SelectableCard>
                  );
                })}
              </Grid>
            ) : <Text type="supporting">没有穿戴中的物品</Text>}
          </Group>
        </VStack>

        <StackItem size="fill" style={{minWidth: 320, flexBasis: 320}}>
          <VStack gap={3}>
            {it ? (
              <Fragment>
                <HStack gap={2} vAlign="center" width="100%" data-detail-id={it.id}>
                  <IconBox id={it.id} size={40} />
                  <StackItem size="fill">
                    <VStack gap={0}>
                      <Heading level={3} maxLines={1}>{itemName(it.id)}</Heading>
                      <Text type="code" size="sm" color="secondary" maxLines={1}>
                        {it.id + (itemEn(it.id) ? ' · ' + itemEn(it.id) : '')}
                      </Text>
                    </VStack>
                  </StackItem>
                  <Badge variant="neutral" label={where} />
                </HStack>

                {(() => {
                  const sibs = groupOf(sel!);
                  if (sibs.length < 2) return null;
                  return (
                    <HStack gap={1} vAlign="center" wrap="wrap">
                      <Text type="supporting" size="sm">同槽 {sibs.length} 件</Text>
                      {sibs.map(gi => (
                        <Button key={gi} size="sm" label={itemName(items[gi].id)}
                          variant={gi === sel ? 'primary' : 'ghost'}
                          onClick={() => setSel(gi)} />
                      ))}
                    </HStack>
                  );
                })()}

                {hostName ? (
                  <Text type="supporting">
                    这件物品装在容器「{hostName}」里（读档时会被塞进它的 Container）。下面各项改的都是这一件。
                  </Text>
                ) : null}
                <Text type="body">{desc.length ? desc : '（无描述）'}</Text>

                <Group title="详细参数" count={rowCount + ' 项'}>
                  {isVessel ? (
                    <Row label="装填量" code="condition = 液体总量 / 容量" changed={differs('condition')}>
                      <HStack gap={1.5} vAlign="center" width="100%">
                        <NumberInput
                          label="装填量" isLabelHidden size="sm" width="100%"
                          value={Math.round(vTot)} min={0} max={vcap ?? null} step={1} units="ml"
                          onChange={v => {
                            const t = Math.max(0, vcap != null ? Math.min(vcap, v) : v);
                            applySetVolume(sel!, t);
                          }}
                        />
                        <Text type="supporting" size="sm" textWrap="nowrap">
                          / {vcap != null ? vcap : '?'} ml（{vPct}%）
                        </Text>
                      </HStack>
                    </Row>
                  ) : (
                    <Row label="耐久" code="condition" changed={differs('condition')}>
                      <NumberInput
                        label="耐久" isLabelHidden size="sm" width="100%"
                        value={pctVal} min={0} max={100} step={0.1} units="%"
                        onChange={v => patchItem(sel!, {condition: Math.round(Math.max(0, Math.min(100, v)) * 10) / 1000})}
                      />
                    </Row>
                  )}

                  <Row label="位置" code="slot / wearSlot" changed={differs('slot') || differs('wearSlot')}>
                    <Selector
                      label="位置" isLabelHidden size="sm" width="100%" options={posOptions}
                      value={it.slot >= 0 ? 's' + it.slot : 'w:' + it.wearSlot}
                      onChange={v => { if (v) changePos(sel!, v); }}
                    />
                  </Row>

                  <Row label="收藏 / 颜色" code="favourited / swatch" changed={differs('favourited') || differs('swatch')}>
                    <HStack gap={2} vAlign="center" wrap="wrap">
                      <Switch label="收藏" size="sm" value={!!it.favourited}
                        onChange={c => patchItem(sel!, {favourited: c})} />
                      <HStack gap={1}>
                        {SWATCHES.map(sw => (
                          <Tooltip key={sw.i} content={'#' + sw.i + ' ' + sw.name}>
                            <Stack
                              data-swatch={String(sw.i)}
                              data-swatch-on={String((it.swatch | 0) === sw.i)}
                              role="radio"
                              tabIndex={0}
                              aria-checked={(it.swatch | 0) === sw.i}
                              aria-label={'染色 #' + sw.i + ' ' + sw.name}
                              onClick={() => patchItem(sel!, {swatch: sw.i})}
                              onKeyDown={e => {
                                if (e.key !== 'Enter' && e.key !== ' ') return;
                                e.preventDefault();
                                patchItem(sel!, {swatch: sw.i});
                              }}
                              style={{
                                width: 18, height: 18, cursor: 'pointer', background: sw.hex,
                                outline: (it.swatch | 0) === sw.i
                                  ? 'var(--border-width) solid var(--color-accent)'
                                  : 'var(--border-width) solid var(--color-border)'
                              }}
                            />
                          </Tooltip>
                        ))}
                      </HStack>
                    </HStack>
                  </Row>

                  <Row label="自定义名" code="label" changed={differs('label')}>
                    <TextInput
                      label="自定义名" isLabelHidden size="sm" width="100%"
                      value={String(it.label || '')} placeholder="（无）"
                      onChange={s => patchItem(sel!, {label: s})}
                    />
                  </Row>

                  {isVessel ? (
                    <Row label="液体" code="WaterContainerItem.stack">
                      <VStack gap={1} width="100%">
                        <HStack gap={1} wrap="wrap" vAlign="center">
                          {vstack.length
                            ? vstack.map((x: any, li: number) => (
                                <Badge key={li}
                                  variant={vcap && vTot > vcap ? 'error' : 'neutral'}
                                  icon={<Stack style={{width: 8, height: 8, background: liquidColor(x.liquidId)}} />}
                                  label={liquidName(x.liquidId) + ' ' + Math.round(x.amount)} />
                              ))
                            : <Text type="supporting" size="sm">空</Text>}
                          <Text type="code" size="sm">{Math.round(vTot) + (vcap ? '/' + vcap : '') + ' ml'}</Text>
                        </HStack>
                        <HStack gap={2}>
                          <Button label="编辑" size="sm" onClick={() => setLiquidFor(sel)} />
                        </HStack>
                      </VStack>
                    </Row>
                  ) : null}
                </Group>

                {kids.length ? (
                  <Group title="容器内容" count={kids.length + ' 件'}>
                    <List hasDividers density="compact">
                      {kids.map((ci: number) => (
                        <ListItem
                          key={ci}
                          data-child={String(ci)}
                          label={itemName(items[ci].id)}
                          description={items[ci].id}
                          startContent={<IconBox id={items[ci].id} />}
                          endContent={
                            <HStack gap={1.5} vAlign="center">
                              <Text type="code" size="sm">{fillLabel(save, ci)}</Text>
                              <Button label="移除" size="sm" variant="ghost"
                                onClick={(e: any) => {
                                  e.stopPropagation();
                                  removeItems(new Set([ci]));
                                }} />
                            </HStack>
                          }
                          isSelected={sel === ci}
                          onClick={() => setSel(ci)}
                        />
                      ))}
                    </List>
                    <Text type="supporting" size="sm">点一行即可编辑容器里的这件物品；「移除」会删除该件物品。</Text>
                  </Group>
                ) : null}

                <Group title="操作">
                  <HStack gap={2} wrap="wrap">
                    {hostName
                      ? <Button label={'← 回到「' + itemName(items[head!].id) + '」'} onClick={() => setSel(head!)} />
                      : null}
                    {isVessel
                      ? <Button label="装满液体" onClick={fillVessel} />
                      : <Button label="耐久满" onClick={() => patchItem(sel!, {condition: 1})} />}
                    <Button label="删除此物品" variant="destructive" onClick={() => {
                      const killKids = isHead(sel!) ? childrenOf(sel!) : [];
                      if (killKids.length) setDelAsk({i: sel!, kids: killKids});
                      else removeItems(new Set([sel!]));
                    }} />
                  </HStack>
                </Group>
              </Fragment>
            ) : (
              <Group title="详细参数">
                <EmptyState title="左侧点一个槽位或穿戴位查看物品" description="右侧可以搜索并添加物品。" isCompact />
              </Group>
            )}
          </VStack>
        </StackItem>

        <VStack width={340} gap={3}>
          <Group title="添加物品">
            <VStack gap={2} width="100%">
              <TextInput
                label="搜索" isLabelHidden type="search" size="sm" width="100%"
                placeholder="搜索物品以添加…" value={q} onChange={setQ} hasClear
              />
              <Row label="耐久" code="condition">
                <NumberInput
                  label="耐久" isLabelHidden size="sm" width="100%"
                  value={condAdd} min={0} max={100} step={1} units="%" onChange={setCondAdd}
                />
              </Row>
              <Row label="放到" code="槽位 / 容器">
                <Selector
                  label="放到" isLabelHidden size="sm" width="100%" options={targetOptions}
                  value={target} onChange={v => { if (v) setTarget(v); }}
                />
              </Row>
              <Text type="supporting" size="sm">
                液体容器（水瓶 / 注射器 / 汽水罐…）的耐久就是装填率，添加时按空容器入库，装液体请到详情页。
              </Text>
              <Button label="确认添加" variant="primary" width="100%" onClick={addItem} />
            </VStack>
          </Group>
          <Group title="全部物品" count={'显示 ' + shown.length + ' / ' + DB.items.length}>
            <HStack gap={2} vAlign="center">
              <Selector
                label="排序" isLabelHidden size="sm" width={130}
                options={[
                  {value: 'name', label: '按名字'},
                  {value: 'size', label: '按图标大小'},
                  {value: 'cat', label: '按分类'}
                ]}
                value={sort} onChange={v => { if (v) setSort(v); }}
              />
            </HStack>
            <ScrollableArea label="物品搜索结果" height="52vh">
              {shown.length ? (
                <List hasDividers density="compact">
                  {shown.map((d: any) => (
                    <ListItem
                      key={d.id}
                      data-item-id={d.id}
                      label={d.name || d.id}
                      description={d.id}
                      startContent={<IconBox id={d.id} />}
                      endContent={<Text type="code" size="sm">{d.weight != null ? d.weight + 'u' : ''}</Text>}
                      isSelected={picked === d.id}
                      onClick={() => setPicked(d.id)}
                    />
                  ))}
                </List>
              ) : <Text type="supporting">没有匹配的物品</Text>}
            </ScrollableArea>
            {filtered.length > shown.length
              ? <Text type="supporting" size="sm">还有 {filtered.length - shown.length} 条未显示，请再输入关键字</Text>
              : null}
          </Group>
        </VStack>
      </HStack>

      <LiquidDialog open={liquidFor != null} onClose={() => setLiquidFor(null)} i={liquidFor} />

      <Dialog isOpen={delAsk != null} onOpenChange={o => { if (!o) setDelAsk(null); }} width={440} padding={4}>
        {delAsk ? (
          <Fragment>
            <DialogHeader title="删除此物品" subtitle={itemName(items[delAsk.i]?.id)} onOpenChange={() => setDelAsk(null)} />
            <VStack gap={3}>
              <Text type="body">这个槽位里还有 {delAsk.kids.length} 件物品在它的容器中。</Text>
              <HStack gap={2} hAlign="end">
                <Button label="取消" variant="ghost" onClick={() => setDelAsk(null)} />
                <Button label="只删这一件" onClick={() => {
                  removeItems(new Set([delAsk.i]));
                  setDelAsk(null);
                }} />
                <Button label="一起删除" variant="destructive" onClick={() => {
                  removeItems(new Set([delAsk.i, ...delAsk.kids]));
                  setDelAsk(null);
                }} />
              </HStack>
            </VStack>
          </Fragment>
        ) : null}
      </Dialog>
    </Panel>
  );
}
