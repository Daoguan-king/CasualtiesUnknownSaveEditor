import {Banner} from '@astryxdesign/core/Banner';
import {Panel, Group, NumRow, BoolRow, SelectRow} from '../ui/kit';
import {DB} from '../lib/data';

type Num = {key: string; label: string; step: number; int?: boolean; min?: number; units?: string};

const NUMS: Num[] = [
  {key: 'biome', label: '层数 biome', step: 1, int: true, min: 1, units: 'int'},
  {key: 'endlessLoops', label: '无尽循环', step: 1, int: true, units: 'int'},
  {key: 'totalTraveled', label: '已行进距离', step: 1, int: true, units: 'm'},
  {key: 'caloriesConsumed', label: '累计热量', step: 1, int: true, units: 'int'},
  {key: 'cHeight', label: '身高', step: 1, int: true, units: 'cm'},
  {key: 'cAge', label: '年龄', step: 1, int: true, units: 'y'},
  {key: 'cId', label: '编号', step: 1, int: true, units: 'int'},
  {key: 'cVer', label: '外观版本', step: 1, int: true, units: 'int'},
  {key: 'runTime', label: '游玩时长', step: 1, int: true, units: 's'},
  {key: 'trapRarity', label: '陷阱倍率', step: 0.01, units: 'float'},
  {key: 'lootRarity', label: '战利品倍率', step: 0.01, units: 'float'}
];

export default function WorldPanel() {
  const charTypes = DB.meta.charTypes || [];
  return (
    <Panel title="世界与进度" description="这里显示游戏进度和基本信息">
      <Group title="世界状态" count="14 项">
        {NUMS.map(r => (
          <NumRow key={r.key} label={r.label} path={[r.key]} code={r.key}
            min={r.min ?? null} max={null} step={r.step} int={r.int} units={r.units} />
        ))}
        <SelectRow label="角色类型" path={['character']} code="character" numeric
          options={charTypes.map(c => ({value: String(c.value), label: c.value + ' · ' + c.label}))} />
        <BoolRow label="佣兵局" path={['isMercRun']} code="isMercRun" />
        <BoolRow label="作弊标记" path={['cheatedSave']} code="cheatedSave" />
      </Group>
      <Banner status="warning" title="成就警告" container="section"
        description="cheatedSave = true 会让游戏在读档时禁用本次运行的成就。手动改档本身不会被检测。" />
    </Panel>
  );
}
