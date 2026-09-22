package com.winsoftprintstation

import android.content.Intent
import android.net.Uri
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

/**
 * MainActivity — single-task activity that hosts the React Native bundle.
 *
 * Handles the ACTION_PRINT deep-link intent which is fired by the PRINT
 * notification action (via PendingIntent.getActivity from WinsoftFcmService).
 *
 * Two code paths:
 *  1. App was DEAD: onCreate() is called with the PRINT intent.
 *     After the RN bridge initialises, JS calls getInitialPrintIntent() on
 *     MonitoringModule to retrieve and consume the intent data.
 *
 *  2. App is in BACKGROUND (singleTask): onNewIntent() is called.
 *     We forward the intent to the bridge immediately via MonitoringEventBus
 *     if it is already alive, or store it on the intent so getInitialPrintIntent()
 *     can read it when the bridge reconnects.
 */
class MainActivity : ReactActivity() {

    override fun getMainComponentName(): String = "WinsoftPrintStation"

    override fun createReactActivityDelegate(): ReactActivityDelegate =
        DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        // Replace the current intent so getInitialPrintIntent() can read it.
        setIntent(intent)
        dispatchPrintIntentIfReady(intent)
    }

    private fun dispatchPrintIntentIfReady(intent: Intent) {
        if (intent.action != "com.winsoftprintstation.ACTION_PRINT") return
        val uri: Uri = intent.data ?: return
        val fileId = uri.getQueryParameter("fileId") ?: return
        val folderId = uri.getQueryParameter("folderId") ?: return
        val fileName = uri.getQueryParameter("fileName") ?: ""

        if (MonitoringEventBus.isBridgeAlive()) {
            // Bridge is already running — emit directly so MonitoringService
            // can handle it without waiting for JS to call getInitialPrintIntent().
            MonitoringEventBus.emitPrintAction(fileId, folderId, fileName)
            // Clear the intent so getInitialPrintIntent() does not double-fire.
            intent.action = null
            intent.data = null
        }
        // If the bridge is not alive yet, the intent remains on the Activity
        // and JS will call getInitialPrintIntent() after the bundle loads.
    }
}
