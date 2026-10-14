import { ManaSymbol } from '@/components/atoms/mana-symbol';
import { Text } from '@/components/atoms/text';
import { cardSymbolParts, spokenCardSymbolText } from '@/lib/card-symbols';

export function SymbolText({ text }: { text: string }) {
  return (
    <Text accessibilityLabel={spokenCardSymbolText(text)}>
      {cardSymbolParts(text).map((part, index) => (part.symbol ? <ManaSymbol key={index} symbol={part.symbol} /> : part.text))}
    </Text>
  );
}
