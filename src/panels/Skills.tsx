import {Table} from '@astryxdesign/core/Table';
import {HStack} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';
import {NumberInput} from '@astryxdesign/core/NumberInput';
import {StatusDot} from '@astryxdesign/core/StatusDot';
import {Panel, Group} from '../ui/kit';
import {useStore, store, getPath, isChanged} from '../lib/store';
import type {JsonPath} from '../lib/types';

const ATTRS = [
  {code: 'STR', name: '力量', exp: 'expSTR', min: 'minSTR', max: 'maxSTR', mult: 'STRGainMult'},
  {code: 'RES', name: '耐力', exp: 'expRES', min: 'minRES', max: 'maxRES', mult: 'RESGainMult'},
  {code: 'INT', name: '智力', exp: 'expINT', min: 'minINT', max: 'maxINT', mult: 'INTGainMult'}
];

type SkillRow = {
  code: string;
  name: string;
  valuePath: JsonPath;
  expPath: JsonPath;
  minPath: JsonPath;
  maxPath: JsonPath;
  multPath: JsonPath;
};

function NumCell({label, path, int}: {label: string; path: JsonPath; int?: boolean}) {
  const v = getPath(path);
  const val = typeof v === 'number' && !isNaN(v) ? v : null;
  return (
    <NumberInput label={label} isLabelHidden size="sm" width="100%" value={val}
      min={null} max={null} step={int ? 1 : 0.01} isIntegerOnly={int ? true : undefined}
      onChange={n => store.update(path, int ? Math.round(n) : n)} />
  );
}

export default function SkillsPanel() {
  useStore();
  const sk = (store.get().save?.body?.skills) || {};
  const rows: SkillRow[] = ATTRS.filter(a => a.code in sk).map(a => ({
    code: a.code,
    name: a.name,
    valuePath: ['body', 'skills', a.code],
    expPath: ['body', 'skills', a.exp],
    minPath: ['body', 'skills', a.min],
    maxPath: ['body', 'skills', a.max],
    multPath: ['body', 'skills', a.mult]
  }));

  const rowChanged = (r: SkillRow) =>
    [r.valuePath, r.expPath, r.minPath, r.maxPath, r.multPath].some(p => isChanged(p));

  const columns = [
    {
      key: 'code',
      header: '属性',
      renderCell: (r: SkillRow) => (
        <HStack gap={1} vAlign="center">
          {rowChanged(r) ? <StatusDot variant="warning" label="已修改" /> : null}
          <Text type="code">{r.code}</Text>
        </HStack>
      )
    },
    {key: 'name', header: '名称', renderCell: (r: SkillRow) => <Text type="label">{r.name}</Text>},
    {key: 'value', header: '数值', renderCell: (r: SkillRow) => <NumCell label={r.name + ' 数值'} path={r.valuePath} int />},
    {key: 'exp', header: '经验', renderCell: (r: SkillRow) => <NumCell label={r.name + ' 经验'} path={r.expPath} />},
    {key: 'min', header: '下限', renderCell: (r: SkillRow) => <NumCell label={r.name + ' 下限'} path={r.minPath} int />},
    {key: 'max', header: '上限', renderCell: (r: SkillRow) => <NumCell label={r.name + ' 上限'} path={r.maxPath} int />},
    {key: 'mult', header: '倍率', renderCell: (r: SkillRow) => <NumCell label={r.name + ' 倍率'} path={r.multPath} />}
  ];

  return (
    <Panel title="技能" description="这里是你的游戏技能树">
      <Group title="属性与经验" count={ATTRS.length + ' 属性'}>
        <Table data={rows} columns={columns} idKey="code" />
      </Group>
    </Panel>
  );
}
