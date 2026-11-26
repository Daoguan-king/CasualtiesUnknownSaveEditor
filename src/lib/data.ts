/* 元数据表与访问器：反编译源码 + 官方中文包提取，构建期注入 src/generated */
import RAW from '../generated/data.json';
import ARTRAW from '../generated/art.json';

const D: any = RAW as any;
const A: any = ARTRAW as any;

export const LIQCAP: Record<string, {capacity: number; autoFill: boolean; hasDefaultContents: boolean}> = D.liquidcapacity?.items || {};
export const LIQUIDS: any[] = D.liquids?.liquids || [];
export const VESSELS: any = D.vessels || {};

export const DB = {
  items: D.items?.items || [],
  itemById: {} as Record<string, any>,
  recipes: D.recipes?.recipes || [],
  settings: D.runsettings?.settings || [],
  fields: D.bodyfields?.fields || [],
  fieldByName: {} as Record<string, any>,
  limbs: D.limbs?.limbs || [],
  meta: D.meta || {},
  containers: D.containers?.ok ? D.containers : null,
  liquids: LIQUIDS,
  liquidById: {} as Record<string, any>,
  liquidcapacity: LIQCAP,
  vessels: VESSELS,
  slots: D.slots?.slots || []
};
for (const it of DB.items) DB.itemById[it.id] = it;
for (const l of DB.liquids) DB.liquidById[l.id] = l;
for (const f of DB.fields) DB.fieldByName[f.name] = f;

export const ART: {ui: Record<string, string>; user: Record<string, string>; items: Record<string, string>; iconSize: Record<string, [number, number]>; missingIcons: string[]} = A;
export const HAND_SLOTS: number = DB.meta.handSlots?.length || 6;
export const WATERCOMP = 'WaterContainerItem, Assembly-CSharp, Version=0.0.0.0, Culture=neutral, PublicKeyToken=null';

/* 游戏 Item.ColorSwatches（Item.cs:32-41），索引 0~7 */
export const SWATCHES = [
  {i: 0, name: '白（默认）', hex: '#ffffff'},
  {i: 1, name: '灰', hex: '#808080'},
  {i: 2, name: '绿', hex: '#47ff47'},
  {i: 3, name: '橙', hex: '#f5ab2b'},
  {i: 4, name: '品红', hex: '#e655ff'},
  {i: 5, name: '蓝紫', hex: '#6655ff'},
  {i: 6, name: '青', hex: '#33ffff'},
  {i: 7, name: '黄', hex: '#fffc66'}
];

export const itemName = (id: string) => DB.itemById[id]?.name || id;
export const itemEn = (id: string) => DB.itemById[id]?.nameEn || '';
export const itemIcon = (id: string): string | null => ART.items[id] || null;
export const itemDesc = (id: string) => stripTags(DB.itemById[id]?.desc);
export const itemDescRaw = (id: string) => String(DB.itemById[id]?.desc || '');
export const liquidName = (id: string) => DB.liquidById[id]?.name || id;
export const liquidColor = (id: string) => DB.liquidById[id]?.color || '#666666';
export const itemCapacity = (id: string): number | null => LIQCAP[id]?.capacity ?? null;
export const isLiquidVessel = (id: string) => !!LIQCAP[id] || DB.itemById[id]?.class === 'LiquidItemInfo';
export const wearSlotName = (id: string) => DB.meta.wearSlots?.find((x: any) => x.id === id)?.label || id;
export const charTypeName = (v: any) => DB.meta.charTypes?.find((x: any) => String(x.value) === String(v))?.label || '类型 ' + v;
export const fieldMeta = (name: string) => DB.fieldByName[name] || null;
export const slotLabel = (i: number) => DB.meta.handSlots?.find((x: any) => x.index === i)?.label || '槽位 ' + i;
export const slotLimb = (i: number) => DB.meta.handSlots?.find((x: any) => x.index === i)?.limb || null;
export const slotHint = (i: number) => DB.meta.handSlots?.find((x: any) => x.index === i)?.hint || '';
export const limbMeta = (i: number) => DB.limbs[i] || {};
export const isContainerItem = (id: string): boolean | null =>
  DB.containers?.containerIds ? DB.containers.containerIds.includes(id) : null;

export function stripTags(s: unknown): string {
  return String(s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}
