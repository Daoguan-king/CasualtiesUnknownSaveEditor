import {
  Squares2X2Icon, HeartIcon, BoltIcon, AcademicCapIcon, BriefcaseIcon,
  GlobeAltIcon, AdjustmentsHorizontalIcon, BeakerIcon, CodeBracketIcon, ArrowDownTrayIcon
} from '@heroicons/react/24/outline';
import type {ComponentType} from 'react';
import type {PanelId} from './types';

export type NavItem = {id: PanelId; label: string; icon: ComponentType<{className?: string}>};
export type NavSection = {title: string; items: NavItem[]};

export const NAV: NavSection[] = [
  {title: '档案', items: [{id: 'overview', label: '概览', icon: Squares2X2Icon}]},
  {title: '身体', items: [
    {id: 'body', label: '医疗面板', icon: HeartIcon},
    {id: 'limbs', label: '肢体损伤', icon: BoltIcon},
    {id: 'skills', label: '技能', icon: AcademicCapIcon}
  ]},
  {title: '物品', items: [{id: 'items', label: '物品栏', icon: BriefcaseIcon}]},
  {title: '世界', items: [
    {id: 'world', label: '世界与进度', icon: GlobeAltIcon},
    {id: 'settings', label: '运行设置', icon: AdjustmentsHorizontalIcon},
    {id: 'recipes', label: '配方进度', icon: BeakerIcon}
  ]},
  {title: '文件', items: [
    {id: 'json', label: '原始 JSON', icon: CodeBracketIcon},
    {id: 'export', label: '校验与导出', icon: ArrowDownTrayIcon}
  ]}
];

export const PANEL_TITLES: Record<PanelId, string> = {
  overview: '概览', body: '医疗面板', limbs: '肢体损伤', skills: '技能', items: '物品栏',
  world: '世界与进度', settings: '运行设置', recipes: '配方进度', json: '原始 JSON', export: '校验与导出'
};
