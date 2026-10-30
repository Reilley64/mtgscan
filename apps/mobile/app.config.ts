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

function testAppConfig(config: ExpoConfig): ExpoConfig {
  if (process.env.EAS_BUILD) {
    throw new Error('The test app is for local builds only. Unset EXPO_PUBLIC_APP_VARIANT for EAS builds.');
  }
  return {
    ...config,
    name: 'mtgscan Test',
    scheme: 'mtgscan-test',
    ios: { ...config.ios, bundleIdentifier: 'dev.reilley.mtgscan.test' },
  };
}

function withCameraPhotoOption(config: ExpoConfig): ExpoConfig {
  const option = process.env.CAMERA_PHOTO_OPTION;
  if (!option) {
    return config;
  }
  if (process.env.EAS_BUILD) {
    throw new Error('CAMERA_PHOTO_OPTION is for local development builds only. Unset it for EAS builds.');
  }
  return { ...config, ios: { ...config.ios, infoPlist: { ...config.ios?.infoPlist, CardDetectorPhotoOption: option } } };
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const appConfig: ExpoConfig = { ...config, name: config.name ?? 'mtgscan', slug: config.slug ?? 'mtgscan' };
  return withGoogleIosUrlScheme(
    withCameraPhotoOption(process.env.EXPO_PUBLIC_APP_VARIANT === 'test' ? testAppConfig(appConfig) : appConfig),
  );
};
