import { FlashList as ShopifyFlashList, type FlashListProps as ShopifyFlashListProps, type FlashListRef } from '@shopify/flash-list';
import { cssInterop } from 'nativewind';
import type { Ref } from 'react';

cssInterop(ShopifyFlashList, {
  className: 'style',
  contentContainerClassName: 'contentContainerStyle',
  ListHeaderComponentClassName: 'ListHeaderComponentStyle',
  ListFooterComponentClassName: 'ListFooterComponentStyle',
  ListEmptyComponentClassName: 'ListEmptyComponentStyle',
});

const keepsScrollOffset = { disabled: true };

export type { FlashListRef };

export type FlashListProps<Item> = ShopifyFlashListProps<Item> & {
  ref?: Ref<FlashListRef<Item>>;
  ListHeaderComponentClassName?: string;
  ListFooterComponentClassName?: string;
  ListEmptyComponentClassName?: string;
};

export function FlashList<Item>(props: FlashListProps<Item>) {
  return <ShopifyFlashList maintainVisibleContentPosition={keepsScrollOffset} {...props} />;
}
