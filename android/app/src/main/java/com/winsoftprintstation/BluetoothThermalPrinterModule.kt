package com.winsoftprintstation

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.OutputStream
import java.util.UUID
import java.util.concurrent.Executors

/**
 * Native Android module for 80mm ESC/POS Thermal Printing over Bluetooth Classic RFCOMM / SPP.
 */
class BluetoothThermalPrinterModule(private val context: ReactApplicationContext) :
  ReactContextBaseJavaModule(context) {

  override fun getName() = "BluetoothThermalPrinter"

  companion object {
    // Standard Bluetooth Serial Port Profile (SPP) UUID
    private val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
  }

  private var activeSocket: BluetoothSocket? = null
  private var outputStream: OutputStream? = null
  private val executor = Executors.newSingleThreadExecutor()

  private val bluetoothAdapter: BluetoothAdapter?
    get() {
      val manager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
      return manager?.adapter ?: BluetoothAdapter.getDefaultAdapter()
    }

  @ReactMethod
  fun getBondedDevices(promise: Promise) {
    try {
      val adapter = bluetoothAdapter
      if (adapter == null || !adapter.isEnabled) {
        promise.resolve(Arguments.createArray())
        return
      }

      val bonded = adapter.bondedDevices
      val result = Arguments.createArray()
      for (device in bonded) {
        val map = Arguments.createMap().apply {
          putString("name", device.name ?: "Unknown Device")
          putString("address", device.address)
        }
        result.pushMap(map)
      }
      promise.resolve(result)
    } catch (e: SecurityException) {
      promise.reject("BLUETOOTH_PERMISSION_DENIED", "Bluetooth permission not granted: ${e.message}", e)
    } catch (e: Exception) {
      promise.reject("BLUETOOTH_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun connect(address: String, promise: Promise) {
    executor.execute {
      try {
        val adapter = bluetoothAdapter
        if (adapter == null || !adapter.isEnabled) {
          promise.reject("BLUETOOTH_DISABLED", "Bluetooth is disabled or not supported on this device.")
          return@execute
        }

        disconnectInternal()

        val device: BluetoothDevice = adapter.getRemoteDevice(address)
        try {
          adapter.cancelDiscovery()
        } catch (_: Exception) {}

        val socket = device.createRfcommSocketToServiceRecord(SPP_UUID)
        socket.connect()

        activeSocket = socket
        outputStream = socket.outputStream

        promise.resolve(true)
      } catch (e: SecurityException) {
        promise.reject("BLUETOOTH_PERMISSION_DENIED", "Bluetooth permission not granted: ${e.message}", e)
      } catch (e: Exception) {
        disconnectInternal()
        promise.reject("CONNECT_FAILED", "Could not connect to $address: ${e.message}", e)
      }
    }
  }

  @ReactMethod
  fun disconnect(promise: Promise) {
    executor.execute {
      disconnectInternal()
      promise.resolve(true)
    }
  }

  @ReactMethod
  fun isConnected(promise: Promise) {
    val connected = activeSocket?.isConnected == true
    promise.resolve(connected)
  }

  @ReactMethod
  fun writeBytes(base64Data: String, promise: Promise) {
    executor.execute {
      try {
        val stream = outputStream
        val socket = activeSocket

        if (socket?.isConnected != true || stream == null) {
          promise.reject("NOT_CONNECTED", "Thermal printer is not connected.")
          return@execute
        }

        val bytes = Base64.decode(base64Data, Base64.DEFAULT)
        stream.write(bytes)
        stream.flush()
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("WRITE_FAILED", "Failed to send data to thermal printer: ${e.message}", e)
      }
    }
  }

  private fun disconnectInternal() {
    try {
      outputStream?.close()
    } catch (_: Exception) {}
    try {
      activeSocket?.close()
    } catch (_: Exception) {}
    outputStream = null
    activeSocket = null
  }

  override fun onCatalystInstanceDestroy() {
    super.onCatalystInstanceDestroy()
    disconnectInternal()
    executor.shutdown()
  }
}
