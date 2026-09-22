package com.winsoftprintstation

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * WinsoftFcmService — Firebase Cloud Messaging service
 *
 * Lifecycle:
 *  - onNewToken: called when the FCM registration token is refreshed.
 *    Saves the token to SharedPreferences so MonitoringModule can read it,
 *    and emits an RN event if the bridge is alive.
 *
 *  - onMessageReceived: called for every incoming FCM data message.
 *    Validates the payload, creates the WINSOFT_BILLS notification channel
 *    (IMPORTANCE_HIGH for heads-up display), and posts a notification with
 *    two actions:
 *      [PRINT]  — PendingIntent.getActivity targeting MainActivity with
 *                 ACTION_PRINT deep-link. Works even when the app is dead.
 *      [LATER]  — PendingIntent.getBroadcast targeting NotificationActionReceiver.
 *
 *  No setFullScreenIntent is used. Heads-up behaviour is achieved via
 *  IMPORTANCE_HIGH on the notification channel.
 */
class WinsoftFcmService : FirebaseMessagingService() {

    companion object {
        const val CHANNEL_ID = "WINSOFT_BILLS"
        const val CHANNEL_NAME = "Winsoft Bills"
        const val PREF_FCM_TOKEN = "winprint_fcm_token"
        const val PREFS_NAME = "winprint_monitoring"
        const val ACTION_LATER = "com.winsoftprintstation.ACTION_LATER"
        const val EXTRA_FILE_ID = "fileId"
        const val EXTRA_FILE_NAME = "fileName"
        const val EXTRA_FOLDER_ID = "folderId"
        // Notification IDs are based on the fileId hashCode so each file
        // gets a unique notification that can be individually dismissed.
        private fun notificationId(fileId: String) = fileId.hashCode()
    }

    // -------------------------------------------------------------------------
    // Token refresh
    // -------------------------------------------------------------------------

    override fun onNewToken(token: String) {
        super.onNewToken(token)

        // Persist for MonitoringModule.getFcmToken()
        getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(PREF_FCM_TOKEN, token)
            .apply()

        // Emit RN event if the bridge is alive
        MonitoringEventBus.emitFcmTokenRefresh(token)
    }

    // -------------------------------------------------------------------------
    // Message received
    // -------------------------------------------------------------------------

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)

        val data = message.data
        if (data["type"] != "NEW_WINSOFT_CSV") return

        val fileId = data[EXTRA_FILE_ID]?.takeIf { it.isNotBlank() } ?: return
        val fileName = data[EXTRA_FILE_NAME]?.takeIf { it.isNotBlank() } ?: "Winsoft Bill"
        val folderId = data[EXTRA_FOLDER_ID]?.takeIf { it.isNotBlank() } ?: return

        ensureNotificationChannel()
        postBillNotification(fileId, fileName, folderId)
    }

    // -------------------------------------------------------------------------
    // Notification channel (created once; idempotent)
    // -------------------------------------------------------------------------

    private fun ensureNotificationChannel() {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return

        val channel = NotificationChannel(
            CHANNEL_ID,
            CHANNEL_NAME,
            // IMPORTANCE_HIGH causes the heads-up notification to appear on
            // screen without using setFullScreenIntent.
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "New Winsoft billing CSVs detected in Google Drive"
            enableVibration(true)
        }
        manager.createNotificationChannel(channel)
    }

    // -------------------------------------------------------------------------
    // Notification construction
    // -------------------------------------------------------------------------

    private fun postBillNotification(fileId: String, fileName: String, folderId: String) {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        // ── PRINT action ──────────────────────────────────────────────────────
        // Direct Activity launch — avoids notification trampoline anti-pattern.
        // Works when the app is in any state (foreground, background, dead).
        val printUri = Uri.parse(
            "winprint://print" +
            "?fileId=${Uri.encode(fileId)}" +
            "&folderId=${Uri.encode(folderId)}" +
            "&fileName=${Uri.encode(fileName)}"
        )
        val printIntent = Intent(this, MainActivity::class.java).apply {
            action = "com.winsoftprintstation.ACTION_PRINT"
            data = printUri
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val printPendingIntent = PendingIntent.getActivity(
            this,
            notificationId(fileId),
            printIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        // ── LATER action ──────────────────────────────────────────────────────
        val laterIntent = Intent(this, NotificationActionReceiver::class.java).apply {
            action = ACTION_LATER
            putExtra(EXTRA_FILE_ID, fileId)
            putExtra(EXTRA_FOLDER_ID, folderId)
        }
        val laterPendingIntent = PendingIntent.getBroadcast(
            this,
            // Use a different request code to avoid PendingIntent collision with PRINT.
            notificationId(fileId) + 10_000,
            laterIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        // ── Notification ──────────────────────────────────────────────────────
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("New Winsoft bill ready")
            .setContentText(fileName)
            .setStyle(NotificationCompat.BigTextStyle().bigText(
                "A new bill has been exported to Google Drive.\nFile: $fileName"
            ))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            // PRINT action launches the app and processes the file.
            .addAction(0, "PRINT", printPendingIntent)
            // LATER dismisses the notification and records the deferral.
            .addAction(0, "LATER", laterPendingIntent)
            .build()

        manager.notify(notificationId(fileId), notification)
    }
}
