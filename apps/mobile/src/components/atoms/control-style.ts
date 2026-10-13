import { sizes } from '@/theme';

export function verticalTouchSlop(height: number) {
  const extra = (sizes.touchTarget - height) / 2;
  return { top: extra, bottom: extra };
}
