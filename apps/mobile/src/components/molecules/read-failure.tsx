import type { ReactNode } from 'react';

import { EmptyState } from '@/components/molecules/empty-state';

type ReadFailureProps = {
  illustration: ReactNode;
  title: string;
  onTryAgain: () => void;
};

export function ReadFailure({ illustration, title, onTryAgain }: ReadFailureProps) {
  return (
    <EmptyState
      illustration={illustration}
      title={title}
      message="Check your connection."
      action={{ label: 'Try again', onPress: onTryAgain }}
    />
  );
}
