# @kartik512/react-native-uvc-camera

[![npm version](https://badge.fury.io/js/%40kartik512%2Freact-native-uvc-camera.svg)](https://www.npmjs.com/package/@kartik512/react-native-uvc-camera)

UVC Camera support for React Native - Access and control USB Video Class cameras on Android.

## Features

- 📷 Connect to UVC (USB Video Class) cameras on Android
- 🎥 Live camera preview
- 📸 Capture images with promise-based API
- ⚙️ Device info and error handling
- 🔌 USB disconnect detection

## Installation

```sh
npm install @kartik512/react-native-uvc-camera
# or
yarn add @kartik512/react-native-uvc-camera
```

### Android Setup

Add USB host feature to your `AndroidManifest.xml`:

```xml
<uses-feature android:name="android.hardware.usb.host" />
```

## Usage

```tsx
import React, { useRef } from 'react';
import { View, Button, StyleSheet } from 'react-native';
import UvcCamera, { 
  type UvcCameraHandle, 
  type DeviceInfo, 
  type CameraError 
} from '@kartik512/react-native-uvc-camera';

function App() {
  const cameraRef = useRef<UvcCameraHandle>(null);

  const handleCameraReady = (device: DeviceInfo) => {
    console.log('Camera connected:', device.deviceName);
    console.log('Vendor ID:', device.vendorId);
    console.log('Product ID:', device.productId);
  };

  const handleCameraError = (error: CameraError) => {
    console.error('Camera error:', error.code, error.message);
  };

  const handleDeviceDisconnected = () => {
    console.log('Camera disconnected');
  };

  const takePicture = async () => {
    try {
      const result = await cameraRef.current?.takePicture();
      console.log('Picture saved at:', result?.uri);
    } catch (error) {
      console.error('Failed to take picture:', error);
    }
  };

  return (
    <View style={styles.container}>
      <UvcCamera
        ref={cameraRef}
        style={styles.camera}
        captureTimeout={10000}
        onCameraReady={handleCameraReady}
        onCameraError={handleCameraError}
        onDeviceDisconnected={handleDeviceDisconnected}
      />
      <Button title="Take Picture" onPress={takePicture} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  camera: { flex: 1 },
});

export default App;
```

## API Reference

### UvcCamera Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `style` | `ViewStyle` | - | View container style |
| `captureTimeout` | `number` | `10000` | Timeout in ms for picture capture |
| `onCameraReady` | `(device: DeviceInfo) => void` | - | Called when camera connects |
| `onCameraError` | `(error: CameraError) => void` | - | Called on camera error |
| `onDeviceDisconnected` | `() => void` | - | Called when device disconnects |

### UvcCameraHandle Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `takePicture()` | `Promise<{ uri: string }>` | Captures a picture and returns file URI |

### Types

```typescript
type DeviceInfo = {
  deviceName: string;
  vendorId: number;
  productId: number;
};

type CameraError = {
  code: number;
  message: string;
};

// Error codes
const CameraErrorCodes = {
  CAMERA_OPEN_FAILED: 1,
  CAMERA_DISCONNECTED: 2,
  CAPTURE_FAILED: 3,
  PERMISSION_DENIED: 4,
  NO_DEVICE_FOUND: 5,
};
```

## Requirements

- React Native >= 0.71
- Android with USB Host support
- UVC compatible USB camera

## Contributing

See the [contributing guide](CONTRIBUTING.md) to learn how to contribute to the repository.

## License

MIT

---

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
