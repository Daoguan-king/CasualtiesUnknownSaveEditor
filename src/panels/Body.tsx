import {Card} from '@astryxdesign/core/Card';
import {Grid} from '@astryxdesign/core/Grid';
import {Panel, Group, Stat, RangeRow, NumRow, BoolRow} from '../ui/kit';
import {useStore} from '../lib/store';
import {charTypeName, fieldMeta} from '../lib/data';

export default function BodyPanel() {
  const st = useStore();
  const j = st.save || {};
  const b = j.body || {};

  const cards = [
    {label: '角色类型', value: charTypeName(j.character)},
    {label: '身高', value: (j.cHeight ?? '—') + ' cm'},
    {label: '年龄', value: (j.cAge ?? '—') + ' y'},
    {label: '编号', value: '#' + (j.cId ?? '—')}
  ];

  const groups: {name: string; keys: string[]}[] = [];
  const byName = new Map<string, string[]>();
  for (const k of Object.keys(b)) {
    if (k === 'skills') continue;
    const m = fieldMeta(k) || {};
    const g = m.group || '其他';
    if (!byName.has(g)) {
      const keys: string[] = [];
      byName.set(g, keys);
      groups.push({name: g, keys});
    }
    byName.get(g)!.push(k);
  }

  return (
    <Panel title="医疗面板" description="这里有在游戏医疗面板中中看不见的数值">
      <Grid columns={{minWidth: 190, max: 4}} gap={3}>
        {cards.map(c => (
          <Card key={c.label} variant="muted" padding={3}>
            <Stat label={c.label} value={c.value} />
          </Card>
        ))}
      </Grid>

      {groups.map(g => (
        <Group key={g.name} title={g.name} count={g.keys.length + ' 项'}>
          {g.keys.map(k => {
            const m = fieldMeta(k) || {};
            const v = b[k];
            const path = ['body', k];
            if (typeof v === 'boolean' || m.csharpType === 'bool') {
              return <BoolRow key={k} label={m.label || k} path={path} code={k} />;
            }
            if (m.min != null && m.max != null) {
              return <RangeRow key={k} label={m.label || k} path={path} min={m.min} max={m.max} code={k} />;
            }
            return <NumRow key={k} label={m.label || k} path={path} int={m.csharpType === 'int'}
              min={m.min ?? null} max={m.max ?? null} step={m.csharpType === 'int' ? 1 : 0.01} code={k} />;
          })}
        </Group>
      ))}
    </Panel>
  );
}
