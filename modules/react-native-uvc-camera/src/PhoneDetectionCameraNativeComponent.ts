import {
  codegenNativeComponent,
  type CodegenTypes,
  type HostComponent,
  type ViewProps,
} from 'react-native';

// `detections` is a JSON array of { classIndex, confidence, x, y, w, h } (0..1 of the view)
type DetectionsEvent = Readonly<{
  detections: string;
  inferenceMs: CodegenTypes.Double;
  delegate: string;
}>;

type CameraErrorEvent = Readonly<{
  code: CodegenTypes.Int32;
  message: string;
}>;

interface NativeProps extends ViewProps {
  detectionEnabled?: CodegenTypes.WithDefault<boolean, false>;
  /** Label for each model class index, drawn on the boxes like YOLOv8's results.plot() */
  classNames?: ReadonlyArray<string>;
  onDetections?: CodegenTypes.DirectEventHandler<DetectionsEvent>;
  onCameraError?: CodegenTypes.DirectEventHandler<CameraErrorEvent>;
}

export default codegenNativeComponent<NativeProps>(
  'PhoneDetectionCameraView'
) as HostComponent<NativeProps>;
