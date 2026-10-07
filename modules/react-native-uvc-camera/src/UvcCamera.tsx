import React, {
  useRef,
  useImperativeHandle,
  forwardRef,
  useCallback,
  useEffect,
} from 'react';
import { type ViewProps } from 'react-native';
import UvcCameraNativeComponent, { Commands } from './UvcCameraNativeComponent';
import {
  parseDetectionsEvent,
  type DetectionInfo,
  type DetectionsNativeEvent,
  type RawDetection,
} from './detections';

// Error codes matching native CameraErrorEvent
export const CameraErrorCodes = {
  CAMERA_OPEN_FAILED: 1,
  CAMERA_DISCONNECTED: 2,
  CAPTURE_FAILED: 3,
  PERMISSION_DENIED: 4,
  NO_DEVICE_FOUND: 5,
  DETECTOR_FAILED: 6,
} as const;

export type CameraError = {
  code: number;
  message: string;
};

export type DeviceInfo = {
  deviceName: string;
  vendorId: number;
  productId: number;
};

type UvcCameraProps = ViewProps & {
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
   * Timeout in milliseconds for picture capture (default: 10000)
   */
  captureTimeout?: number;
  /**
   * Called when the camera is ready and connected
   */
  onCameraReady?: (device: DeviceInfo) => void;
  /**
   * Called when a camera error occurs
   */
  onCameraError?: (error: CameraError) => void;
  /**
   * Called when the USB camera device is disconnected
   */
  onDeviceDisconnected?: () => void;
};

export type UvcCameraHandle = {
  /**
   * Take a picture and return the file URI
   * @throws Error if capture fails or times out
   */
  takePicture: () => Promise<{ uri: string }>;
};

const DEFAULT_CAPTURE_TIMEOUT = 10000; // 10 seconds

const UvcCamera = forwardRef<UvcCameraHandle, UvcCameraProps>((props, ref) => {
  const {
    captureTimeout = DEFAULT_CAPTURE_TIMEOUT,
    onCameraReady,
    onCameraError,
    onDeviceDisconnected,
    onDetections,
    ...viewProps
  } = props;

  const nativeRef =
    useRef<React.ElementRef<typeof UvcCameraNativeComponent>>(null);

  const pendingPromiseRef = useRef<{
    resolve: (value: { uri: string }) => void;
    reject: (reason?: Error) => void;
    timeoutId: ReturnType<typeof setTimeout>;
  } | null>(null);

  // Cleanup pending promise on unmount
  useEffect(() => {
    return () => {
      if (pendingPromiseRef.current) {
        clearTimeout(pendingPromiseRef.current.timeoutId);
        pendingPromiseRef.current.reject(
          new Error('Component unmounted before capture completed')
        );
        pendingPromiseRef.current = null;
      }
    };
  }, []);

  useImperativeHandle(ref, () => ({
    takePicture: () => {
      return new Promise((resolve, reject) => {
        if (pendingPromiseRef.current) {
          reject(new Error('Another picture request is already pending.'));
          return;
        }

        // Set timeout to prevent hanging promises
        const timeoutId = setTimeout(() => {
          if (pendingPromiseRef.current) {
            pendingPromiseRef.current = null;
            reject(new Error('Picture capture timed out'));
          }
        }, captureTimeout);

        pendingPromiseRef.current = {
          resolve: (value) => {
            clearTimeout(timeoutId);
            resolve(value);
          },
          reject: (error) => {
            clearTimeout(timeoutId);
            reject(error);
          },
          timeoutId,
        };

        if (nativeRef.current) {
          Commands.takePicture(nativeRef.current);
        } else {
          clearTimeout(timeoutId);
          pendingPromiseRef.current = null;
          reject(new Error('Native camera view is not ready.'));
        }
      });
    },
  }));

  const handlePictureTaken = useCallback(
    (event: { nativeEvent: { uri: string } }) => {
      const { uri } = event.nativeEvent;
      if (pendingPromiseRef.current) {
        pendingPromiseRef.current.resolve({ uri });
        pendingPromiseRef.current = null;
      }
    },
    []
  );

  const handleCameraError = useCallback(
    (event: { nativeEvent: { code: number; message: string } }) => {
      const { code, message } = event.nativeEvent;

      // If there's a pending capture, reject it
      if (pendingPromiseRef.current) {
        pendingPromiseRef.current.reject(
          new Error(`Camera error (${code}): ${message}`)
        );
        pendingPromiseRef.current = null;
      }

      // Call the error callback
      onCameraError?.({ code, message });
    },
    [onCameraError]
  );

  const handleCameraReady = useCallback(
    (event: {
      nativeEvent: { deviceName: string; vendorId: number; productId: number };
    }) => {
      const { deviceName, vendorId, productId } = event.nativeEvent;
      onCameraReady?.({ deviceName, vendorId, productId });
    },
    [onCameraReady]
  );

  const handleDetections = useCallback(
    (event: DetectionsNativeEvent) => {
      if (!onDetections) return;
      const parsed = parseDetectionsEvent(event);
      if (parsed) onDetections(...parsed);
    },
    [onDetections]
  );

  const handleDeviceDisconnected = useCallback(() => {
    // Reject any pending capture
    if (pendingPromiseRef.current) {
      pendingPromiseRef.current.reject(new Error('Camera device disconnected'));
      pendingPromiseRef.current = null;
    }
    onDeviceDisconnected?.();
  }, [onDeviceDisconnected]);

  return (
    <UvcCameraNativeComponent
      ref={nativeRef}
      {...viewProps}
      onPictureTaken={handlePictureTaken}
      onCameraError={handleCameraError}
      onCameraReady={handleCameraReady}
      onDeviceDisconnected={handleDeviceDisconnected}
      onDetections={handleDetections}
    />
  );
});

UvcCamera.displayName = 'UvcCamera';

export default UvcCamera;
