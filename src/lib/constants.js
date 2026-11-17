import { Wrench, Gamepad2, Play, DollarSign, Zap, Code, Package, CheckSquare } from 'lucide-react';

export const BANNERS = ['/banner-usdt.png', '/banner-discover.png', '/banner-gaming.png', '/banner-developer.png'];

export const categoryIconMap = {
  Tools: Wrench, Games: Gamepad2, Entertainment: Play, Finance: DollarSign,
  Productivity: Zap, Developer: Code, Business: Package, Education: CheckSquare,
};

export const cardThemes = [
  { grad: 'from-violet-400 to-purple-600', icon: 'text-violet-600', btn: 'bg-violet-700 hover:bg-violet-800' },
  { grad: 'from-blue-400 to-indigo-600', icon: 'text-indigo-600', btn: 'bg-indigo-700 hover:bg-indigo-800' },
  { grad: 'from-orange-400 to-red-500', icon: 'text-orange-600', btn: 'bg-orange-600 hover:bg-orange-700' },
  { grad: 'from-emerald-400 to-teal-600', icon: 'text-emerald-600', btn: 'bg-emerald-700 hover:bg-emerald-800' },
  { grad: 'from-pink-400 to-fuchsia-600', icon: 'text-fuchsia-600', btn: 'bg-fuchsia-700 hover:bg-fuchsia-800' },
];

export const smallIconThemes = [
  'bg-gradient-to-br from-violet-400 to-purple-600',
  'bg-gradient-to-br from-orange-400 to-amber-500',
  'bg-gradient-to-br from-emerald-400 to-teal-600',
  'bg-gradient-to-br from-pink-400 to-fuchsia-600',
  'bg-gradient-to-br from-blue-400 to-indigo-600',
];

export const pastelCategories = [
  { name: 'Tools', icon: Wrench, bg: 'bg-violet-100', color: 'text-violet-600' },
  { name: 'Games', icon: Gamepad2, bg: 'bg-blue-100', color: 'text-blue-600' },
  { name: 'Entertainment', icon: Play, bg: 'bg-rose-100', color: 'text-rose-500' },
  { name: 'Finance', icon: DollarSign, bg: 'bg-orange-100', color: 'text-orange-500' },
  { name: 'Productivity', icon: Zap, bg: 'bg-emerald-100', color: 'text-emerald-600' },
  { name: 'Developer', icon: Code, bg: 'bg-indigo-100', color: 'text-indigo-600' },
];
