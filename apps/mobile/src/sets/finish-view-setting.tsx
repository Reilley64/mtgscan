import type { FinishView } from '@mtgscan/supabase/sets';
import * as SecureStore from 'expo-secure-store';
import { createContext, use, useMemo, useState, type ReactNode } from 'react';

const finishViewKey = 'finish-view';

export const finishViews: FinishView[] = ['any', 'nonfoil', 'foil'];

const finishViewLabels: Record<FinishView, string> = { any: 'Any finish', nonfoil: 'Nonfoil', foil: 'Foil' };

export function finishViewLabel(finishView: FinishView) {
  return finishViewLabels[finishView];
}

type FinishViewSetting = {
  finishView: FinishView;
  setFinishView: (finishView: FinishView) => void;
};

const FinishViewContext = createContext<FinishViewSetting | null>(null);

function storedFinishView() {
  const stored = SecureStore.getItem(finishViewKey);
  return finishViews.find((finishView) => finishView === stored) ?? 'any';
}

export function FinishViewProvider({ children }: { children: ReactNode }) {
  const [finishView, setStoredFinishView] = useState(storedFinishView);

  const setting = useMemo<FinishViewSetting>(
    () => ({
      finishView,
      setFinishView: (chosen) => {
        setStoredFinishView(chosen);
        void SecureStore.setItemAsync(finishViewKey, chosen);
      },
    }),
    [finishView],
  );

  return <FinishViewContext value={setting}>{children}</FinishViewContext>;
}

export function useFinishView(): FinishViewSetting {
  const setting = use(FinishViewContext);
  if (!setting) {
    throw new Error('useFinishView needs a FinishViewProvider');
  }
  return setting;
}
