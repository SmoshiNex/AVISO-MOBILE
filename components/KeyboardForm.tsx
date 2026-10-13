import type { ComponentProps, ReactNode } from 'react';
import { KeyboardAwareScrollView, KeyboardToolbar } from 'react-native-keyboard-controller';

/** Room kept between the focused input and the keyboard: the toolbar (~42) plus a gap. */
const WITH_TOOLBAR_OFFSET = 62;
const PLAIN_OFFSET = 24;

type KeyboardFormProps = ComponentProps<typeof KeyboardAwareScrollView> & {
  children: ReactNode;
  /** Prev / Next / Done bar above the keyboard. Off for one-field screens like OTP codes. */
  toolbar?: boolean;
};

/**
 * Scrollable form that keeps the focused input visible above the keyboard.
 * The app is edge-to-edge, so Android no longer shrinks the screen for the keyboard;
 * this scrolls the tapped field into view instead. Taps on buttons work on the first
 * tap while the keyboard is open (keyboardShouldPersistTaps="handled").
 * Needs <KeyboardProvider> at the app root (app/_layout.tsx).
 */
export function KeyboardForm({ children, toolbar = true, ...scrollProps }: KeyboardFormProps) {
  return (
    <>
      <KeyboardAwareScrollView
        bottomOffset={toolbar ? WITH_TOOLBAR_OFFSET : PLAIN_OFFSET}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        {...scrollProps}
      >
        {children}
      </KeyboardAwareScrollView>
      {toolbar && <KeyboardToolbar />}
    </>
  );
}
