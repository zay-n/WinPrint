package com.winsoftprintstation

import android.Manifest
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.ActivityCompat
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.firebase.messaging.FirebaseMessaging
import java.util.concurrent.TimeUnit

/**
 * MonitoringModule — React Native NativeModule for push monitoring.
 *
 * Exposed to JS as NativeModules.WinsoftMonitoring.
 *
 * Responsibilities:
 *  - Provide FCM token to JS (from SharedPreferences, written by WinsoftFcmService).
 *  - Request POST_NOTIFICATIONS permission on Android 13+.
 *  - Register / cancel WorkManager periodic reconciliation job.
 *  - Return the initial PRINT intent data if the app was launched via ACTION_PRINT.
 *  - Register MonitoringEventBus so native events reach the RN bridge.
 *
 * This module does NOT call the backend directly. The JS MonitoringService
 * is responsible for all backend HTTP calls.
 */
class MonitoringModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val MODULE_NAME = "WinsoftMonitoring"
        const val WORK_TAG = "winprint_reconciliation"
        const val RECONCILE_INTERVAL_MINUTES = 15L
    }

    override fun getName() = MODULE_NAME

    // ── Bridge lifecycle ──────────────────────────────────────────────────────

    override fun initialize() {
        super.initialize()
        val emitter = reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        MonitoringEventBus.register(emitter)
    }

    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        MonitoringEventBus.unregister()
    }

    // Required for NativeEventEmitter on the JS side.
    @ReactMethod fun addListener(@Suppress("UNUSED_PARAMETER") eventName: String) {}
    @ReactMethod fun removeListeners(@Suppress("UNUSED_PARAMETER") count: Int) {}

    // ── FCM token ─────────────────────────────────────────────────────────────

    /**
     * Returns the FCM token stored by WinsoftFcmService.onNewToken().
     * If no token is cached, requests a fresh one from Firebase.
     */
    @ReactMethod
    fun getFcmToken(promise: Promise) {
        val cached = reactContext
            .getSharedPreferences(WinsoftFcmService.PREFS_NAME, Context.MODE_PRIVATE)
            .getString(WinsoftFcmService.PREF_FCM_TOKEN, null)

        if (cached != null) {
            promise.resolve(cached)
            return
        }

        // Request a fresh token — this is asynchronous.
        FirebaseMessaging.getInstance().token
            .addOnSuccessListener { token ->
                reactContext
                    .getSharedPreferences(WinsoftFcmService.PREFS_NAME, Context.MODE_PRIVATE)
                    .edit()
                    .putString(WinsoftFcmService.PREF_FCM_TOKEN, token)
                    .apply()
                promise.resolve(token)
            }
            .addOnFailureListener { e ->
                promise.reject("FCM_TOKEN_ERROR", e.message ?: "Failed to get FCM token", e)
            }
    }

    // ── Notification permission ───────────────────────────────────────────────

    @ReactMethod
    fun getNotificationPermissionStatus(promise: Promise) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            // Below Android 13, notifications are granted by default.
            promise.resolve("granted")
            return
        }
        val granted = ActivityCompat.checkSelfPermission(
            reactContext,
            Manifest.permission.POST_NOTIFICATIONS,
        ) == PackageManager.PERMISSION_GRANTED

        val nm = reactContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        promise.resolve(if (granted && nm.areNotificationsEnabled()) "granted" else "denied")
    }

    /**
     * Request POST_NOTIFICATIONS permission on Android 13+.
     * On older versions, resolves "granted" immediately.
     */
    @ReactMethod
    fun requestNotificationPermission(promise: Promise) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            promise.resolve("granted")
            return
        }
        val activity = reactContext.currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "Cannot request permission: no foreground activity.")
            return
        }
        ActivityCompat.requestPermissions(
            activity,
            arrayOf(Manifest.permission.POST_NOTIFICATIONS),
            /* requestCode */ 9001,
        )
        // Resolve optimistically — the user can also check status again after.
        promise.resolve("requested")
    }

    // ── WorkManager reconciliation ────────────────────────────────────────────

    /**
     * Schedule a 15-minute periodic reconciliation worker.
     * Uses KEEP policy so re-calling this is idempotent.
     */
    @ReactMethod
    fun scheduleReconciliation(promise: Promise) {
        try {
            val request = PeriodicWorkRequestBuilder<ReconciliationWorker>(
                RECONCILE_INTERVAL_MINUTES, TimeUnit.MINUTES,
            ).addTag(WORK_TAG).build()

            WorkManager.getInstance(reactContext).enqueueUniquePeriodicWork(
                WORK_TAG,
                ExistingPeriodicWorkPolicy.KEEP,
                request,
            )
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SCHEDULE_ERROR", e.message, e)
        }
    }

    /**
     * Cancel the periodic reconciliation worker.
     */
    @ReactMethod
    fun cancelReconciliation(promise: Promise) {
        try {
            WorkManager.getInstance(reactContext).cancelUniqueWork(WORK_TAG)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("CANCEL_ERROR", e.message, e)
        }
    }

    // ── Initial PRINT intent ──────────────────────────────────────────────────

    /**
     * Called by JS on every app startup to check whether the app was opened
     * via a PRINT notification action (i.e., from a dead state).
     *
     * Returns null if there is no pending PRINT intent, or a map with
     * { fileId, folderId, fileName } if the activity was started with ACTION_PRINT.
     *
     * The data is consumed once (cleared after first read).
     */
    @ReactMethod
    fun getInitialPrintIntent(promise: Promise) {
        val intent = reactContext.currentActivity?.intent
        if (intent?.action != "com.winsoftprintstation.ACTION_PRINT") {
            promise.resolve(null)
            return
        }

        val uri: Uri? = intent.data
        val fileId = uri?.getQueryParameter("fileId")
        val folderId = uri?.getQueryParameter("folderId")
        val fileName = uri?.getQueryParameter("fileName")

        if (fileId.isNullOrBlank() || folderId.isNullOrBlank()) {
            promise.resolve(null)
            return
        }

        val result = Arguments.createMap().apply {
            putString("fileId", fileId)
            putString("folderId", folderId)
            putString("fileName", fileName ?: "")
        }

        // Consume the intent so it is not re-processed on configuration changes.
        reactContext.currentActivity?.intent?.setAction(null)
        reactContext.currentActivity?.intent?.data = null

        promise.resolve(result)
    }

    // ── Deferred files (LATER actions persisted by NotificationActionReceiver) ─

    /**
     * Read and clear the deferred file IDs stored by NotificationActionReceiver.
     * Returns an array of "fileId::folderId" strings.
     */
    @ReactMethod
    fun consumeDeferredFiles(promise: Promise) {
        val prefs = reactContext.getSharedPreferences(WinsoftFcmService.PREFS_NAME, Context.MODE_PRIVATE)
        val entries = prefs.getStringSet("deferred_files", emptySet()) ?: emptySet()
        val arr = Arguments.createArray().apply {
            entries.forEach { pushString(it) }
        }
        prefs.edit().remove("deferred_files").apply()
        promise.resolve(arr)
    }
}
