package com.winsoftprintstation

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * NotificationActionReceiver — handles the [LATER] notification action.
 *
 * When the user taps LATER:
 *  1. The notification is dismissed.
 *  2. The fileId is added to the deferred set in SharedPreferences.
 *  3. No activity is launched (no notification trampoline).
 *
 * Deferred file IDs are read by ReconciliationWorker and emitted to
 * the React Native bridge via MonitoringEventBus.emitDeferredFilesReady().
 */
class NotificationActionReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != WinsoftFcmService.ACTION_LATER) return

        val fileId = intent.getStringExtra(WinsoftFcmService.EXTRA_FILE_ID) ?: return
        val folderId = intent.getStringExtra(WinsoftFcmService.EXTRA_FOLDER_ID) ?: ""
        val fileName = intent.getStringExtra(WinsoftFcmService.EXTRA_FILE_NAME) ?: ""

        // Dismiss the notification
        val notificationId = fileId.hashCode()
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.cancel(notificationId)

        // Persist deferred file ID (including fileName when available)
        val prefs = context.getSharedPreferences(WinsoftFcmService.PREFS_NAME, Context.MODE_PRIVATE)
        val existing = prefs.getStringSet("deferred_files", mutableSetOf()) ?: mutableSetOf()
        val entry = if (fileName.isNotBlank()) "$fileId::$folderId::$fileName" else "$fileId::$folderId"
        val updated = existing.toMutableSet().apply { add(entry) }
        prefs.edit().putStringSet("deferred_files", updated).apply()

        // Emit RN event if the bridge is alive
        MonitoringEventBus.emitLaterAction(fileId, folderId, fileName)
    }
}
