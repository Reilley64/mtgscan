import '../global.css';

import { DarkTheme, Stack, ThemeProvider, type NativeStackNavigationOptions } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SessionProvider, useSession } from '@/auth/session';
import { PriceCurrencyProvider } from '@/collection/price-currency-setting';
import { DeckCardOrderProvider } from '@/decks/deck-card-order';
import { fullHeightDrawerOptions, halfHeightDrawerOptions, pageSheetOptions } from '@/components/templates/drawer-sheet';
import { GalleryProvider } from '@/gallery/gallery-state';
import { NeedsYouCountsProvider } from '@/needs-you/needs-you-counts';
import { CurrentPricesProvider } from '@/scan/current-prices';
import { KeepAwakeWhileScanning } from '@/scan/keep-awake-while-scanning';
import { ScanBatchProvider } from '@/scan/scan-batch-state';
import { ScanSoundsProvider } from '@/scan/scan-sounds-setting';
import { colors } from '@/theme';

const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.background,
    text: colors.text,
    border: colors.line,
  },
};

const pushedScreenOptions: NativeStackNavigationOptions = {
  headerShown: true,
  headerTransparent: true,
  title: '',
  headerBackVisible: false,
  scrollEdgeEffects: { top: 'soft', bottom: 'automatic', left: 'automatic', right: 'automatic' },
};

const pushedScreenWithBarOptions = { ...pushedScreenOptions, headerTransparent: false, headerShadowVisible: false };

function RootStack() {
  const signedIn = useSession() !== null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="copy" options={pushedScreenOptions} />
        <Stack.Screen name="deck" options={pushedScreenOptions} />
        <Stack.Screen name="user-tag-picker" options={pushedScreenWithBarOptions} />
        <Stack.Screen name="add-to-deck" options={halfHeightDrawerOptions} />
        <Stack.Screen name="deck-validity" options={halfHeightDrawerOptions} />
        <Stack.Screen name="estimated-bracket" options={halfHeightDrawerOptions} />
        <Stack.Screen name="revert" options={pageSheetOptions} />
        <Stack.Screen name="bought" options={pageSheetOptions} />
        <Stack.Screen name="scan-batch" options={fullHeightDrawerOptions} />
        <Stack.Screen name="scan-details" options={fullHeightDrawerOptions} />
        <Stack.Screen name="scan-printings" options={fullHeightDrawerOptions} />
        <Stack.Screen name="scan-condition" options={halfHeightDrawerOptions} />
        <Stack.Screen name="scan-language" options={halfHeightDrawerOptions} />
        <Stack.Screen name="settings" options={halfHeightDrawerOptions} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      <Stack.Protected guard={__DEV__}>
        <Stack.Screen name="primitives" />
        <Stack.Screen name="primitives-sheet" options={halfHeightDrawerOptions} />
        <Stack.Screen name="primitives-full-height-sheet" options={fullHeightDrawerOptions} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider value={navigationTheme}>
        <StatusBar style="light" />
        <KeepAwakeWhileScanning />
        <SessionProvider>
          <GalleryProvider>
            <ScanSoundsProvider>
              <PriceCurrencyProvider>
                <CurrentPricesProvider>
                  <ScanBatchProvider>
                    <DeckCardOrderProvider>
                      <NeedsYouCountsProvider>
                        <RootStack />
                      </NeedsYouCountsProvider>
                    </DeckCardOrderProvider>
                  </ScanBatchProvider>
                </CurrentPricesProvider>
              </PriceCurrencyProvider>
            </ScanSoundsProvider>
          </GalleryProvider>
        </SessionProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
