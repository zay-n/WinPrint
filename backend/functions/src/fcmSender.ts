/**
 * fcmSender.ts — Firebase Cloud Messaging notification sender
 *
 * Sends a DATA-only FCM message (not a notification message) so that the
 * Android app's WinsoftFcmService.onMessageReceived() always fires and can
 * build a heads-up notification with the correct PRINT / LATER action buttons.
 */

import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';

export interface CsvNotificationPayload {
  fcmToken: string;
  fileId: string;
  fileName: string;
  folderId: string;
}

/**
 * Send an FCM data message to the device when a new Winsoft CSV is detected.
 * The Android service constructs and shows the actual notification.
 */
export async function sendNewCsvNotification(
  payload: CsvNotificationPayload,
): Promise<void> {
  const { fcmToken, fileId, fileName, folderId } = payload;

  const message: admin.messaging.Message = {
    token: fcmToken,
    // Data-only message — handled in WinsoftFcmService.onMessageReceived().
    // Using data instead of notification so we control the display on Android.
    data: {
      type: 'NEW_WINSOFT_CSV',
      fileId,
      fileName,
      folderId,
      sentAt: String(Date.now()),
    },
    android: {
      priority: 'high',
      // TTL: 30 minutes — if the device is offline longer, the notification
      // is stale and should be ignored.
      ttl: 30 * 60 * 1000,
    },
  };

  try {
    const messageId = await admin.messaging().send(message);
    logger.info('FCM message sent', { messageId, fileId, fileName });
  } catch (err) {
    logger.error('FCM send failed', { err, fileId, fcmToken: fcmToken.slice(0, 8) + '…' });
    throw err;
  }
}
