import { Button } from '@/components/atoms/button';
import { Text } from '@/components/atoms/text';
import { SheetSection } from '@/components/molecules/sheet-section';
import type { GalleryParityCheck as Check } from '@/gallery/gallery-parity';

type GalleryParityCheckProps = {
  check: Check;
  onCheck: () => void;
};

function cosine(value: number) {
  return value.toFixed(5);
}

function Result({ check }: { check: Check }) {
  if (check.status === 'failed') {
    return <Text variant="meta">Could not check gallery parity: {check.code}</Text>;
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

export function GalleryParityCheck({ check, onCheck }: GalleryParityCheckProps) {
  return (
    <SheetSection title="Gallery parity">
      <Result check={check} />
      <Button busy={check.status === 'checking'} onPress={onCheck}>
        <Text>Check gallery parity</Text>
      </Button>
    </SheetSection>
  );
}
