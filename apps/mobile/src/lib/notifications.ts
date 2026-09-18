import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

export const FAZOO_NOTIFICATION_CHANNEL_ID = 'fazoo-alerts';
export const FAZOO_NOTIFICATION_SOUND = 'fazoo_notification.wav';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Android binds custom sounds to notification channels. Once created, a
 * channel's sound is controlled by the operating system, so this stable ID is
 * also the channel that push-notification payloads should target.
 */
export async function configureNotificationSound() {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync(FAZOO_NOTIFICATION_CHANNEL_ID, {
    name: 'FAZOO alerts',
    description: 'Updates about assignments, approvals, printing and delivery.',
    importance: Notifications.AndroidImportance.HIGH,
    sound: FAZOO_NOTIFICATION_SOUND,
    vibrationPattern: [0, 250, 150, 250],
    lightColor: '#7B2FBE',
  });
}
