/**
 * Winsoft Print Station — Firebase Cloud Functions
 *
 * Endpoints
 * ─────────
 * POST /registerdevice
 *   Body: { fcmToken: string, folderId: string }
 *   Registers an Android device for Drive push notifications.
 *   Stores state in Firestore, registers a Drive changes.watch channel,
 *   and returns the service-account email so the Android UI can display it.
 *
 * POST /drivewebhook
 *   Receives Drive push notifications (changes.watch callbacks).
 *   Validates channel headers, lists changes, identifies new CSV files in
 *   the registered folder, and sends FCM notifications to the device.
 *
 * Scheduled: renewchannels (every 20 hours)
 *   Renews Drive watch channels that are about to expire (< 24 h remaining).
 *
 * Security
 * ────────
 * - The user's Google OAuth token NEVER leaves the Android device.
 * - The backend uses its own service account (loaded from Secret Manager).
 * - Drive access is granted by the user sharing their Incoming folder
 *   with the service-account email.
 */

import * as logger from "firebase-functions/logger";
import {setGlobalOptions} from "firebase-functions";
import {onRequest} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {defineSecret} from "firebase-functions/params";
import * as admin from "firebase-admin";
import {v4 as uuidv4} from "uuid";
import {JWT} from "google-auth-library";

// ─── Global options ──────────────────────────────────────────────────────────

setGlobalOptions({maxInstances: 10, region: "asia-southeast1"});

// ─── Secrets ─────────────────────────────────────────────────────────────────

const serviceAccountSecret = defineSecret("GOOGLE_SERVICE_ACCOUNT_JSON");

// ─── Firebase Admin ──────────────────────────────────────────────────────────

admin.initializeApp();
const db = admin.firestore();

// ─── Types ───────────────────────────────────────────────────────────────────

interface DeviceRecord {
  fcmToken: string;
  folderId: string;
  channelId: string;
  resourceId: string;
  pageToken: string;
  expiration: number; // Unix ms
  registeredAt: admin.firestore.Timestamp;
}

interface ServiceAccount {
  client_email: string;
  private_key: string;
  [key: string]: unknown;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Parses the service-account JSON secret string.
 * @param {string} secret - JSON string from Secret Manager.
 * @return {ServiceAccount} Parsed service account object.
 */
function parseServiceAccount(secret: string): ServiceAccount {
  return JSON.parse(secret) as ServiceAccount;
}

/**
 * Returns an authenticated JWT client for the Drive API,
 * scoped to readonly Drive access.
 * @param {ServiceAccount} sa - Parsed service account credentials.
 * @return {JWT} Authenticated JWT client.
 */
function getDriveClient(sa: ServiceAccount): JWT {
  return new JWT({
    email: sa.client_email,
    key: sa.private_key,
    // changes/startPageToken and changes.watch require drive (full) scope.
    // drive.readonly is insufficient for registering watch channels.
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
}

/**
 * Returns an Authorization header value for a JWT client.
 * @param {JWT} client - Authenticated JWT client.
 * @return {Promise<string>} Bearer token header value.
 */
async function authHeader(client: JWT): Promise<string> {
  const token = await client.getAccessToken();
  return `Bearer ${token.token}`;
}

// ─── Drive API wrappers ──────────────────────────────────────────────────────

const DRIVE_BASE = "https://www.googleapis.com/drive/v3";

/**
 * Retrieves a Drive changes start page token.
 * @param {string} auth - Bearer token Authorization header.
 * @return {Promise<string>} The start page token.
 */
async function driveGetStartPageToken(
  auth: string,
): Promise<string> {
  const resp = await fetch(
    `${DRIVE_BASE}/changes/startPageToken`,
    {headers: {Authorization: auth}},
  );
  if (!resp.ok) {
    const body = await resp.text();
    logger.error("startPageToken failed", {status: resp.status, body});
    throw new Error(`startPageToken failed: ${resp.status}`);
  }
  const json = (await resp.json()) as {startPageToken: string};
  return json.startPageToken;
}

/**
 * Registers a Drive changes.watch push channel.
 * @param {string} auth - Bearer token Authorization header.
 * @param {string} pageToken - Drive changes start page token.
 * @param {string} channelId - Unique channel UUID.
 * @param {string} webhookUrl - HTTPS URL for Drive push callbacks.
 * @param {number} ttlMs - Channel TTL in milliseconds (default 24 h).
 * @return {Promise<{resourceId: string, expiration: number}>} Channel info.
 */
async function driveWatchChanges(
  auth: string,
  pageToken: string,
  channelId: string,
  webhookUrl: string,
  ttlMs = 24 * 60 * 60 * 1000, // 24 hours
): Promise<{resourceId: string; expiration: number}> {
  const body = {
    id: channelId,
    type: "web_hook",
    address: webhookUrl,
    expiration: String(Date.now() + ttlMs),
  };
  const resp = await fetch(
    `${DRIVE_BASE}/changes/watch?pageToken=${pageToken}`,
    {
      method: "POST",
      headers: {
        "Authorization": auth,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`changes.watch failed (${resp.status}): ${txt}`);
  }
  const json = (await resp.json()) as {
    resourceId: string;
    expiration: string;
  };
  return {
    resourceId: json.resourceId,
    expiration: Number(json.expiration),
  };
}

/** Drive change entry shape returned by changes.list. */
interface DriveChange {
  fileId: string;
  removed?: boolean;
  file?: {
    name: string;
    parents?: string[];
    mimeType?: string;
    trashed?: boolean;
  };
}

/** Response shape for changes.list. */
interface ChangesListResponse {
  changes: DriveChange[];
  newStartPageToken?: string;
  nextPageToken?: string;
}

/**
 * Lists Drive file changes since the given page token.
 * @param {string} auth - Bearer token Authorization header.
 * @param {string} pageToken - Drive changes page token.
 * @return {Promise<ChangesListResponse>} Paginated changes response.
 */
async function driveListChanges(
  auth: string,
  pageToken: string,
): Promise<ChangesListResponse> {
  // eslint-disable-next-line max-len
  const fields = "changes(fileId,file(name,parents,mimeType,trashed)),nextPageToken,newStartPageToken";
  const url =
    `${DRIVE_BASE}/changes?pageToken=${pageToken}` +
    `&fields=${fields}&includeRemoved=false`;
  const resp = await fetch(url, {headers: {Authorization: auth}});
  if (!resp.ok) throw new Error(`changes.list failed: ${resp.status}`);
  return resp.json() as Promise<ChangesListResponse>;
}

/**
 * Stops a Drive push notification channel (best-effort).
 * @param {string} auth - Bearer token Authorization header.
 * @param {string} channelId - Channel ID to stop.
 * @param {string} resourceId - Resource ID associated with the channel.
 * @return {Promise<void>}
 */
async function driveStopChannel(
  auth: string,
  channelId: string,
  resourceId: string,
): Promise<void> {
  await fetch(`${DRIVE_BASE}/channels/stop`, {
    method: "POST",
    headers: {
      "Authorization": auth,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({id: channelId, resourceId}),
  });
  // Ignore errors — channel may already be expired
}

// ─── FCM ─────────────────────────────────────────────────────────────────────

/**
 * Sends an FCM data message to the Android device.
 * @param {string} fcmToken - FCM registration token.
 * @param {string} fileId - Drive file ID of the new CSV.
 * @param {string} fileName - Display name of the CSV file.
 * @param {string} folderId - Drive folder ID (Incoming).
 * @return {Promise<void>}
 */
async function sendFcmNotification(
  fcmToken: string,
  fileId: string,
  fileName: string,
  folderId: string,
): Promise<void> {
  await admin.messaging().send({
    token: fcmToken,
    data: {
      type: "NEW_WINSOFT_CSV",
      fileId,
      fileName,
      folderId,
    },
    android: {
      priority: "high",
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION: registerDevice
// POST /registerdevice
// ─────────────────────────────────────────────────────────────────────────────

export const registerdevice = onRequest(
  {
    secrets: [serviceAccountSecret],
    cors: false,
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({error: "Method not allowed"});
      return;
    }

    const {fcmToken, folderId} = req.body as {
      fcmToken?: string;
      folderId?: string;
    };

    if (!fcmToken || !folderId) {
      res.status(400).json({error: "fcmToken and folderId are required"});
      return;
    }

    try {
      const saJson = serviceAccountSecret.value();
      const sa = parseServiceAccount(saJson);
      const client = getDriveClient(sa);
      const auth = await authHeader(client);

      // Webhook URL: project-specific, not derived from request host.
      const projectId = process.env.GCLOUD_PROJECT ?? "winprint-8a644";
      const webhookUrl =
        `https://asia-southeast1-${projectId}.cloudfunctions.net/drivewebhook`;

      // Check if a device is already registered for this folder
      const existing = await db
        .collection("devices")
        .where("folderId", "==", folderId)
        .where("fcmToken", "==", fcmToken)
        .limit(1)
        .get();

      if (!existing.empty) {
        const doc = existing.docs[0];
        const data = doc.data() as DeviceRecord;
        // If existing channel still has > 1 hour remaining, reuse it
        if (data.expiration - Date.now() > 60 * 60 * 1000) {
          res.status(200).json({
            ok: true, serviceAccountEmail: sa.client_email,
          });
          return;
        }
        // Stop the old channel (best effort) and re-register
        try {
          await driveStopChannel(auth, data.channelId, data.resourceId);
        } catch (e) {
          logger.warn("Could not stop old channel", {error: String(e)});
        }
      }

      // Get a fresh page token
      const pageToken = await driveGetStartPageToken(auth);

      // Register a new watch channel
      const channelId = uuidv4();
      const {resourceId, expiration} = await driveWatchChanges(
        auth,
        pageToken,
        channelId,
        webhookUrl,
      );

      // Upsert device record
      const deviceRef = existing.empty ?
        db.collection("devices").doc() :
        existing.docs[0].ref;

      await deviceRef.set({
        fcmToken,
        folderId,
        channelId,
        resourceId,
        pageToken,
        expiration,
        registeredAt: admin.firestore.FieldValue.serverTimestamp(),
      } as Partial<DeviceRecord>);

      logger.info("Device registered", {folderId, channelId});
      res.status(200).json({ok: true, serviceAccountEmail: sa.client_email});
    } catch (e) {
      const msg = String(e);
      logger.error("registerdevice failed", {error: msg});
      res.status(500).json({error: msg});
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION: driveWebhook
// POST /drivewebhook  (Drive push notification callback)
// ─────────────────────────────────────────────────────────────────────────────

export const drivewebhook = onRequest(
  {
    secrets: [serviceAccountSecret],
    cors: false,
  },
  async (req, res) => {
    // Drive sends HEAD on channel setup — acknowledge and exit.
    if (req.method === "HEAD") {
      res.status(200).end();
      return;
    }
    if (req.method !== "POST") {
      res.status(405).end();
      return;
    }

    // Validate Drive push notification headers
    const channelId = req.headers["x-goog-channel-id"] as string | undefined;
    const resourceState = req.headers["x-goog-resource-state"] as
      | string
      | undefined;

    if (!channelId || resourceState === "sync") {
      // sync is the initial confirmation ping — acknowledge and ignore.
      res.status(200).end();
      return;
    }

    // Find the device/channel record
    const snap = await db
      .collection("devices")
      .where("channelId", "==", channelId)
      .limit(1)
      .get();

    if (snap.empty) {
      logger.warn("No device for channelId", {channelId});
      res.status(200).end(); // Acknowledge to prevent retries
      return;
    }

    const docRef = snap.docs[0].ref;
    const device = snap.docs[0].data() as DeviceRecord;

    // Fetch Drive changes using the service account
    const saJson = serviceAccountSecret.value();
    const sa = parseServiceAccount(saJson);
    const client = getDriveClient(sa);
    const auth = await authHeader(client);

    let pageToken = device.pageToken;
    const newCsvFiles: Array<{ id: string; name: string }> = [];

    // Paginate through changes
    let hasMore = true;
    while (hasMore) {
      const changes = await driveListChanges(auth, pageToken);

      for (const change of changes.changes ?? []) {
        if (change.removed || !change.file) continue;
        const {file} = change;

        // Only care about CSVs in the registered Incoming folder
        const isInFolder = file.parents?.includes(device.folderId);
        const isCsv =
          file.mimeType === "text/csv" ||
          file.mimeType === "text/plain" ||
          (file.name ?? "").toLowerCase().endsWith(".csv");

        if (isInFolder && isCsv && !file.trashed) {
          newCsvFiles.push({id: change.fileId, name: file.name ?? ""});
        }
      }

      if (changes.nextPageToken) {
        pageToken = changes.nextPageToken;
      } else {
        pageToken = changes.newStartPageToken ?? pageToken;
        hasMore = false;
      }
    }

    // Save the advanced page token
    await docRef.update({pageToken});

    // Send FCM notifications for each new CSV
    for (const file of newCsvFiles) {
      try {
        await sendFcmNotification(
          device.fcmToken,
          file.id,
          file.name,
          device.folderId,
        );
        logger.info("FCM sent", {fileId: file.id, fileName: file.name});
      } catch (e) {
        logger.error("FCM send failed", {
          fileId: file.id,
          error: String(e),
        });
      }
    }

    res.status(200).end();
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION: renewChannels
// Scheduled: every 20 hours
// Renews Drive watch channels expiring within 24 hours.
// ─────────────────────────────────────────────────────────────────────────────

export const renewchannels = onSchedule(
  {
    schedule: "every 20 hours",
    secrets: [serviceAccountSecret],
    region: "asia-southeast1",
  },
  async () => {
    const expiryThreshold = Date.now() + 24 * 60 * 60 * 1000; // 24 h from now
    const snap = await db
      .collection("devices")
      .where("expiration", "<", expiryThreshold)
      .get();

    if (snap.empty) {
      logger.info("renewChannels: nothing to renew");
      return;
    }

    const saJson = serviceAccountSecret.value();
    const sa = parseServiceAccount(saJson);
    const client = getDriveClient(sa);
    const auth = await authHeader(client);

    // Build the webhook URL from the Cloud Functions project ID.
    const projectId = process.env.GCLOUD_PROJECT ?? "";
    // eslint-disable-next-line max-len
    const webhookUrl = `https://asia-southeast1-${projectId}.cloudfunctions.net/drivewebhook`;

    for (const doc of snap.docs) {
      const device = doc.data() as DeviceRecord;
      try {
        // Stop old channel
        await driveStopChannel(auth, device.channelId, device.resourceId);

        // Get a fresh page token
        const pageToken = await driveGetStartPageToken(auth);

        // Register a new watch channel
        const channelId = uuidv4();
        const {resourceId, expiration} = await driveWatchChanges(
          auth,
          pageToken,
          channelId,
          webhookUrl,
        );

        await doc.ref.update({channelId, resourceId, pageToken, expiration});
        logger.info("Channel renewed", {folderId: device.folderId, channelId});
      } catch (e) {
        logger.error("Channel renewal failed", {
          folderId: device.folderId,
          error: String(e),
        });
      }
    }
  },
);

