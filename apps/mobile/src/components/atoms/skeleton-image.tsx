import { Image, type ImageContentFit } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { placeholderFills, useOnGlass } from '@/components/atoms/glass-surface';
import { Skeleton } from '@/components/atoms/skeleton';
import { cn } from '@/lib/class-names';

export function useImageLoading(uri: string | null | undefined) {
  const [settledUri, setSettledUri] = useState<string>();
  return {
    loading: Boolean(uri) && settledUri !== uri,
    onLoadEnd: () => setSettledUri(uri ?? undefined),
  };
}

export const imageSkeletonClass = 'absolute inset-0 rounded-none';

type SkeletonImageProps = {
  uri: string | null | undefined;
  contentFit?: ImageContentFit;
  recyclingKey?: string;
};

export function SkeletonImage({ uri, contentFit, recyclingKey }: SkeletonImageProps) {
  const onGlass = useOnGlass();
  const { loading, onLoadEnd } = useImageLoading(uri);
  return (
    <>
      {loading ? (
        <Skeleton className={imageSkeletonClass} />
      ) : (
        <View className={cn('absolute inset-0', placeholderFills({ onGlass }))} />
      )}
      <Image
        source={uri}
        contentFit={contentFit}
        recyclingKey={recyclingKey}
        cachePolicy="disk"
        transition={200}
        onLoadEnd={onLoadEnd}
        style={StyleSheet.absoluteFill}
      />
    </>
  );
}
