import { Button } from '@/components/atoms/button';
import { Text } from '@/components/atoms/text';
import { SheetSection } from '@/components/molecules/sheet-section';
import type { ParityCheck } from '@/gallery/parity-check';

function cosine(value: number) {
  return value.toFixed(5);
}

function Result({ check }: { check: ParityCheck }) {
  if (check.status === 'failed') {
    return <Text variant="meta">Could not run the parity check: {check.code}</Text>;
  }
  if (check.status !== 'checked') {
    return null;
  }
  const { parity } = check;
  return (
    <>
      {parity.version ? <Text variant="meta">Gallery version {parity.version}</Text> : null}
      <Text variant="meta">Lowest cosine {cosine(parity.lowestCosine)}</Text>
      <Text variant="meta">Mean cosine {cosine(parity.meanCosine)}</Text>
      <Text variant="meta">{parity.references} reference images</Text>
      {parity.failures.map((failure) => (
        <Text key={failure} variant="meta">
          {failure}
        </Text>
      ))}
    </>
  );
}

export function ParityCheckSection({ check, onRun }: { check: ParityCheck; onRun: () => void }) {
  return (
    <SheetSection title="Parity check">
      <Result check={check} />
      <Button busy={check.status === 'checking'} onPress={onRun}>
        <Text>Run the parity check</Text>
      </Button>
    </SheetSection>
  );
}
