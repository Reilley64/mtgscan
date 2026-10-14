import { Host, Menu, RNHostView, Section, Toggle } from '@expo/ui/swift-ui';
import { accessibilityLabel as spokenAs } from '@expo/ui/swift-ui/modifiers';
import { cva } from 'class-variance-authority';
import type { SFSymbol } from 'expo-symbols';

import { GlassSurface } from '@/components/atoms/glass-surface';
import { SymbolView } from '@/components/atoms/symbol-view';
import { sizes } from '@/theme';

const symbolTints = cva('', {
  variants: {
    active: {
      true: 'text-primary',
      false: 'text-text',
    },
  },
});

type MenuChoice = {
  title: string;
  checked: boolean;
  symbol?: SFSymbol;
  onSelect: () => void;
};

type FloatingMenuButtonProps = {
  symbol: SFSymbol;
  active: boolean;
  accessibilityLabel: string;
  menuTitle: string;
  choices: MenuChoice[];
};

export function FloatingMenuButton({ symbol, active, accessibilityLabel, menuTitle, choices }: FloatingMenuButtonProps) {
  return (
    <Host matchContents>
      <Menu
        modifiers={[spokenAs(accessibilityLabel)]}
        label={
          <RNHostView matchContents>
            <GlassSurface fallback="surface-control" className="size-floating-button items-center justify-center rounded-full" interactive>
              <SymbolView name={symbol} size={sizes.iconButtonSymbol} className={symbolTints({ active })} />
            </GlassSurface>
          </RNHostView>
        }>
        <Section title={menuTitle}>
          {choices.map(({ title, checked, symbol: choiceSymbol, onSelect }) => (
            <Toggle key={title} label={title} isOn={checked} systemImage={choiceSymbol} onIsOnChange={onSelect} />
          ))}
        </Section>
      </Menu>
    </Host>
  );
}
