import { ToggleGroup } from '@/components/molecules/toggle-group';
import { finishViewLabel, finishViews, useFinishView } from '@/sets/finish-view-setting';

export function FinishViewControl() {
  const { finishView, setFinishView } = useFinishView();
  return <ToggleGroup values={finishViews} selected={finishView} labelOf={finishViewLabel} onSelect={setFinishView} />;
}
