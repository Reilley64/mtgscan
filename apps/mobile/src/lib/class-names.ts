import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

import { tailwindTheme } from '@/tailwind-theme';

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      color: Object.keys(tailwindTheme.colors),
      text: Object.keys(tailwindTheme.fontSize),
      spacing: Object.keys(tailwindTheme.spacing),
      radius: Object.keys(tailwindTheme.borderRadius),
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
