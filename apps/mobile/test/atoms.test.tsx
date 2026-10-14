import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { useState } from 'react';
import { processColor, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppleSignInButton } from '@/components/atoms/apple-sign-in-button';
import { Button } from '@/components/atoms/button';
import { CardImage } from '@/components/atoms/card-image';
import { GoogleSignInButton } from '@/components/atoms/google-sign-in-button';
import { Chip } from '@/components/atoms/chip';
import { CardThumbnail } from '@/components/atoms/card-thumbnail';
import { CountBadge } from '@/components/atoms/count-badge';
import { DimSymbol } from '@/components/atoms/dim-symbol';
import { FloatingMenuButton } from '@/components/atoms/floating-menu-button';
import { GlassGroup, GlassSurface } from '@/components/atoms/glass-surface';
import { Input } from '@/components/atoms/input';
import { ProgressBar } from '@/components/atoms/progress-bar';
import { QuickActionButton } from '@/components/atoms/quick-action-button';
import { SetIcon } from '@/components/atoms/set-icon';
import { Skeleton } from '@/components/atoms/skeleton';
import { Surface } from '@/components/atoms/surface';
import { Switch } from '@/components/atoms/switch';
import { Text } from '@/components/atoms/text';
import { TextLink } from '@/components/atoms/text-link';
import { Toggle } from '@/components/atoms/toggle';

import { liquidGlassIsAvailable } from './fake-glass-effect';
import {
  appleSignInButton,
  backdropOf,
  blocksColored,
  buttonMenu,
  cardImageUri,
  cardSheen,
  glassEffect,
  glassGroupOf,
  imageTintColor,
  menuButton,
  placeholderColor,
  pressButtonMenuItem,
  pressSignInWithApple,
  showsSpinner,
  switchTrackColor,
  symbolIn,
  symbolNames,
  symbolSizes,
  symbolTintColor,
  touchTarget,
} from './native-ui';
import { tokenColors } from './token-colors';

const {
  primary: lime,
  onPrimary,
  surface,
  surfaceControl,
  surfaceRaised,
  line,
  text: white,
  textMuted,
  textDim,
  glassTextMuted,
  glassTextDim,
  glassSkeleton,
  warning,
  danger,
  info,
  badge,
} = tokenColors;
const dangerTint = '#ff7a7029';
const dimmed = { opacity: expect.closeTo(0.38) };

describe('Button', () => {
  test.each([
    ['primary', lime, onPrimary],
    ['secondary', surfaceControl, white],
    ['danger', dangerTint, danger],
  ] as const)('a %s button has its DESIGN.md fill and label color', async (variant, fill, label) => {
    await render(
      <Button variant={variant} onPress={() => {}}>
        <Text>Add to collection</Text>
      </Button>,
    );

    expect(screen.getByRole('button', { name: 'Add to collection' })).toHaveStyle({
      backgroundColor: fill,
      height: 38,
      borderRadius: 8,
    });
    expect(screen.getByText('Add to collection')).toHaveStyle({ color: label, fontSize: 14, fontWeight: '700' });
  });

  test('a button runs its action when pressed', async () => {
    const onPress = jest.fn();
    await render(
      <Button onPress={onPress}>
        <Text>Try again</Text>
      </Button>,
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('a disabled button is dimmed, reads as disabled, and does nothing when pressed', async () => {
    const onPress = jest.fn();
    await render(
      <Button disabled onPress={onPress}>
        <Text>Add to collection</Text>
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Add to collection' });
    await fireEvent.press(button);

    expect(button).toBeDisabled();
    expect(button).toHaveStyle(dimmed);
    expect(onPress).not.toHaveBeenCalled();
  });

  test('a busy button shows a spinner, reads as busy, and does nothing when pressed', async () => {
    const onPress = jest.fn();
    await render(
      <Button variant="primary" busy onPress={onPress}>
        <Text>Add to collection</Text>
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Add to collection' });
    await fireEvent.press(button);

    expect(button).toBeBusy();
    expect(button).toBeDisabled();
    expect(showsSpinner(button)).toBe(true);
    expect(button).not.toHaveStyle(dimmed);
    expect(onPress).not.toHaveBeenCalled();
  });

  test('a busy button keeps its full color, even when it is also disabled', async () => {
    await render(
      <Button variant="primary" busy disabled onPress={() => {}}>
        <Text>Add to collection</Text>
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Add to collection' });
    expect(button).toBeBusy();
    expect(button).toHaveStyle({ backgroundColor: lime });
    expect(button).not.toHaveStyle(dimmed);
  });

  test('a button that is not busy shows no spinner', async () => {
    await render(
      <Button onPress={() => {}}>
        <Text>Sign out</Text>
      </Button>,
    );

    expect(showsSpinner(screen.getByRole('button', { name: 'Sign out' }))).toBe(false);
  });

  test('a button has a 44 pt touch target', async () => {
    await render(
      <Button onPress={() => {}}>
        <Text>+1</Text>
      </Button>,
    );

    expect(touchTarget(screen.getByRole('button', { name: '+1' }))).toEqual({ width: 44, height: 44 });
  });

  test('a round icon button is 38 px with a 44 pt touch target and the label it is given', async () => {
    await render(<Button size="icon" accessibilityLabel="Settings" onPress={() => {}} />);

    const button = screen.getByRole('button', { name: 'Settings' });
    expect(button).toHaveStyle({ width: 38, height: 38, borderRadius: 999 });
    expect(touchTarget(button)).toEqual({ width: 44, height: 44 });
  });

});

describe('Sign-in button', () => {
  test.each([
    ['primary', lime, onPrimary],
    ['secondary', surfaceControl, white],
  ] as const)('a %s sign-in button is 50 px tall with the sign-in button type', async (variant, fill, label) => {
    await render(
      <Button variant={variant} size="sign-in" onPress={() => {}}>
        <Text>Try again</Text>
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Try again' });
    expect(button).toHaveStyle({ backgroundColor: fill, height: 50, borderRadius: 8 });
    expect(touchTarget(button).height).toBe(50);
    expect(screen.getByText('Try again')).toHaveStyle({ color: label, fontSize: 17, fontWeight: '600' });
  });

  test('Continue with Google has the Google dark fill, border, and label', async () => {
    await render(
      <Button variant="google" size="sign-in" onPress={() => {}}>
        <Text>Continue with Google</Text>
      </Button>,
    );

    expect(screen.getByRole('button', { name: 'Continue with Google' })).toHaveStyle({
      backgroundColor: 'rgba(19, 19, 20, 1)',
      borderColor: 'rgba(142, 145, 143, 1)',
      borderWidth: 1,
      height: 50,
    });
    expect(screen.getByText('Continue with Google')).toHaveStyle({
      color: 'rgba(227, 227, 227, 1)',
      fontSize: 16,
      fontWeight: '500',
    });
  });
});

describe('Text', () => {
  test.each([
    ['large-title', { fontSize: 28, fontWeight: '800', lineHeight: 31, color: white }],
    ['card-title', { fontSize: 20, fontWeight: '800', lineHeight: 23, color: white }],
    ['sign-in-title', { fontSize: 24, fontWeight: '800', lineHeight: 28, color: white }],
    ['brand', { fontSize: 22, fontWeight: '800', color: white }],
    ['sheet-title', { fontSize: 17, fontWeight: '800', color: white }],
    ['body', { fontSize: 14, lineHeight: 19, color: white }],
    ['body-strong', { fontSize: 14, fontWeight: '700', color: white }],
    ['meta', { fontSize: 12, color: textMuted }],
    ['chip', { fontSize: 11, fontWeight: '700', color: white }],
    ['credit', { fontSize: 10, fontWeight: '600', color: textDim }],
  ] as const)('%s text has its DESIGN.md type style and color', async (variant, style) => {
    await render(<Text variant={variant}>Lightning Bolt</Text>);

    expect(screen.getByText('Lightning Bolt')).toHaveStyle(style);
  });

  test('text is body text when no style is given', async () => {
    await render(<Text>Scan your cards.</Text>);

    expect(screen.getByText('Scan your cards.')).toHaveStyle({ fontSize: 14, lineHeight: 19, color: white });
  });

  test.each(['large-title', 'card-title', 'sign-in-title', 'sheet-title'] as const)('%s text is a heading', async (variant) => {
    await render(<Text variant={variant}>Settings</Text>);

    expect(screen.getByRole('header', { name: 'Settings' })).toBeOnTheScreen();
  });

  test.each(['body', 'body-strong', 'meta', 'chip', 'credit', 'brand'] as const)('%s text is not a heading', async (variant) => {
    await render(<Text variant={variant}>Settings</Text>);

    expect(screen.queryByRole('header')).not.toBeOnTheScreen();
  });
});

describe('Chip', () => {
  test.each([
    ['neutral', white],
    ['warning', warning],
    ['danger', danger],
    ['info', info],
  ] as const)('a status chip in the %s tone has the control surface and its text color', async (tone, color) => {
    await render(<Chip tone={tone} label="Protected only" />);

    expect(screen.getByText('Protected only')).toHaveStyle({ color, fontSize: 11, fontWeight: '700' });
    expect(screen.getByLabelText('Protected only')).toHaveStyle({
      backgroundColor: surfaceControl,
      height: 24,
      borderRadius: 12,
    });
  });

  test('a status chip is not a button', async () => {
    await render(<Chip label="Valid" />);

    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
  });

  test('a selectable chip reads as selected and turns lime when selected', async () => {
    await render(<Chip label="Foil" selected onPress={() => {}} />);

    const chip = screen.getByRole('button', { name: 'Foil', selected: true });
    expect(chip).toHaveStyle({ backgroundColor: lime });
    expect(screen.getByText('Foil')).toHaveStyle({ color: onPrimary });
  });

  test('a selectable chip that is not selected keeps the control surface and runs its action when pressed', async () => {
    const onPress = jest.fn();
    await render(<Chip label="Foil" selected={false} onPress={onPress} />);

    const chip = screen.getByRole('button', { name: 'Foil', selected: false });
    await fireEvent.press(chip);

    expect(chip).toHaveStyle({ backgroundColor: surfaceControl });
    expect(screen.getByText('Foil')).toHaveStyle({ color: white });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('a selectable chip has a 44 pt touch target', async () => {
    await render(<Chip label="NM" selected={false} onPress={() => {}} />);

    expect(touchTarget(screen.getByRole('button', { name: 'NM' }))).toEqual({ width: 44, height: 44 });
  });

  test('a removable chip shows its label and ×, keeps the control surface, and removes itself when pressed', async () => {
    const onRemove = jest.fn();
    await render(<Chip label="set:mh2" onRemove={onRemove} />);

    const chip = screen.getByRole('button', { name: 'set:mh2' });
    await fireEvent.press(chip);

    expect(chip).toHaveProp('accessibilityHint', 'Removes this chip.');
    expect(chip).toHaveStyle({ backgroundColor: surfaceControl, height: 24, borderRadius: 12 });
    expect(within(chip).getByText('set:mh2')).toHaveStyle({ color: white, fontSize: 11, fontWeight: '700' });
    expect(within(chip).getByText('×')).toBeOnTheScreen();
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  test('a removable chip in the danger tone has danger text on the danger tint', async () => {
    await render(<Chip tone="danger" label="set:zzz" onRemove={() => {}} />);

    const chip = screen.getByRole('button', { name: 'set:zzz' });
    expect(chip).toHaveStyle({ backgroundColor: dangerTint });
    expect(within(chip).getByText('set:zzz')).toHaveStyle({ color: danger });
  });

  test('a removable chip has a 44 pt touch target', async () => {
    await render(<Chip label="is:free" onRemove={() => {}} />);

    expect(touchTarget(screen.getByRole('button', { name: 'is:free' }))).toEqual({ width: 44, height: 44 });
  });
});

describe('Toggle', () => {
  function ProtectToggle({ disabled = false }: { disabled?: boolean }) {
    const [pressed, setPressed] = useState(false);
    return (
      <Toggle pressed={pressed} onPressedChange={setPressed} disabled={disabled}>
        <Text>Protect</Text>
      </Toggle>
    );
  }

  test('a toggle is off with the control surface until pressed, then on and lime', async () => {
    await render(<ProtectToggle />);

    const toggle = screen.getByRole('switch', { name: 'Protect' });
    expect(toggle).not.toBeChecked();
    expect(toggle).toHaveStyle({ backgroundColor: surfaceControl });
    expect(screen.getByText('Protect')).toHaveStyle({ color: white });

    await fireEvent.press(toggle);

    expect(toggle).toBeChecked();
    expect(toggle).toHaveStyle({ backgroundColor: lime });
    expect(screen.getByText('Protect')).toHaveStyle({ color: onPrimary });
  });

  test('a toggle turns off again when pressed again', async () => {
    await render(<ProtectToggle />);
    const toggle = screen.getByRole('switch', { name: 'Protect' });

    await fireEvent.press(toggle);
    await fireEvent.press(toggle);

    expect(toggle).not.toBeChecked();
  });

  test('a disabled toggle is dimmed, reads as disabled, and does not change', async () => {
    await render(<ProtectToggle disabled />);
    const toggle = screen.getByRole('switch', { name: 'Protect' });

    await fireEvent.press(toggle);

    expect(toggle).toBeDisabled();
    expect(toggle).not.toBeChecked();
    expect(toggle).toHaveStyle(dimmed);
  });

  test('a toggle has a 44 pt touch target', async () => {
    await render(<ProtectToggle />);

    expect(touchTarget(screen.getByRole('switch', { name: 'Protect' }))).toEqual({ width: 44, height: 44 });
  });
});

describe('Surface', () => {
  test('a surface has the surface color, 12 px corners, and 10 px padding', async () => {
    await render(
      <Surface accessibilityLabel="Account">
        <Text>Signed in with Apple</Text>
      </Surface>,
    );

    expect(screen.getByLabelText('Account')).toHaveStyle({ backgroundColor: surface, borderRadius: 12, padding: 10 });
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
  });

  test('a surface with an action is a button with a 44 pt touch target', async () => {
    const onPress = jest.fn();
    await render(
      <Surface onPress={onPress}>
        <Text>Lightning Bolt</Text>
      </Surface>,
    );

    const card = screen.getByRole('button', { name: 'Lightning Bolt' });
    await fireEvent.press(card);

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(card).toHaveStyle({ backgroundColor: surface });
    expect(touchTarget(card).height).toBeGreaterThanOrEqual(44);
  });
});

describe('Switch', () => {
  function ScanSoundsSwitch() {
    const [on, setOn] = useState(true);
    return <Switch accessibilityLabel="Scan sounds" value={on} onValueChange={setOn} />;
  }

  test('a switch reads as a switch with its label and state, and turns off', async () => {
    await render(<ScanSoundsSwitch />);

    const toggle = screen.getByRole('switch', { name: 'Scan sounds' });
    expect(toggle).toBeChecked();

    await fireEvent(toggle, 'valueChange', false);

    expect(toggle).not.toBeChecked();
  });

  test('a switch has a lime track when on', async () => {
    await render(<ScanSoundsSwitch />);

    expect(switchTrackColor(screen.getByRole('switch', { name: 'Scan sounds' }))).toBe('#d8ff62');
  });
});

describe('AppleSignInButton', () => {
  test('the Apple sign-in button is the system button, 50 px tall, and runs its action when pressed', async () => {
    const onPress = jest.fn();
    await render(<AppleSignInButton busy={false} disabled={false} onPress={onPress} />);

    expect(appleSignInButton()).toHaveStyle({ height: 50 });
    await pressSignInWithApple();

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('a disabled Apple sign-in button is dimmed and does nothing when pressed', async () => {
    const onPress = jest.fn();
    await render(<AppleSignInButton busy={false} disabled onPress={onPress} />);

    expect(appleSignInButton().parent).toHaveStyle(dimmed);
    await pressSignInWithApple();

    expect(onPress).not.toHaveBeenCalled();
  });

  test('a busy Apple sign-in button is a white button with a spinner that reads as busy', async () => {
    await render(<AppleSignInButton busy disabled={false} onPress={() => {}} />);

    const button = screen.getByRole('button', { name: 'Sign in with Apple' });
    expect(button).toBeBusy();
    expect(button).toBeDisabled();
    expect(showsSpinner(button)).toBe(true);
    expect(button).toHaveStyle({ backgroundColor: 'rgba(255, 255, 255, 1)', height: 50, borderRadius: 8 });
  });
});

describe('GoogleSignInButton', () => {
  test('Continue with Google shows the Google logo until it is busy, then a spinner', async () => {
    const { rerender } = await render(<GoogleSignInButton busy={false} disabled={false} onPress={() => {}} />);
    const button = screen.getByRole('button', { name: 'Continue with Google' });
    expect(button.queryAll((instance) => instance.type === 'Image')).toHaveLength(1);
    expect(showsSpinner(button)).toBe(false);

    await rerender(<GoogleSignInButton busy disabled={false} onPress={() => {}} />);

    const busyButton = screen.getByRole('button', { name: 'Continue with Google' });
    expect(busyButton.queryAll((instance) => instance.type === 'Image')).toHaveLength(0);
    expect(showsSpinner(busyButton)).toBe(true);
    expect(busyButton).toBeBusy();
  });
});

describe('TextLink', () => {
  test('a text link reads as a link in bold lime and runs its action when pressed', async () => {
    const onPress = jest.fn();
    await render(
      <Text variant="meta">
        Your collection stays private. <TextLink onPress={onPress}>Privacy policy</TextLink>
      </Text>,
    );

    const link = screen.getByRole('link', { name: 'Privacy policy' });
    await fireEvent.press(link);

    expect(link).toHaveStyle({ color: lime, fontWeight: '700' });
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('GlassSurface', () => {
  test('on Liquid Glass, a glass surface is regular glass with no tint and its own corners', async () => {
    liquidGlassIsAvailable();
    await render(
      <GlassSurface fallback="surface" className="rounded-md">
        <Text>Lightning Bolt</Text>
      </GlassSurface>,
    );

    const glass = backdropOf(screen.getByText('Lightning Bolt'));
    expect(glassEffect(glass)).toEqual({ style: 'regular', interactive: false, tintColor: undefined });
    expect(glass).toHaveStyle({ borderRadius: 12 });
  });

  test('an interactive glass surface reacts to touch', async () => {
    liquidGlassIsAvailable();
    await render(
      <GlassSurface fallback="surface-control" interactive>
        <Text>+1</Text>
      </GlassSurface>,
    );

    expect(glassEffect(backdropOf(screen.getByText('+1')))).toEqual({ style: 'regular', interactive: true, tintColor: undefined });
  });

  test.each([
    ['surface', surface],
    ['surface-control', surfaceControl],
  ] as const)('without Liquid Glass, a glass surface falls back to the %s color', async (fallback, color) => {
    await render(
      <GlassSurface fallback={fallback} className="rounded-md" interactive>
        <Text>Lightning Bolt</Text>
      </GlassSurface>,
    );

    const background = backdropOf(screen.getByText('Lightning Bolt'));
    expect(glassEffect(background)).toBeNull();
    expect(background).toHaveStyle({ backgroundColor: color, borderRadius: 12 });
  });

  test('on Liquid Glass, glass surfaces in a glass group sit directly in one glass container', async () => {
    liquidGlassIsAvailable();
    await render(
      <GlassGroup className="gap-sm">
        <GlassSurface fallback="surface">
          <Text>Lightning Bolt</Text>
        </GlassSurface>
        <GlassSurface fallback="surface-control" interactive>
          <Text>+1</Text>
        </GlassSurface>
      </GlassGroup>,
    );

    const group = glassGroupOf(screen.getByText('Lightning Bolt'));
    expect(group).not.toBeNull();
    expect(glassGroupOf(screen.getByText('+1'))).toBe(group);
    expect(group).toHaveStyle({ rowGap: 8 });
  });

  test('without Liquid Glass, a glass group is a plain view', async () => {
    await render(
      <GlassGroup className="gap-sm">
        <GlassSurface fallback="surface">
          <Text>Lightning Bolt</Text>
        </GlassSurface>
      </GlassGroup>,
    );

    expect(glassGroupOf(screen.getByText('Lightning Bolt'))).toBeNull();
  });

  test('on Liquid Glass, meta text is the lighter glass text muted color', async () => {
    liquidGlassIsAvailable();
    await render(
      <GlassSurface fallback="surface">
        <Text variant="meta">M10 146</Text>
      </GlassSurface>,
    );

    expect(screen.getByText('M10 146')).toHaveStyle({ color: glassTextMuted });
  });

  test('without Liquid Glass, meta text keeps the text muted color', async () => {
    await render(
      <GlassSurface fallback="surface">
        <Text variant="meta">M10 146</Text>
      </GlassSurface>,
    );

    expect(screen.getByText('M10 146')).toHaveStyle({ color: textMuted });
  });
});

describe('Skeleton', () => {
  test('a skeleton is a line-colored block with 4 px corners that starts dimmed', async () => {
    await render(
      <View accessibilityLabel="Recognizing card">
        <Skeleton className="h-skeleton-title-bar w-[70%]" />
      </View>,
    );

    const [block] = screen.getByLabelText('Recognizing card').children as ReturnType<typeof screen.getByLabelText>[];
    expect(block).toHaveStyle({ backgroundColor: line, borderRadius: 4, height: 14, width: '70%', opacity: 0.45 });
  });

  test('on Liquid Glass, a skeleton takes the glass skeleton color', async () => {
    liquidGlassIsAvailable();
    await render(
      <GlassSurface fallback="surface">
        <View accessibilityLabel="Recognizing card">
          <Skeleton className="h-skeleton-title-bar w-[70%]" />
        </View>
      </GlassSurface>,
    );

    const skeleton = screen.getByLabelText('Recognizing card');
    expect(blocksColored(skeleton, glassSkeleton)).toBe(1);
    expect(blocksColored(skeleton, line)).toBe(0);
  });
});

describe('CardThumbnail', () => {
  test('an empty card thumbnail is a line-colored card shape', async () => {
    await render(
      <View accessibilityLabel="Thumbnail">
        <CardThumbnail uri={undefined} />
      </View>,
    );

    expect(blocksColored(screen.getByLabelText('Thumbnail'), line)).toBe(1);
  });

  test('on Liquid Glass, an empty card thumbnail takes the glass skeleton color', async () => {
    liquidGlassIsAvailable();
    await render(
      <GlassSurface fallback="surface">
        <View accessibilityLabel="Thumbnail">
          <CardThumbnail uri={undefined} />
        </View>
      </GlassSurface>,
    );

    const thumbnail = screen.getByLabelText('Thumbnail');
    expect(blocksColored(thumbnail, glassSkeleton)).toBe(1);
    expect(blocksColored(thumbnail, line)).toBe(0);
  });
});

describe('DimSymbol', () => {
  test('a dim symbol is tinted with the text dim color', async () => {
    await render(
      <View accessibilityLabel="Opens details">
        <DimSymbol name="chevron.right" size={14} />
      </View>,
    );

    expect(symbolTintColor(screen.getByLabelText('Opens details'))).toBe(textDim);
  });

  test('on Liquid Glass, a dim symbol takes the lighter glass text dim color', async () => {
    liquidGlassIsAvailable();
    await render(
      <GlassSurface fallback="surface">
        <View accessibilityLabel="Opens details">
          <DimSymbol name="chevron.right" size={14} />
        </View>
      </GlassSurface>,
    );

    expect(symbolTintColor(screen.getByLabelText('Opens details'))).toBe(glassTextDim);
  });
});

describe('QuickActionButton', () => {
  test('a quick action has its label in chip type and runs its action when pressed', async () => {
    const onPress = jest.fn();
    await render(<QuickActionButton label="+1" onPress={onPress} />);

    const action = screen.getByRole('button', { name: '+1' });
    await fireEvent.press(action);

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(action).toHaveStyle({ height: 32, paddingLeft: 12, paddingRight: 12 });
    expect(screen.getByText('+1')).toHaveStyle({ color: white, fontSize: 11, fontWeight: '700' });
  });

  test('a quick action with no action reads as disabled and has a text dim label', async () => {
    await render(<QuickActionButton label="Finish" />);

    expect(screen.getByRole('button', { name: 'Finish' })).toBeDisabled();
    expect(screen.getByText('Finish')).toHaveStyle({ color: textDim });
  });

  test('on Liquid Glass, a quick action with no action has a glass text dim label', async () => {
    liquidGlassIsAvailable();
    await render(
      <GlassSurface fallback="surface-control" interactive>
        <QuickActionButton label="Finish" />
        <QuickActionButton label="+1" onPress={() => {}} />
      </GlassSurface>,
    );

    expect(screen.getByText('Finish')).toHaveStyle({ color: glassTextDim });
    expect(screen.getByText('+1')).toHaveStyle({ color: white });
  });

  test('a quick action has a 44 pt touch target', async () => {
    await render(<QuickActionButton label="+1" onPress={() => {}} />);

    expect(touchTarget(screen.getByRole('button', { name: '+1' }))).toEqual({ width: 44, height: 44 });
  });

  test('a quick action shows its icon in place of its label', async () => {
    await render(
      <QuickActionButton label="M10" onPress={() => {}}>
        <SetIcon uri="https://svgs.scryfall.io/sets/m10.svg" />
      </QuickActionButton>,
    );

    expect(screen.getByRole('button', { name: 'M10' })).toBeOnTheScreen();
    expect(screen.queryByText('M10')).not.toBeOnTheScreen();
  });
});

describe('SetIcon', () => {
  test('a set icon is 16 px and tinted with the text color', async () => {
    await render(
      <View accessibilityLabel="M10">
        <SetIcon uri="https://svgs.scryfall.io/sets/m10.svg" />
      </View>,
    );

    const label = screen.getByLabelText('M10');
    const [icon] = label.children as ReturnType<typeof screen.getByLabelText>[];
    expect(icon).toHaveStyle({ width: 16, height: 16 });
    expect(cardImageUri(label)).toBe('https://svgs.scryfall.io/sets/m10.svg');
    expect(imageTintColor(label)).toBe(processColor('#ffffff'));
  });

  test.each([
    ['common', '#e6e8e9'],
    ['uncommon', '#a7bccb'],
    ['rare', '#e2bd5a'],
    ['mythic', '#f26a35'],
    ['special', '#b48ef0'],
    ['bonus', '#b48ef0'],
  ] as const)('a set icon for the %s rarity is tinted with its rarity color', async (rarity, color) => {
    await render(
      <View accessibilityLabel="M10">
        <SetIcon uri="https://svgs.scryfall.io/sets/m10.svg" rarity={rarity} />
      </View>,
    );

    expect(imageTintColor(screen.getByLabelText('M10'))).toBe(processColor(color));
  });

  test('a set icon of a rarity the app does not know keeps the text color', async () => {
    await render(
      <View accessibilityLabel="M10">
        <SetIcon uri="https://svgs.scryfall.io/sets/m10.svg" rarity={'timeshifted' as 'rare'} />
      </View>,
    );

    expect(imageTintColor(screen.getByLabelText('M10'))).toBe(processColor('#ffffff'));
  });
});

describe('CardImage', () => {
  function tile(sheen?: 'foil' | 'etched') {
    return render(
      <View accessibilityLabel="Card">
        <CardImage uri="https://cards.scryfall.io/normal/front/sol-ring.jpg" sheen={sheen} />
      </View>,
    );
  }

  test('a card image without a sheen has no overlay', async () => {
    await tile();

    expect(cardSheen(screen.getByLabelText('Card'))).toBeNull();
  });

  test.each([
    ['foil', 'linear-gradient(115deg, transparent 22%, rgba(255, 80, 170, 0.55) 34%'],
    ['etched', 'linear-gradient(120deg, transparent 25%, rgba(255, 255, 255, 0.55) 42%'],
  ] as const)('the %s sheen is a faint, still gradient over the card image', async (sheen, gradientStart) => {
    await tile(sheen);

    const overlay = cardSheen(screen.getByLabelText('Card'))!;
    expect(String(overlay.experimental_backgroundImage).startsWith(gradientStart)).toBe(true);
    expect(overlay).toMatchObject({ position: 'absolute', opacity: expect.closeTo(0.3) });
    expect(overlay).not.toHaveProperty('transform');
  });
});

describe('Input', () => {
  test('an input is a 38 px field on the control surface with field text and a text dim placeholder', async () => {
    await render(<Input accessibilityLabel="Card name" placeholder="Card name" />);

    const input = screen.getByLabelText('Card name');
    expect(input).toHaveStyle({
      height: 38,
      borderRadius: 8,
      paddingLeft: 12,
      paddingRight: 12,
      backgroundColor: surfaceControl,
      color: white,
      fontSize: 14,
    });
    expect(input).not.toHaveStyle({ lineHeight: 19 });
    expect(placeholderColor(input)).toBe('#7d8a90');
  });
});

describe('ProgressBar', () => {
  test('a progress bar reads its value and fills that share of a round line-colored track', async () => {
    await render(<ProgressBar label="Downloading gallery" value={25} max={100} />);

    const bar = screen.getByRole('progressbar', { name: 'Downloading gallery' });
    expect(bar).toHaveAccessibilityValue({ min: 0, max: 100, now: 25 });
    expect(bar).toHaveStyle({ height: 4, borderRadius: 999, backgroundColor: line });
    const [fill] = bar.children as ReturnType<typeof screen.getByLabelText>[];
    expect(fill).toHaveStyle({ width: '25%', backgroundColor: textMuted });
  });

  test('a progress bar with no total is empty', async () => {
    await render(<ProgressBar label="Downloading gallery" value={0} max={0} />);

    const [fill] = screen.getByRole('progressbar').children as ReturnType<typeof screen.getByLabelText>[];
    expect(fill).toHaveStyle({ width: '0%' });
  });
});

describe('CountBadge', () => {
  test('a count badge shows white numerals on a round badge-colored pill', async () => {
    await render(<CountBadge count={12} />);

    const numerals = screen.getByText('12');
    expect(numerals).toHaveStyle({ color: white, fontSize: 11, fontWeight: '700' });
    expect(numerals.parent).toHaveStyle({ backgroundColor: badge, borderRadius: 999, height: 17, minWidth: 17 });
  });
});

describe('FloatingMenuButton', () => {
  function sortChoices(onSelect: (title: string) => void) {
    return [
      { title: 'Relevance', checked: false, onSelect: () => onSelect('Relevance') },
      { title: 'Price', checked: true, symbol: 'arrow.down' as const, onSelect: () => onSelect('Price') },
    ];
  }

  test('on Liquid Glass, a floating menu button is a 48 px round glass button that reacts to touch, with an 18 px symbol', async () => {
    liquidGlassIsAvailable();
    await render(
      <FloatingMenuButton symbol="arrow.up.arrow.down" active={false} accessibilityLabel="Sort, Relevance" menuTitle="Sort by" choices={[]} />,
    );

    const button = menuButton(screen.container, 'Sort, Relevance');
    const glass = backdropOf(symbolIn(button));
    expect(glassEffect(glass)).toEqual({ style: 'regular', interactive: true, tintColor: undefined });
    expect(glass).toHaveStyle({ width: 48, height: 48, borderRadius: 999 });
    expect(symbolNames(button)).toEqual(['arrow.up.arrow.down']);
    expect(symbolSizes(button)).toEqual([18]);
    expect(symbolTintColor(button)).toBe(white);
  });

  test('without Liquid Glass, a floating menu button uses the control surface', async () => {
    await render(
      <FloatingMenuButton symbol="arrow.up.arrow.down" active={false} accessibilityLabel="Sort, Relevance" menuTitle="Sort by" choices={[]} />,
    );

    const button = menuButton(screen.container, 'Sort, Relevance');
    const background = backdropOf(symbolIn(button));
    expect(glassEffect(background)).toBeNull();
    expect(background).toHaveStyle({ backgroundColor: surfaceControl, width: 48, height: 48, borderRadius: 999 });
  });

  test('an active floating menu button has a lime symbol', async () => {
    await render(
      <FloatingMenuButton symbol="arrow.up.arrow.down" active accessibilityLabel="Sort, Price, high to low" menuTitle="Sort by" choices={[]} />,
    );

    expect(symbolTintColor(menuButton(screen.container, 'Sort, Price, high to low'))).toBe(lime);
  });

  test('a floating menu button opens a native menu with its title and choices, and runs the chosen one', async () => {
    const onSelect = jest.fn();
    await render(
      <FloatingMenuButton
        symbol="arrow.up.arrow.down"
        active
        accessibilityLabel="Sort, Price, high to low"
        menuTitle="Sort by"
        choices={sortChoices(onSelect)}
      />,
    );

    const button = menuButton(screen.container, 'Sort, Price, high to low');
    expect(buttonMenu(button)).toEqual({
      title: 'Sort by',
      items: [
        { title: 'Relevance', checked: false, symbol: undefined },
        { title: 'Price', checked: true, symbol: 'arrow.down' },
      ],
    });

    await pressButtonMenuItem(button, 'Price');

    expect(onSelect).toHaveBeenCalledWith('Price');
  });
});
