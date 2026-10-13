import { sizes } from '@/theme';

export function verticalTouchSlop(height: number) {
  const extra = (sizes.touchTarget - height) / 2;
  return { top: extra, bottom: extra };
}

export const choiceStates = {
  selected: { fill: 'group bg-surface-control aria-selected:bg-primary', label: 'text-text group-aria-selected:text-on-primary' },
  checked: { fill: 'group bg-surface-control aria-checked:bg-primary', label: 'text-text group-aria-checked:text-on-primary' },
} as const;
