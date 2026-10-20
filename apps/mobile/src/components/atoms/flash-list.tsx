import { FlashList as ShopifyFlashList, type FlashListProps as ShopifyFlashListProps } from '@shopify/flash-list';
import { cssInterop } from 'nativewind';

cssInterop(ShopifyFlashList, {
  className: 'style',
  contentContainerClassName: 'contentContainerStyle',
  ListHeaderComponentClassName: 'ListHeaderComponentStyle',
  ListFooterComponentClassName: 'ListFooterComponentStyle',
  ListEmptyComponentClassName: 'ListEmptyComponentStyle',
});

const keepsScrollOffset = { disabled: true };

export type FlashListProps<Item> = ShopifyFlashListProps<Item> & {
  ListHeaderComponentClassName?: string;
  ListFooterComponentClassName?: string;
  ListEmptyComponentClassName?: string;
};

export function FlashList<Item>(props: FlashListProps<Item>) {
  return <ShopifyFlashList maintainVisibleContentPosition={keepsScrollOffset} {...props} />;
}
