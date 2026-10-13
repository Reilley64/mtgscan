import '../global.css';

import { DarkTheme, Stack, ThemeProvider, type NativeStackNavigationOptions } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SessionProvider, useSession } from '@/auth/session';
import { GalleryProvider } from '@/gallery/gallery-state';
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

const drawerOptions: NativeStackNavigationOptions = {
  presentation: 'formSheet',
  sheetAllowedDetents: [0.5, 1],
  sheetGrabberVisible: true,
  sheetExpandsWhenScrolledToEdge: false,
  contentStyle: { backgroundColor: colors.sheet },
};

function RootStack() {
  const signedIn = useSession() !== null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="scan-details" options={drawerOptions} />
        <Stack.Screen name="scan-printings" options={drawerOptions} />
        <Stack.Screen name="settings" options={drawerOptions} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      <Stack.Screen name="liquid-glass-prototype" />
      <Stack.Protected guard={__DEV__}>
        <Stack.Screen name="primitives" />
        <Stack.Screen name="primitives-sheet" options={drawerOptions} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider value={navigationTheme}>
        <StatusBar style="light" />
        <SessionProvider>
          <GalleryProvider>
            <ScanSoundsProvider>
              <ScanBatchProvider>
                <RootStack />
              </ScanBatchProvider>
            </ScanSoundsProvider>
          </GalleryProvider>
        </SessionProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
