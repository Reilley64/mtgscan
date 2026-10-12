import { cn } from '@/lib/class-names';

test('a token text color and a token type style both stay', () => {
  expect(cn('text-text', 'text-body-strong')).toBe('text-text text-body-strong');
});

test('the later token color wins over an earlier one', () => {
  expect(cn('bg-surface-control text-text', 'bg-primary text-on-primary')).toBe('bg-primary text-on-primary');
});

test('the later token type style wins over an earlier one', () => {
  expect(cn('text-body text-text-muted', 'text-body-strong')).toBe('text-text-muted text-body-strong');
});

test('the later token spacing and corner radius win over earlier ones', () => {
  expect(cn('gap-xs px-md rounded-sm', 'gap-sm px-lg rounded-md')).toBe('gap-sm px-lg rounded-md');
});

test('a token border width and a token border color both stay', () => {
  expect(cn('border-selected-outline', 'border-primary')).toBe('border-selected-outline border-primary');
});
