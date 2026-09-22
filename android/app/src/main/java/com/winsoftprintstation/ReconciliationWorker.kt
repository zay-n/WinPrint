package com.winsoftprintstation

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * ReconciliationWorker — periodic WorkManager fallback for missed FCM notifications.
 *
 * Scheduled by MonitoringModule.scheduleReconciliation() as a PeriodicWorkRequest
 * with a 15-minute interval.
 *
 * Behaviour:
 *  - If the React Native bridge is alive (app in background):
 *      Emits 'onReconciliationRequested' via MonitoringEventBus.
 *      MonitoringService.runReconciliation() in RN handles the Drive listing
 *      and enqueuing using the user's current accessToken from the Zustand store.
 *
 *  - If the React Native bridge is NOT alive (app fully dead):
 *      WorkManager cannot safely wake up the RN runtime.
 *      The worker logs the attempt and returns Result.success() so WorkManager
 *      does not mark it as failed and back off.
 *      The NEXT scheduled interval will retry (FCM is the primary delivery path).
 *
 * IMPORTANT: This worker does NOT print automatically and does NOT
 * read Zustand state or AsyncStorage directly.
 *
 * Also emits deferred file IDs (from SharedPreferences, written by
 * NotificationActionReceiver when the user tapped LATER) so the RN
 * MonitoringService can process them on next reconciliation.
 */
class ReconciliationWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val bridgeAlive = MonitoringEventBus.isBridgeAlive()

        if (!bridgeAlive) {
            // Cannot reliably dispatch to RN from a fully dead process.
            // FCM is the primary near-real-time path.
            // Return success so WorkManager keeps the periodic schedule.
            return@withContext Result.success()
        }

        // Emit reconciliation request — MonitoringService in RN handles it.
        MonitoringEventBus.emitReconciliationRequested()

        // Also forward any deferred files (from LATER actions) to RN.
        val prefs = applicationContext.getSharedPreferences(
            WinsoftFcmService.PREFS_NAME,
            Context.MODE_PRIVATE,
        )
        val deferred = prefs.getStringSet("deferred_files", emptySet()) ?: emptySet()
        if (deferred.isNotEmpty()) {
            MonitoringEventBus.emitDeferredFilesReady(deferred.toList())
            // Clear after handing off to RN — if RN fails, MonitoringService
            // is responsible for re-persisting via store.addDeferredFileId().
            prefs.edit().remove("deferred_files").apply()
        }

        Result.success()
    }
}
