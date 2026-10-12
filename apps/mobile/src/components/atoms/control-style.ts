import { sizes } from '@/theme';

export function verticalTouchSlop(height: number) {
  const extra = (sizes.touchTarget - height) / 2;
  return { top: extra, bottom: extra };
}

export function choiceClasses(chosen: boolean) {
  return chosen ? { fill: 'bg-primary', label: 'text-on-primary' } : { fill: 'bg-surface-control', label: 'text-text' };
}
