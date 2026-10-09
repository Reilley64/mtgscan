import type { ConfigContext, ExpoConfig } from 'expo/config';

const googleClientIdSuffix = '.apps.googleusercontent.com';

function googleIosUrlScheme(iosClientId: string | undefined) {
  if (!iosClientId?.endsWith(googleClientIdSuffix)) {
    throw new Error(
      `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID must be a Google iOS client ID ending in ${googleClientIdSuffix}`,
    );
  }
  return `com.googleusercontent.apps.${iosClientId.slice(0, -googleClientIdSuffix.length)}`;
}

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name ?? 'mtgscan',
  slug: config.slug ?? 'mtgscan',
  plugins: [
    ...(config.plugins ?? []),
    [
      '@react-native-google-signin/google-signin',
      { iosUrlScheme: googleIosUrlScheme(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID) },
    ],
  ],
});
