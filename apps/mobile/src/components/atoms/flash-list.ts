import { FlashList } from '@shopify/flash-list';
import { cssInterop } from 'nativewind';

cssInterop(FlashList, { className: 'style', contentContainerClassName: 'contentContainerStyle' });

export { FlashList };
export type { FlashListProps } from '@shopify/flash-list';
