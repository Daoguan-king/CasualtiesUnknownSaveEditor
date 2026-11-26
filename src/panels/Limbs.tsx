/* 肢体损伤：顶部 15 条健康概览 + 左侧人体热区 + 右侧所选肢体 18 项参数。
   旧实现 src/panels.js:555-624；热区坐标沿用 LIMB_HOT 百分比。 */
import {useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {Table} from '@astryxdesign/core/Table';
import {Grid} from '@astryxdesign/core/Grid';
import {HStack, VStack} from '@astryxdesign/core/Stack';
import {Center} from '@astryxdesign/core/Center';
import {Text} from '@astryxdesign/core/Text';
import {StatusDot} from '@astryxdesign/core/StatusDot';
import {Panel, Group, NumRow, BoolRow, TextRow} from '../ui/kit';
import {useStore, store} from '../lib/store';
import {ART, limbMeta} from '../lib/data';
import type {JsonPath} from '../lib/types';

const LIMB_HOT = [
  {i: 0, x: 50, y: 15, n: '头部'}, {i: 1, x: 50, y: 31, n: '胸部'}, {i: 2, x: 50, y: 45, n: '腹部'},
  {i: 3, x: 33, y: 31, n: '右上臂'}, {i: 4, x: 19, y: 31, n: '右前臂'}, {i: 5, x: 7, y: 31, n: '右手'},
  {i: 6, x: 66, y: 31, n: '左上臂'}, {i: 7, x: 80, y: 31, n: '左前臂'}, {i: 8, x: 93, y: 31, n: '左手'},
  {i: 9, x: 42, y: 60, n: '右大腿'}, {i: 10, x: 42, y: 75, n: '右小腿'}, {i: 11, x: 42, y: 86, n: '右脚'},
  {i: 12, x: 57, y: 60, n: '左大腿'}, {i: 13, x: 57, y: 75, n: '左小腿'}, {i: 14, x: 57, y: 86, n: '左脚'}
];

const LIMB_LABELS: Record<string, string> = {
  skinHealth: '皮肤健康', muscleHealth: '肌肉健康', dislocated: '脱臼', broken: '骨折', splinted: '已固定',
  infected: '已感染', infectionAmount: '感染度', pain: '疼痛', bleedAmount: '出血量',
  dislocationTimer: '脱臼计时', boneHealTimer: '骨骼愈合计时', blockedBleeding: '出血已止住',
  shrapnel: '异物/弹片', furBloodAmount: '毛发血污', disinfectionTime: '消毒计时',
  bandageSlowAmount: '绷带减缓', skinHealAmount: '皮肤愈合量', dismembered: '已截断', prostheticInfo: '假肢信息'
};

/* 分组顺序即显示顺序；prostheticInfo（对象）跳过，与旧实现一致 */
const LIMB_GROUPS: {title: string; keys: string[]}[] = [
  {title: '健康', keys: ['skinHealth', 'muscleHealth']},
  {title: '伤势', keys: ['pain', 'bleedAmount', 'infectionAmount', 'shrapnel', 'furBloodAmount']},
  {title: '状态', keys: ['dislocated', 'broken', 'splinted', 'infected', 'blockedBleeding', 'dismembered']},
  {title: '计时与恢复', keys: ['dislocationTimer', 'boneHealTimer', 'disinfectionTime', 'bandageSlowAmount', 'skinHealAmount']}
];

const hurt = (lm: any) =>
  !!(lm.broken || lm.dislocated || lm.dismembered || lm.infected || (lm.pain || 0) > 20 || (lm.bleedAmount || 0) > 0);

const statusText = (lm: any) => {
  const parts: string[] = [];
  if (lm.broken) parts.push('骨折');
  if (lm.dislocated) parts.push('脱臼');
  if (lm.infected) parts.push('感染');
  if (lm.dismembered) parts.push('截断');
  return parts.length ? parts.join(' ') : '正常';
};

const healOne = (l: any) => {
  l.skinHealth = 100; l.muscleHealth = 100; l.pain = 0; l.bleedAmount = 0; l.infectionAmount = 0;
  l.broken = false; l.splinted = false; l.dislocated = false; l.infected = false;
  l.shrapnel = 0; l.blockedBleeding = false; l.dismembered = false;
};

/* 人体图 + 15 个热区：圆点按钮，悬停提示部位与健康，有伤红点，选中高亮 */
function BodyStage({limbs, sel, onPick}: {limbs: any[]; sel: number; onPick: (i: number) => void}) {
  return (
    <Center width="100%">
      <VStack width="100%" maxWidth={400} style={{position: 'relative', aspectRatio: '1 / 1'}}>
        {ART.user.experimentBody
          ? <img src={ART.user.experimentBody} alt="" draggable={false}
              style={{position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.85, imageRendering: 'pixelated'}} />
          : null}
        {LIMB_HOT.map(p => {
          const lm = limbs[p.i] || {};
          const m = limbMeta(p.i);
          const name = m.label || p.n;
          const bad = hurt(lm);
          const tip = name + '  ·  皮肤 ' + Math.round(lm.skinHealth || 0) + '%  肌肉 ' + Math.round(lm.muscleHealth || 0) + '%';
          return (
            <VStack key={p.i} style={{position: 'absolute', left: p.x + '%', top: p.y + '%', transform: 'translate(-50%, -50%)'}}>
              <Button isIconOnly size="sm" variant={sel === p.i ? 'primary' : 'secondary'}
                label={name} tooltip={tip} onClick={() => onPick(p.i)}
                icon={<StatusDot variant={bad ? 'error' : 'neutral'} label={name} />} />
            </VStack>
          );
        })}
      </VStack>
    </Center>
  );
}

function LimbRow({idx, k, v}: {idx: number; k: string; v: any}) {
  const label = LIMB_LABELS[k] || k;
  const path: JsonPath = ['limbs', idx, k];
  if (typeof v === 'boolean') return <BoolRow label={label} path={path} code={k} />;
  if (typeof v === 'string') return <TextRow label={label} path={path} code={k} />;
  /* 旧实现按当前值判定 int：整数 step 1 并取整，浮点 step 0.01 */
  const int = typeof v === 'number' && Number.isInteger(v);
  return <NumRow label={label} path={path} code={k} int={int} />;
}

export default function LimbsPanel() {
  const st = useStore();
  const [sel, setSel] = useState(0);
  const j = st.save || {};
  const limbs: any[] = j.limbs || [];

  if (!limbs.length) {
    return (
      <Panel title="肢体损伤">
        <Text type="supporting">当前存档没有肢体数据。</Text>
      </Panel>
    );
  }

  const idx = sel < limbs.length ? sel : 0;
  const lm = limbs[idx] || {};
  const meta = limbMeta(idx);
  const name = meta.label || ('肢体 #' + idx);

  const groupRows = LIMB_GROUPS.map(g => ({
    title: g.title,
    rows: g.keys.filter(k => { const v = lm[k]; return v !== null && typeof v !== 'object'; })
  })).filter(g => g.rows.length > 0);
  const known = new Set(LIMB_GROUPS.flatMap(g => g.keys));
  const extra = Object.keys(lm).filter(k => !known.has(k) && lm[k] !== null && typeof lm[k] !== 'object');
  if (extra.length) groupRows.push({title: '其他', rows: extra});
  const total = groupRows.reduce((n, g) => n + g.rows.length, 0);

  const tableRows = limbs.map((l: any, i: number) => ({
    i,
    name: limbMeta(i).label || ('肢体 #' + i),
    skin: Math.round(l.skinHealth || 0),
    muscle: Math.round(l.muscleHealth || 0),
    pain: l.pain || 0,
    bleed: l.bleedAmount || 0,
    status: statusText(l),
    bad: hurt(l)
  }));

  const columns = [
    {
      key: 'name', header: '部位',
      renderCell: (r: any) => (
        <Button label={r.name} variant={sel === r.i ? 'primary' : 'ghost'} size="sm" onClick={() => setSel(r.i)} />
      )
    },
    {key: 'skin', header: '皮肤', renderCell: (r: any) => <Text hasTabularNumbers>{r.skin + '%'}</Text>},
    {key: 'muscle', header: '肌肉', renderCell: (r: any) => <Text hasTabularNumbers>{r.muscle + '%'}</Text>},
    {key: 'pain', header: '疼痛', renderCell: (r: any) => <Text hasTabularNumbers>{r.pain}</Text>},
    {key: 'bleed', header: '出血', renderCell: (r: any) => <Text hasTabularNumbers>{r.bleed}</Text>},
    {
      key: 'status', header: '状态',
      renderCell: (r: any) => (
        <HStack gap={1} vAlign="center">
          <StatusDot variant={r.bad ? 'error' : 'success'} label={r.status} />
          <Text>{r.status}</Text>
        </HStack>
      )
    }
  ];

  return (
    <Panel title="肢体损伤" description="可以点击兽体上的部位查看/修改该肢体。红点=有伤（骨折/脱臼/感染/疼痛/出血）。">
      <Group title="肢体健康概览" count={limbs.length + ' 条'}>
        <Table data={tableRows} columns={columns} idKey={(r: any) => String(r.i)} density="compact" hasHover />
      </Group>

      <Grid columns={{minWidth: 380, max: 2}} gap={3} width="100%">
        <VStack gap={3}>
          <Group title="人体图" count="15 部位">
            <BodyStage limbs={limbs} sel={idx} onPick={setSel} />
          </Group>
        </VStack>

        <VStack gap={3}>
          <Group title={name} count={total + ' 项'}>
            <Text type="code" size="3xs" color="secondary">
              {'limbs[' + idx + ']' + (meta.limb ? '  ·  ' + meta.limb : '') + (meta.isVital ? '  ·  要害' : '')}
            </Text>
            <HStack gap={1} vAlign="center">
              <StatusDot variant={hurt(lm) ? 'error' : 'success'} label={statusText(lm)} />
              <Text type="supporting">{statusText(lm)}</Text>
            </HStack>
          </Group>

          {groupRows.map(g => (
            <Group key={g.title} title={g.title} count={g.rows.length + ' 项'}>
              {g.rows.map(k => <LimbRow key={k} idx={idx} k={k} v={lm[k]} />)}
            </Group>
          ))}

          <Group title="快捷操作">
            <HStack gap={2} wrap="wrap">
              <Button label="这个部位治好" onClick={() => store.mutate(s => healOne(s.limbs[idx]))} />
              <Button label="全部治好" onClick={() => store.mutate(s => (s.limbs || []).forEach(healOne))} />
            </HStack>
          </Group>
        </VStack>
      </Grid>
    </Panel>
  );
}
