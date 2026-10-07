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
  uid?: string;
  userEmail?: string;
  businessId?: string;
  deviceId?: string;
  platform?: string;
  appVersion?: string;
  fcmToken: string;
  folderId: string;
  folderName?: string;
  channelId: string;
  resourceId: string;
  pageToken: string;
  expiration: number; // Unix ms
  monitoringStatus?: string;
  monitoringEnabled?: boolean;
  disabled?: boolean;
  lastMonitoringEvent?: string;
  lastSeenAt?: admin.firestore.FieldValue | admin.firestore.Timestamp;
  registeredAt?: admin.firestore.FieldValue | admin.firestore.Timestamp;
  updatedAt?: admin.firestore.FieldValue | admin.firestore.Timestamp;
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
    `${DRIVE_BASE}/changes/startPageToken?supportsAllDrives=true`,
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
    `${DRIVE_BASE}/changes/watch?pageToken=${pageToken}&supportsAllDrives=true&includeItemsFromAllDrives=true`,
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
    `&fields=${fields}&includeRemoved=false&supportsAllDrives=true&includeItemsFromAllDrives=true`;
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

    const {
      fcmToken,
      folderId,
      folderName,
      uid,
      userEmail,
      businessId,
      platform,
      appVersion,
      deviceId,
      forceRefresh,
    } = req.body as {
      fcmToken?: string;
      folderId?: string;
      folderName?: string;
      uid?: string;
      userEmail?: string;
      businessId?: string;
      platform?: string;
      appVersion?: string;
      deviceId?: string;
      forceRefresh?: boolean;
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

      // Verify folder exists and service account has access to it
      const folderCheckResp = await fetch(
        `${DRIVE_BASE}/files/${encodeURIComponent(folderId)}?supportsAllDrives=true&fields=id,name,mimeType,trashed`,
        {headers: {Authorization: auth}},
      );

      if (folderCheckResp.status === 404 || folderCheckResp.status === 403) {
        logger.warn("[RegisterDevice] Folder not accessible by service account", {
          folderId,
          serviceAccountEmail: sa.client_email,
        });
        res.status(403).json({
          error: "FOLDER_NOT_SHARED",
          serviceAccountEmail: sa.client_email,
          message: `Incoming folder is not accessible by the monitoring account (${sa.client_email}). Please share the folder with this email as Viewer.`,
        });
        return;
      }

      if (!folderCheckResp.ok) {
        const errText = await folderCheckResp.text();
        logger.error("[RegisterDevice] Folder check failed", {status: folderCheckResp.status, errText});
        res.status(folderCheckResp.status).json({
          error: "DRIVE_API_ERROR",
          message: `Google Drive API error checking folder: ${folderCheckResp.statusText}`,
        });
        return;
      }

      const folderInfo = (await folderCheckResp.json()) as {
        id: string;
        name?: string;
        mimeType?: string;
        trashed?: boolean;
      };

      if (folderInfo.trashed) {
        res.status(400).json({
          error: "FOLDER_TRASHED",
          message: "The configured Incoming folder is in Google Drive trash.",
        });
        return;
      }

      // Webhook URL: project-specific, not derived from request host.
      const projectId = process.env.GCLOUD_PROJECT ?? "winprint-8a644";
      const webhookUrl =
        `https://asia-southeast1-${projectId}.cloudfunctions.net/drivewebhook`;

      // Determine document reference: prefer stable UID if provided
      let deviceDocRef: FirebaseFirestore.DocumentReference;
      let existingData: DeviceRecord | null = null;

      if (uid) {
        deviceDocRef = db.collection("devices").doc(uid);
        const docSnap = await deviceDocRef.get();
        if (docSnap.exists) {
          existingData = docSnap.data() as DeviceRecord;
        }
      } else {
        const byToken = await db
          .collection("devices")
          .where("fcmToken", "==", fcmToken)
          .limit(1)
          .get();
        if (!byToken.empty) {
          deviceDocRef = byToken.docs[0].ref;
          existingData = byToken.docs[0].data() as DeviceRecord;
        } else {
          deviceDocRef = db.collection("devices").doc();
        }
      }

      // If existing channel is active (> 2 hours remaining), same folder, and not forceRefresh:
      if (
        !forceRefresh &&
        existingData &&
        existingData.folderId === folderId &&
        existingData.channelId &&
        existingData.expiration - Date.now() > 2 * 60 * 60 * 1000
      ) {
        await deviceDocRef.set({
          fcmToken,
          folderId,
          folderName: folderInfo.name || folderName || existingData.folderName || "",
          uid: uid || existingData.uid || "",
          userEmail: userEmail || existingData.userEmail || "",
          businessId: businessId || existingData.businessId || "",
          deviceId: deviceId || existingData.deviceId || "",
          platform: platform || existingData.platform || "android",
          appVersion: appVersion || existingData.appVersion || "1.0.0",
          monitoringStatus: "connected",
          monitoringEnabled: true,
          lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, {merge: true});

        logger.info("[RegisterDevice] Existing active watch preserved", {
          folderId,
          channelId: existingData.channelId,
        });

        res.status(200).json({
          ok: true,
          serviceAccountEmail: sa.client_email,
          channelId: existingData.channelId,
          expiration: existingData.expiration,
          status: "connected",
        });
        return;
      }

      // Stop old channel if changing folder, expired, or forceRefresh
      if (existingData?.channelId && existingData?.resourceId) {
        try {
          await driveStopChannel(auth, existingData.channelId, existingData.resourceId);
          logger.info("[RegisterDevice] Stopped previous watch channel", {
            channelId: existingData.channelId,
          });
        } catch (e) {
          logger.warn("[RegisterDevice] Could not stop previous channel", {error: String(e)});
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

      // Upsert full device record
      await deviceDocRef.set({
        fcmToken,
        folderId,
        folderName: folderInfo.name || folderName || "",
        uid: uid || "",
        userEmail: userEmail || "",
        businessId: businessId || "",
        deviceId: deviceId || "",
        platform: platform || "android",
        appVersion: appVersion || "1.0.0",
        channelId,
        resourceId,
        pageToken,
        expiration,
        monitoringStatus: "connected",
        monitoringEnabled: true,
        disabled: false,
        registeredAt: admin.firestore.FieldValue.serverTimestamp(),
        lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, {merge: true});

      logger.info("[RegisterDevice] Device registered with fresh watch", {
        folderId,
        channelId,
        docId: deviceDocRef.id,
      });

      res.status(200).json({
        ok: true,
        serviceAccountEmail: sa.client_email,
        channelId,
        expiration,
        status: "connected",
      });
    } catch (e) {
      const msg = String(e);
      logger.error("[RegisterDevice] Registration failed", {error: msg});
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
      logger.warn("[DriveWebhook] No device for channelId", {
        channelId: channelId ? `${channelId.slice(0, 8)}...` : "none",
      });
      res.status(200).end(); // Acknowledge to prevent retries
      return;
    }

    const docRef = snap.docs[0].ref;
    const device = snap.docs[0].data() as DeviceRecord;

    // Check if device monitoring has been revoked by admin
    if (device.disabled === true) {
      logger.info("[DriveWebhook] Device is disabled by admin, skipping push", {
        uid: device.uid,
      });
      res.status(200).end();
      return;
    }

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
        if (change.removed) continue;
        let file = change.file;

        // Fallback: If delta entry lacks complete file or parents, fetch metadata
        if (!file || !file.parents) {
          try {
            const metaResp = await fetch(
              `${DRIVE_BASE}/files/${change.fileId}?supportsAllDrives=true&fields=id,name,parents,mimeType,trashed`,
              {headers: {Authorization: auth}},
            );
            if (metaResp.ok) {
              file = (await metaResp.json()) as typeof change.file;
            }
          } catch (e) {
            logger.warn("[DriveWebhook] Fallback metadata check failed", {
              fileId: change.fileId,
              error: String(e),
            });
          }
        }

        if (!file) continue;

        // Only care about CSVs in the registered Incoming folder
        const isInFolder = file.parents?.includes(device.folderId);
        const isCsv =
          file.mimeType === "text/csv" ||
          file.mimeType === "text/plain" ||
          file.mimeType === "application/vnd.ms-excel" ||
          (file.name ?? "").toLowerCase().endsWith(".csv");

        if (isInFolder && isCsv && !file.trashed) {
          newCsvFiles.push({id: change.fileId, name: file.name ?? "Winsoft Bill"});
        }
      }

      if (changes.nextPageToken) {
        pageToken = changes.nextPageToken;
      } else {
        pageToken = changes.newStartPageToken ?? pageToken;
        hasMore = false;
      }
    }

    // Save the advanced page token and update device status
    await docRef.update({
      pageToken,
      lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(newCsvFiles.length > 0
        ? {lastMonitoringEvent: `CSV: ${newCsvFiles[0].name} (${new Date().toLocaleTimeString()})`}
        : {}),
    });

    // Send FCM notifications for each new CSV
    for (const file of newCsvFiles) {
      try {
        await sendFcmNotification(
          device.fcmToken,
          file.id,
          file.name,
          device.folderId,
        );
        logger.info("[DriveWebhook] FCM notification dispatched", {
          fileId: file.id,
          fileName: file.name,
          tokenSuffix: device.fcmToken ? `...${device.fcmToken.slice(-6)}` : "none",
        });
      } catch (e) {
        logger.error("[DriveWebhook] FCM send failed", {
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

