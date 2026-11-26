export type PathSeg = string | number;
export type JsonPath = PathSeg[];

export type Sel =
  | {kind: 'slot'; slot: number}
  | {kind: 'wear'; wear: string}
  | {kind: 'child'; host: number; child: number}
  | null;

export type SaveState = {
  save: any | null;
  orig: any | null;
  fileName: string;
  fileHandle: any | null;
  version: number;
};

export type PanelId =
  | 'overview' | 'body' | 'limbs' | 'skills' | 'items'
  | 'world' | 'settings' | 'recipes' | 'json' | 'export';
