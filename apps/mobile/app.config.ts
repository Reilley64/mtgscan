import type { ConfigContext, ExpoConfig } from 'expo/config';
import { type ConfigPlugin, IOSConfig, withInfoPlist } from 'expo/config-plugins';

const googleClientIdSuffix = '.apps.googleusercontent.com';

function googleIosUrlScheme(iosClientId: string | undefined) {
  if (!iosClientId?.endsWith(googleClientIdSuffix)) {
    throw new Error(
      `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID must be a Google iOS client ID ending in ${googleClientIdSuffix}`,
    );
  }
  return `com.googleusercontent.apps.${iosClientId.slice(0, -googleClientIdSuffix.length)}`;
}

const withGoogleIosUrlScheme: ConfigPlugin = (config) =>
  withInfoPlist(config, (infoPlistConfig) => {
    const scheme = googleIosUrlScheme(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID);
    if (!IOSConfig.Scheme.hasScheme(scheme, infoPlistConfig.modResults)) {
      infoPlistConfig.modResults = IOSConfig.Scheme.appendScheme(scheme, infoPlistConfig.modResults);
    }
    return infoPlistConfig;
  });

export default ({ config }: ConfigContext): ExpoConfig =>
  withGoogleIosUrlScheme({
    ...config,
    name: config.name ?? 'mtgscan',
    slug: config.slug ?? 'mtgscan',
  });
