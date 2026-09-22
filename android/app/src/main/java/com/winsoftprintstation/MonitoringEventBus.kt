package com.winsoftprintstation

import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * MonitoringEventBus — singleton event bus bridging native code to React Native.
 *
 * MonitoringModule registers itself as the active emitter on module creation.
 * WinsoftFcmService, NotificationActionReceiver, and ReconciliationWorker call
 * the static methods here. If the bridge is not alive, calls are silently dropped.
 *
 * Thread safety: all writes go through @Synchronized; reads are non-blocking.
 */
object MonitoringEventBus {

    private var emitter: DeviceEventManagerModule.RCTDeviceEventEmitter? = null
    private var _bridgeAlive = false

    @Synchronized
    fun register(deviceEmitter: DeviceEventManagerModule.RCTDeviceEventEmitter) {
        emitter = deviceEmitter
        _bridgeAlive = true
    }

    @Synchronized
    fun unregister() {
        emitter = null
        _bridgeAlive = false
    }

    fun isBridgeAlive(): Boolean = _bridgeAlive

    // ── Event helpers ────────────────────────────────────────────────────────

    fun emitFcmTokenRefresh(token: String) {
        safeEmit("onFcmTokenRefresh", token)
    }

    fun emitPrintAction(fileId: String, folderId: String, fileName: String) {
        val map = com.facebook.react.bridge.Arguments.createMap().apply {
            putString("fileId", fileId)
            putString("folderId", folderId)
            putString("fileName", fileName)
        }
        safeEmit("onPrintActionReceived", map)
    }

    fun emitLaterAction(fileId: String, folderId: String) {
        val map = com.facebook.react.bridge.Arguments.createMap().apply {
            putString("fileId", fileId)
            putString("folderId", folderId)
        }
        safeEmit("onLaterActionReceived", map)
    }

    fun emitReconciliationRequested() {
        safeEmit("onReconciliationRequested", null)
    }

    fun emitDeferredFilesReady(entries: List<String>) {
        val arr = com.facebook.react.bridge.Arguments.createArray().apply {
            entries.forEach { pushString(it) }
        }
        safeEmit("onDeferredFilesReady", arr)
    }

    @Synchronized
    private fun safeEmit(event: String, payload: Any?) {
        try {
            emitter?.emit(event, payload)
        } catch (_: Exception) {
            // Bridge may be torn down mid-emit; swallow to avoid crashes.
        }
    }
}
