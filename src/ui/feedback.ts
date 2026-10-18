import { Alert, Platform, ToastAndroid, Vibration } from 'react-native';

/** Short tap vibration, like native apps. */
export const haptic = (ms = 12) => {
  if (Platform.OS === 'android') Vibration.vibrate(ms);
};

/** Native toast message (Android) / alert fallback (iOS). */
export const toast = (message: string, long = false) => {
  if (Platform.OS === 'android') ToastAndroid.show(message, long ? ToastAndroid.LONG : ToastAndroid.SHORT);
  else Alert.alert(message);
};

export const toastError = (message: string) => {
  haptic(40);
  toast(message, true);
};

/** Native confirmation dialog. Resolves true when the user confirms. */
export const confirm = (title: string, message: string, confirmLabel = 'OK', destructive = false) =>
  new Promise<boolean>((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
