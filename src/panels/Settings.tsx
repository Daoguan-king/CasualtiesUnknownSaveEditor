import {Panel, Group, NumRow, BoolRow, SelectRow} from '../ui/kit';
import {useStore} from '../lib/store';
import {DB} from '../lib/data';

const DIVIDER_LABELS: Record<string, string> = {
  runwide: '整局',
  layer: '地层',
  player: '玩家',
  trader: '幸存者',
  other: '其他',
  challenges: '挑战'
};

export default function SettingsPanel() {
  const st = useStore();
  const arr = (st.save && st.save.runSettings) || [];
  const idxByKey: Record<string, number> = {};
  const entryByKey: Record<string, any> = {};
  arr.forEach((x: any, i: number) => {
    idxByKey[x.Item1] = i;
    entryByKey[x.Item1] = x;
  });

  /* divider 标记一个分组的起点；null 表示沿用上一分组 */
  const groups: {key: string; title: string; rows: any[]}[] = [];
  let cur: string | null = null;
  for (const m of DB.settings) {
    if (!entryByKey[m.key]) continue;
    if (m.divider) cur = m.divider;
    const gkey = cur || 'other';
    let g = groups.find(x => x.key === gkey);
    if (!g) {
      g = {key: gkey, title: DIVIDER_LABELS[gkey] || gkey, rows: []};
      groups.push(g);
    }
    g.rows.push(m);
  }

  const known = new Set(DB.settings.map((m: any) => m.key));
  const unknown = arr.filter((x: any) => !known.has(x.Item1));

  const rangeOf = (m: any) => (m.min != null && m.max != null ? m.min + '~' + m.max : '');
  const unitsOf = (m: any) => {
    const parts = [m.postfix, rangeOf(m)].filter(Boolean);
    return parts.length ? parts.join(' ') : undefined;
  };

  let rendered = 0;
  const groupNodes = groups.map(g => {
    rendered += g.rows.length;
    return (
      <Group key={g.key} title={g.title} count={g.rows.length + ' 项'}>
        {g.rows.map((m: any) => {
          const path = ['runSettings', idxByKey[m.key], 'Item2'];
          if (m.type === 'bool') {
            return <BoolRow key={m.key} label={m.label || m.key} path={path} code={m.key} />;
          }
          if (m.type === 'dropdown') {
            return (
              <SelectRow key={m.key} label={m.label || m.key} path={path} code={m.key} numeric
                options={(m.options || []).map((o: any, oi: number) => ({
                  value: String(oi),
                  label: m.optionsLabels && m.optionsLabels[oi] ? m.optionsLabels[oi] + ' (' + o + ')' : o
                }))} />
            );
          }
          return (
            <NumRow key={m.key} label={m.label || m.key} path={path} code={m.key}
              min={m.min ?? null} max={m.max ?? null} step={m.wholeNum ? 1 : 0.01}
              units={unitsOf(m)} />
          );
        })}
      </Group>
    );
  });

  if (unknown.length) {
    rendered += unknown.length;
    groupNodes.push(
      <Group key="unknown" title="未知项" count={unknown.length + ' 项'}>
        {unknown.map((x: any) => {
          const path = ['runSettings', idxByKey[x.Item1], 'Item2'];
          if (typeof x.Item2 === 'boolean') {
            return <BoolRow key={x.Item1} label={x.Item1} path={path} code={x.Item1} />;
          }
          if (typeof x.Item2 === 'string') {
            return (
              <SelectRow key={x.Item1} label={x.Item1} path={path} code={x.Item1}
                options={[{value: x.Item2, label: x.Item2}]} />
            );
          }
          return <NumRow key={x.Item1} label={x.Item1} path={path} code={x.Item1}
            min={null} max={null} step={0.01} />;
        })}
      </Group>
    );
  }

  return (
    <Panel title="运行设置" description="这里是游戏的基本运行设置" count={rendered + ' / ' + arr.length}>
      {groupNodes}
    </Panel>
  );
}
