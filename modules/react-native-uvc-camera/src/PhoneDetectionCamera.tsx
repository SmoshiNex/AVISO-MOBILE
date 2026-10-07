import { useCallback } from 'react';
import { type ViewProps } from 'react-native';
import PhoneDetectionCameraNativeComponent from './PhoneDetectionCameraNativeComponent';
import {
  parseDetectionsEvent,
  type DetectionInfo,
  type DetectionsNativeEvent,
  type RawDetection,
} from './detections';
import type { CameraError } from './UvcCamera';

type PhoneDetectionCameraProps = ViewProps & {
  /**
   * Run the hazard model on the live preview (default: false)
   */
  detectionEnabled?: boolean;
  /**
   * Model class names by index; the boxes on the video are labeled with them
   */
  classNames?: readonly string[];
  /**
   * Called with the model's results for each analysed frame
   */
  onDetections?: (detections: RawDetection[], info: DetectionInfo) => void;
  /**
   * Called when the camera or the model fails to start
   */
  onCameraError?: (error: CameraError) => void;
};

/** The phone's back camera. Camera permission must already be granted. */
export default function PhoneDetectionCamera({
  onDetections,
  onCameraError,
  ...viewProps
}: PhoneDetectionCameraProps) {
  const handleDetections = useCallback(
    (event: DetectionsNativeEvent) => {
      if (!onDetections) return;
      const parsed = parseDetectionsEvent(event);
      if (parsed) onDetections(...parsed);
    },
    [onDetections]
  );

  const handleCameraError = useCallback(
    (event: { nativeEvent: { code: number; message: string } }) => {
      onCameraError?.(event.nativeEvent);
    },
    [onCameraError]
  );

  return (
    <PhoneDetectionCameraNativeComponent
      {...viewProps}
      onDetections={handleDetections}
      onCameraError={handleCameraError}
    />
  );
}
