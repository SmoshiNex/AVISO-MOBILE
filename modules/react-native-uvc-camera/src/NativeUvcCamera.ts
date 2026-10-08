import { TurboModuleRegistry, type TurboModule } from 'react-native';

export interface Spec extends TurboModule {
  multiply(a: number, b: number): number;
  /** Loads the detection model in the background; resolves with "GPU" or "CPU" when ready. */
  prepareDetector(): Promise<string>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('UvcCamera');
