import {
  codegenNativeComponent,
  codegenNativeCommands,
  type ViewProps,
} from 'react-native';
import type { HostComponent } from 'react-native';
import type { CodegenTypes } from 'react-native';

// Event types - using CodegenTypes.Int32 for integer values as required by codegen
type PictureTakenEvent = Readonly<{ uri: string }>;

type CameraErrorEvent = Readonly<{
  code: CodegenTypes.Int32;
  message: string;
}>;

type CameraReadyEvent = Readonly<{
  deviceName: string;
  vendorId: CodegenTypes.Int32;
  productId: CodegenTypes.Int32;
}>;

type DeviceDisconnectedEvent = Readonly<{}>;

// `detections` is a JSON array of { classIndex, confidence, x, y, w, h } (0..1 of the view)
type DetectionsEvent = Readonly<{
  detections: string;
  inferenceMs: CodegenTypes.Double;
  delegate: string;
}>;

interface NativeProps extends ViewProps {
  detectionEnabled?: CodegenTypes.WithDefault<boolean, false>;
  /** Label for each model class index, drawn on the boxes like YOLOv8's results.plot() */
  classNames?: ReadonlyArray<string>;
  onDetections?: CodegenTypes.DirectEventHandler<DetectionsEvent>;
  onPictureTaken?: CodegenTypes.DirectEventHandler<PictureTakenEvent>;
  onCameraError?: CodegenTypes.DirectEventHandler<CameraErrorEvent>;
  onCameraReady?: CodegenTypes.DirectEventHandler<CameraReadyEvent>;
  onDeviceDisconnected?: CodegenTypes.DirectEventHandler<DeviceDisconnectedEvent>;
}

export type UvcCameraViewType = HostComponent<NativeProps>;

interface NativeCommands {
  takePicture: (viewRef: React.ElementRef<UvcCameraViewType>) => void;
}

// Export the Commands object
export const Commands: NativeCommands = codegenNativeCommands<NativeCommands>({
  supportedCommands: ['takePicture'],
});

export default codegenNativeComponent<NativeProps>(
  'UvcCameraView'
) as HostComponent<NativeProps>;
