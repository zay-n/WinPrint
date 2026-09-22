/**
 * index.ts — Firebase Cloud Functions entry point
 *
 * Exposes three Cloud Functions:
 *
 * 1. registerDevice (HTTPS POST)
 *    Body: { fcmToken: string, folderId: string }
 *    - Validates the request.
 *    - Calls setupDriveWatch() to register a changes.watch channel.
 *    - Stores device registration + initial pageToken in Firestore.
 *    - Returns { serviceAccountEmail } so the client can display the
 *      sharing prompt ("Share your folder with: <email>").
 *
 * 2. driveWebhook (HTTPS POST)
 *    Called by Google Drive push notifications.
 *    - Validates X-Goog-Channel-Token to prevent spoofing.
 *    - Calls getNewCsvFiles() to diff the change feed.
 *    - Sends FCM notification for each newly detected CSV.
 *    - Updates pageToken in Firestore.
 *
 * 3. renewChannels (Scheduled — every 144 hours / 6 days)
 *    Drive watch channels expire after at most 7 days.
 *    - Iterates all device registrations in Firestore.
 *    - Calls setupDriveWatch() to renew each channel.
 *    - Updates channelId + pageToken in Firestore.
 *
 * SECURITY:
 *  - The user's Google OAuth access token is NEVER received, stored, or used.
 *  - The backend authenticates with Drive via its own service account.
 *  - Service account credentials are stored exclusively in Firebase Secret Manager.
 */

import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { v4 as uuidv4 } from 'uuid';
import { setupDriveWatch, getNewCsvFiles } from './driveWatcher';
import { sendNewCsvNotification } from './fcmSender';

// ---------------------------------------------------------------------------
// Secret — service account JSON stored in Firebase Secret Manager.
// Set via: firebase functions:secrets:set GOOGLE_SERVICE_ACCOUNT_JSON
// ---------------------------------------------------------------------------
const serviceAccountSecret = defineSecret('GOOGLE_SERVICE_ACCOUNT_JSON');

// ---------------------------------------------------------------------------
// Firestore document shape
// ---------------------------------------------------------------------------

interface DeviceRecord {
  fcmToken: string;
  folderId: string;
  channelId: string;
  channelToken: string;  // random token we verify on each webhook delivery
  pageToken: string;
  registeredAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
}

// ---------------------------------------------------------------------------
// App init (idempotent)
// ---------------------------------------------------------------------------

admin.initializeApp();
const db = admin.firestore();
const DEVICES_COLLECTION = 'winprint_devices';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deriveDeviceId(fcmToken: string): string {
  // Stable, non-sensitive ID derived from the FCM token.
  const encoded = Buffer.from(fcmToken).toString('base64');
  return `dev_${encoded.slice(0, 28).replace(/[/+=]/g, '_')}`;
}

function getWebhookUrl(request: { hostname: string; headers: Record<string, unknown> }): string {
  // On Cloud Functions v2 the function URL follows a predictable pattern.
  // We build it from the request host so we don't need to hard-code it.
  const host = request.hostname;
  return `https://${host}/drivewebhook`;
}

// ---------------------------------------------------------------------------
// 1. registerDevice
// ---------------------------------------------------------------------------

export const registerdevice = onRequest(
  { secrets: [serviceAccountSecret], cors: false },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const { fcmToken, folderId } = req.body as {
      fcmToken?: string;
      folderId?: string;
    };

    if (!fcmToken || typeof fcmToken !== 'string') {
      res.status(400).json({ error: 'Missing or invalid fcmToken' });
      return;
    }
    if (!folderId || typeof folderId !== 'string') {
      res.status(400).json({ error: 'Missing or invalid folderId' });
      return;
    }

    const serviceAccountJson = serviceAccountSecret.value();
    const serviceAccountEmail = (
      JSON.parse(serviceAccountJson) as { client_email: string }
    ).client_email;

    const webhookUrl = getWebhookUrl(req as unknown as Parameters<typeof getWebhookUrl>[0]);
    const channelToken = uuidv4();
    const deviceId = deriveDeviceId(fcmToken);

    try {
      const { channelId, pageToken } = await setupDriveWatch(
        folderId,
        webhookUrl,
        channelToken,
        serviceAccountJson,
      );

      const now = admin.firestore.FieldValue.serverTimestamp() as admin.firestore.Timestamp;
      await db.collection(DEVICES_COLLECTION).doc(deviceId).set({
        fcmToken,
        folderId,
        channelId,
        channelToken,
        pageToken,
        registeredAt: now,
        updatedAt: now,
      } satisfies Partial<DeviceRecord>);

      logger.info('Device registered', { deviceId, folderId, channelId });
      res.status(200).json({ success: true, deviceId, serviceAccountEmail });
    } catch (err) {
      logger.error('registerDevice error', err);
      res.status(500).json({ error: 'Registration failed. Check server logs.' });
    }
  },
);

// ---------------------------------------------------------------------------
// 2. driveWebhook
// ---------------------------------------------------------------------------

export const drivewebhook = onRequest(
  { secrets: [serviceAccountSecret] },
  async (req, res) => {
    // Google Drive always sends POST. Respond quickly.
    res.status(200).send('ok');

    const channelId = req.headers['x-goog-channel-id'] as string | undefined;
    const channelToken = req.headers['x-goog-channel-token'] as string | undefined;
    const resourceState = req.headers['x-goog-resource-state'] as string | undefined;

    // Initial sync message — no action needed.
    if (resourceState === 'sync') return;

    if (!channelId || !channelToken) {
      logger.warn('driveWebhook: missing channel headers');
      return;
    }

    try {
      const snap = await db
        .collection(DEVICES_COLLECTION)
        .where('channelId', '==', channelId)
        .limit(1)
        .get();

      if (snap.empty) {
        logger.warn('driveWebhook: unknown channelId', { channelId });
        return;
      }

      const docRef = snap.docs[0].ref;
      const device = snap.docs[0].data() as DeviceRecord;

      // Verify the channel token to prevent spoofing.
      if (device.channelToken !== channelToken) {
        logger.warn('driveWebhook: channel token mismatch', { channelId });
        return;
      }

      const serviceAccountJson = serviceAccountSecret.value();
      const { newFiles, nextPageToken } = await getNewCsvFiles(
        device.folderId,
        device.pageToken,
        serviceAccountJson,
      );

      // Persist updated pageToken immediately to avoid re-processing on the
      // next webhook delivery even if FCM fails.
      await docRef.update({
        pageToken: nextPageToken,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      for (const file of newFiles) {
        await sendNewCsvNotification({
          fcmToken: device.fcmToken,
          fileId: file.id,
          fileName: file.name,
          folderId: device.folderId,
        });
      }

      if (newFiles.length > 0) {
        logger.info('driveWebhook: sent notifications', {
          count: newFiles.length,
          files: newFiles.map(f => f.name),
        });
      }
    } catch (err) {
      logger.error('driveWebhook processing error', err);
    }
  },
);

// ---------------------------------------------------------------------------
// 3. renewChannels (scheduled — every 6 days)
// ---------------------------------------------------------------------------

export const renewchannels = onSchedule(
  {
    schedule: 'every 144 hours',
    secrets: [serviceAccountSecret],
  },
  async () => {
    logger.info('renewChannels: starting channel renewal');
    const serviceAccountJson = serviceAccountSecret.value();
    const serviceAccountEmail = (
      JSON.parse(serviceAccountJson) as { client_email: string }
    ).client_email;

    // Derive webhook URL from the project — Cloud Functions v2 URL pattern.
    const projectId = process.env.GCLOUD_PROJECT ?? '';
    const region = process.env.FUNCTION_REGION ?? 'us-central1';
    const webhookUrl = `https://${region}-${projectId}.cloudfunctions.net/drivewebhook`;

    const snap = await db.collection(DEVICES_COLLECTION).get();
    let renewed = 0;
    let failed = 0;

    for (const doc of snap.docs) {
      const device = doc.data() as DeviceRecord;
      try {
        const { channelId, pageToken } = await setupDriveWatch(
          device.folderId,
          webhookUrl,
          device.channelToken,
          serviceAccountJson,
        );
        await doc.ref.update({
          channelId,
          pageToken,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        renewed++;
      } catch (err) {
        logger.error('renewChannels: failed for device', { deviceId: doc.id, err });
        failed++;
      }
    }

    logger.info('renewChannels: complete', { renewed, failed, serviceAccountEmail });
  },
);
