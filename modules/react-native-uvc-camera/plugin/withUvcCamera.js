const {
  withAndroidManifest,
  createRunOncePlugin,
} = require('@expo/config-plugins');
const pkg = require('./package.json');

const CAMERA_USAGE = 'Allow $(PRODUCT_NAME) to access your camera';

/**
 * Adds USB host permissions and camera permission to AndroidManifest.xml
 */
const withAndroidUsbPermissions = (config) => {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    // Ensure uses-permission array exists
    if (!manifest['uses-permission']) {
      manifest['uses-permission'] = [];
    }

    // Ensure uses-feature array exists
    if (!manifest['uses-feature']) {
      manifest['uses-feature'] = [];
    }

    // Add CAMERA permission if not already present
    const hasCameraPermission = manifest['uses-permission'].some(
      (perm) => perm.$?.['android:name'] === 'android.permission.CAMERA'
    );
    if (!hasCameraPermission) {
      manifest['uses-permission'].push({
        $: {
          'android:name': 'android.permission.CAMERA',
        },
      });
    }

    // Add USB_PERMISSION if not already present
    const hasUsbPermission = manifest['uses-permission'].some(
      (perm) => perm.$?.['android:name'] === 'android.permission.USB_PERMISSION'
    );
    if (!hasUsbPermission) {
      manifest['uses-permission'].push({
        $: {
          'android:name': 'android.permission.USB_PERMISSION',
        },
      });
    }

    // Add USB host feature if not already present
    const hasUsbHostFeature = manifest['uses-feature']?.some(
      (feat) => feat.$?.['android:name'] === 'android.hardware.usb.host'
    );
    if (!hasUsbHostFeature) {
      manifest['uses-feature'].push({
        $: {
          'android:name': 'android.hardware.usb.host',
          'android:required': 'true',
        },
      });
    }

    return config;
  });
};

/**
 * Main UVC Camera config plugin
 */
const withUvcCamera = (config, props = {}) => {
  // iOS: Set camera permission text in Info.plist
  if (config.ios == null) config.ios = {};
  if (config.ios.infoPlist == null) config.ios.infoPlist = {};

  config.ios.infoPlist.NSCameraUsageDescription =
    props?.cameraPermissionText ??
    config.ios.infoPlist.NSCameraUsageDescription ??
    CAMERA_USAGE;

  // Android: Add USB permissions and features
  config = withAndroidUsbPermissions(config);

  return config;
};

module.exports = createRunOncePlugin(withUvcCamera, pkg.name, pkg.version);
