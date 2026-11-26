import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Grid} from '@astryxdesign/core/Grid';
import {HStack, VStack} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';
import {useToast} from '@astryxdesign/core/Toast';
import {Panel, Group, Stat} from '../ui/kit';
import {useStore, store, changeCount} from '../lib/store';
import {charTypeName} from '../lib/data';
import {fmtTime} from '../lib/format';

type Preset = {label: string; hint: string; apply: (save: any) => void};

const LIMB_HEAL = ['skinHealth', 'muscleHealth'];

const PRESETS: Preset[] = [
  {
    label: '伤势全愈',
    hint: '15 条肢体的健康/疼痛/出血/骨折/感染全部复原',
    apply: save => {
      for (const l of save.limbs || []) {
        for (const k of LIMB_HEAL) l[k] = 100;
        l.pain = 0; l.bleedAmount = 0; l.infectionAmount = 0;
        l.broken = false; l.splinted = false; l.dislocated = false; l.infected = false;
        l.shrapnel = 0; l.blockedBleeding = false; l.dismembered = false;
        l.dislocationTimer = 0; l.boneHealTimer = 0;
      }
    }
  },
  {
    label: '状态拉满',
    hint: '饥饿/口渴/体力/精力/血氧/意识等 9 项拉满，体温回到 37℃',
    apply: save => {
      const b = save.body || {};
      for (const k of ['hunger', 'thirst', 'stamina', 'energy', 'bloodOxygen', 'bloodVolume', 'consciousness', 'brainHealth', 'immunity'])
        if (k in b) b[k] = 100;
      if ('temperature' in b) b.temperature = 37;
      if ('shock' in b) b.shock = 0;
      if ('painShock' in b) b.painShock = 0;
    }
  },
  {
    label: '疾病清零',
    hint: '疾病/辐射病/脓毒/内出血/血胸等 15 项归零',
    apply: save => {
      const b = save.body || {};
      for (const k of ['sicknessAmount', 'radiationSickness', 'septicShock', 'internalBleeding', 'hemothorax',
        'strokeAmount', 'brainGrowSickness', 'venomTotal', 'venomCurrent', 'venomFake', 'fibrillationProgress',
        'hearingLoss', 'traumaAmount', 'wetness', 'dirtyness'])
        if (k in b) b[k] = 0;
    }
  },
  {
    label: '耐久全满',
    hint: '所有物品 condition = 1（液体容器的 condition 是装填率）',
    apply: save => { for (const it of save.items || []) it.condition = 1; }
  },
  {
    label: '解锁配方',
    hint: '把 savedRecipeData.saved 里每条都标成已制作',
    apply: save => { for (const x of save.savedRecipeData?.saved || []) x.Item1 = true; }
  },
  {
    label: '技能 +5',
    hint: 'STR / RES / INT 各加 5',
    apply: save => {
      const sk = save.body?.skills || {};
      for (const k of ['STR', 'RES', 'INT']) if (k in sk) sk[k] = (sk[k] || 0) + 5;
    }
  }
];

export default function OverviewPanel() {
  const st = useStore();
  const showToast = useToast();
  const j = st.save || {};
  const items = j.items || [];
  const saved = j.savedRecipeData?.saved || [];
  const n = changeCount();

  const run = (p: Preset) => {
    store.mutate(s => p.apply(s));
    showToast({body: '已应用：' + p.label});
  };

  const entries: {label: string; value: string; hint?: string}[] = [
    {label: '角色', value: charTypeName(j.character)},
    {label: '身高 / 年龄', value: (j.cHeight ?? '—') + ' cm / ' + (j.cAge ?? '—') + ' y'},
    {label: '当前层数', value: String(j.biome ?? '—')},
    {label: '行进距离', value: String(j.totalTraveled || 0), hint: 'm'},
    {label: '游玩时长', value: fmtTime(j.runTime || 0)},
    {label: '摄食热量', value: String(j.caloriesConsumed ?? '—'), hint: 'Cal'},
    {label: '携带物品', value: String(items.length), hint: '件'},
    {label: '已解锁配方', value: saved.filter((x: any) => x.Item1).length + ' / ' + saved.length},
    {label: '作弊标记', value: j.cheatedSave ? '已标记' : '无作弊'},
    {label: '佣兵局', value: j.isMercRun ? '是' : '否'}
  ];

  return (
    <Panel title="概览" description="当前存档的概要。所有改动只记在内存里，点「保存」才写回文件。">
      <Grid columns={{minWidth: 190, max: 5}} gap={3}>
        {entries.map(e => (
          <Card key={e.label} variant="muted" padding={3}>
            <Stat label={e.label} value={e.value} hint={e.hint} />
          </Card>
        ))}
      </Grid>

      <Group title="一键预设" count={PRESETS.length + ' 项'}>
        <HStack gap={2} wrap="wrap">
          {PRESETS.map(p => (
            <Button key={p.label} label={p.label} onClick={() => run(p)} />
          ))}
          <Button label="撤销全部" variant="ghost" onClick={() => { store.revert(); showToast({body: '已恢复到载入时的状态'}); }} />
        </HStack>
        <VStack gap={1}>
          {PRESETS.map(p => (
            <Text key={p.label} type="supporting" size="sm">{p.label}：{p.hint}</Text>
          ))}
          <Text type="supporting" size="sm">{n ? '当前有 ' + n + ' 处改动未保存' : '当前与原文件一致'}</Text>
        </VStack>
      </Group>
    </Panel>
  );
}
