/* 游戏描述是 Unity TMP 富文本（<color="red">…</color> / <i> / <b>），
   只放行这几种标签，其余一律丢弃 —— 不注入 HTML，只生成 React 节点。 */
import type {ReactNode} from 'react';

const TAG = /<\s*(\/?)\s*(color|b|i|br)\b(?:=("([^"]*)"|'([^']*)'|([^>\s/]+)))?[^>]*>/gi;

export function richNodes(src: unknown): ReactNode[] {
  const text = String(src || '');
  const out: ReactNode[] = [];
  const stack: {tag: string; color?: string}[] = [];
  let i = 0;
  let k = 0;

  const push = (chunk: string) => {
    if (!chunk) return;
    let node: ReactNode = chunk;
    for (const t of stack) {
      if (t.tag === 'color' && t.color) node = <span key={'c' + k++} style={{color: t.color}}>{node}</span>;
      else if (t.tag === 'b') node = <b key={'b' + k++}>{node}</b>;
      else if (t.tag === 'i') node = <i key={'i' + k++}>{node}</i>;
    }
    out.push(<span key={'s' + k++}>{node}</span>);
  };

  let m: RegExpExecArray | null;
  TAG.lastIndex = 0;
  while ((m = TAG.exec(text))) {
    push(text.slice(i, m.index));
    i = TAG.lastIndex;
    const closing = m[1] === '/';
    const tag = (m[2] || '').toLowerCase();
    if (tag === 'br') { out.push(<br key={'br' + k++} />); continue; }
    if (closing) {
      for (let s = stack.length - 1; s >= 0; s--) {
        if (stack[s].tag === tag) { stack.splice(s, 1); break; }
      }
    } else {
      const raw = m[4] ?? m[5] ?? m[6];
      stack.push({tag, color: raw ? raw.replace(/^["']|["']$/g, '') : undefined});
    }
  }
  push(text.slice(i));
  return out;
}
