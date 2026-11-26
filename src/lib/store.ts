/* 存档状态：单一来源（save 为工作副本，orig 为读入快照），React 通过 version 订阅 */
import {useSyncExternalStore} from 'react';
import type {JsonPath, SaveState} from './types';

const clone = (v: any) => (v == null ? v : JSON.parse(JSON.stringify(v)));

let state: SaveState = {save: null, orig: null, fileName: '', fileHandle: null, version: 0};
const listeners = new Set<() => void>();

function emit() {
  state = {...state, version: state.version + 1};
  for (const l of listeners) l();
}

export const store = {
  get(): SaveState {
    return state;
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  load(save: any, fileName: string, fileHandle: any = null) {
    state = {save, orig: clone(save), fileName, fileHandle, version: state.version + 1};
    for (const l of listeners) l();
  },
  unload() {
    state = {save: null, orig: null, fileName: '', fileHandle: null, version: state.version + 1};
    for (const l of listeners) l();
  },
  update(path: JsonPath, value: any) {
    if (!state.save) return;
    setPath(path, value);
    emit();
  },
  /** 批量改（预设、一键操作）：只触发一次重渲染 */
  mutate(fn: (save: any) => void) {
    if (!state.save) return;
    fn(state.save);
    emit();
  },
  revert() {
    if (!state.orig) return;
    state = {...state, save: clone(state.orig)};
    emit();
  },
  commit() {
    if (!state.save) return;
    state = {...state, orig: clone(state.save)};
    emit();
  },
  setHandle(h: any) {
    state = {...state, fileHandle: h, version: state.version + 1};
    for (const l of listeners) l();
  }
};

export function useStore(): SaveState {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

/* ---------------- 路径 / 差异 ---------------- */
export function getPath(path: JsonPath, root: any = store.get().save): any {
  let o = root;
  for (const seg of path) {
    if (o === null || o === undefined) return undefined;
    o = o[seg as any];
  }
  return o;
}

export function setPath(path: JsonPath, val: any, root: any = store.get().save): void {
  let o = root;
  for (let i = 0; i < path.length - 1; i++) {
    const seg = path[i] as any;
    if (!o[seg]) o[seg] = typeof path[i + 1] === 'number' ? [] : {};
    o = o[seg];
  }
  o[path[path.length - 1] as any] = val;
}

export const getOrig = (path: JsonPath) => getPath(path, store.get().orig);
export const isChanged = (path: JsonPath) => JSON.stringify(getOrig(path)) !== JSON.stringify(getPath(path));

export type Diff = {path: string; from: any; to: any};

export function diffAll(a: any, b: any, prefix: JsonPath = [], out: Diff[] = []): Diff[] {
  if (a === b) return out;
  const ta = a === null ? 'null' : Array.isArray(a) ? 'array' : typeof a;
  const tb = b === null ? 'null' : Array.isArray(b) ? 'array' : typeof b;
  if (ta !== tb || (ta !== 'object' && ta !== 'array')) {
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push({path: prefix.join('.'), from: a, to: b});
    return out;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    const n = Math.max(a ? a.length : 0, b ? b.length : 0);
    for (let i = 0; i < n; i++) diffAll(a ? a[i] : undefined, b ? b[i] : undefined, [...prefix, '[' + i + ']'], out);
    return out;
  }
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const k of keys) diffAll(a ? a[k] : undefined, b ? b[k] : undefined, [...prefix, k], out);
  return out;
}

export const changeCount = () => diffAll(store.get().orig, store.get().save).length;

/* 面板级脏标记：哪个页签里有改动（与旧版 pathInPanel 同一套归属） */
const WORLD_KEYS = ['biome', 'endlessLoops', 'totalTraveled', 'runTime', 'cHeight', 'cAge', 'cId', 'cVer',
  'character', 'isMercRun', 'cheatedSave', 'trapRarity', 'lootRarity', 'caloriesConsumed', 'lastHappiness'];

export function pathInPanel(path: string, panel: string): boolean {
  if (!path) return false;
  if (panel === 'body') return path.startsWith('body.') && !path.startsWith('body.skills');
  if (panel === 'skills') return path.startsWith('body.skills');
  if (panel === 'limbs') return path.startsWith('limbs.') || path.startsWith('limbComponents');
  if (panel === 'items') return path.startsWith('items.') || path.startsWith('itemComponents');
  if (panel === 'world') return WORLD_KEYS.includes(path.split('.')[0]);
  if (panel === 'settings') return path.startsWith('runSettings');
  if (panel === 'recipes') return path.startsWith('savedRecipeData');
  return false;
}

export function panelDirty(panel: string): boolean {
  const {save, orig} = store.get();
  if (!save) return false;
  return diffAll(orig, save).some(d => pathInPanel(d.path, panel));
}
