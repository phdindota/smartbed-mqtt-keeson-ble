import { EspHomeClientWrapper } from './EspHomeClientWrapper';
import { Deferred } from '@utils/deferred';
import { logInfo, logWarn, logError } from '@utils/logger';
import { IESPConnection } from './IESPConnection';
import { connect } from './connect';
import { BLEAdvertisement } from './types/BLEAdvertisement';
import { BLEDevice } from './types/BLEDevice';
import { IBLEDevice } from './types/IBLEDevice';
import { IGNORED_MESSAGE_TYPES } from './constants';

export class ESPConnection implements IESPConnection {
  private connectionConfigs: Array<{
    host: string;
    port?: number;
    password?: string;
    encryptionKey?: string;
    expectedServerName?: string;
  }>;

  constructor(
    private connections: EspHomeClientWrapper[],
    configs?: Array<{
      host: string;
      port?: number;
      password?: string;
      encryptionKey?: string;
      expectedServerName?: string;
    }>
  ) {
    // Store connection configs for reconnection
    if (configs) {
      this.connectionConfigs = configs;
    } else {
      // Fallback for existing code/tests - extract from connections
      this.connectionConfigs = connections.map((conn) => ({
        host: conn.host,
        port: conn.port,
      }));
    }

    // Set up error handlers for each connection
    this.setupErrorHandlers();
  }

  private setupErrorHandlers(): void {
    for (const connection of this.connections) {
      // Handle unknown message types gracefully
      connection.on('error', (error: any) => {
        const errorMessage = error?.message || String(error);

        if (errorMessage.includes('Failed find message type for Id:')) {
          // Extract message type ID from error message
          const match = errorMessage.match(/Id:\s*(\d+)/);
          const messageTypeId = match ? parseInt(match[1], 10) : null;
          
          // Silently ignore expected but unhandled message types
          if (messageTypeId && IGNORED_MESSAGE_TYPES.includes(messageTypeId)) {
            // Silently ignore - these are expected message types
            return;
          }
          
          logWarn(`[ESPHome] Unknown message type on ${connection.host}:`, errorMessage);
          // Don't crash, just log the warning
        } else {
          logError(`[ESPHome] Connection error on ${connection.host}:`, error);
        }
      });

      // Handle disconnection events
      connection.on('disconnected', () => {
        logWarn(`[ESPHome] Disconnected from ${connection.host}`);
      });
    }
  }

  async reconnect(): Promise<void> {
    this.disconnect();
    logInfo('[ESPHome] Reconnecting...');

    try {
      this.connections = await Promise.all(
        this.connectionConfigs.map((config) => connect(new EspHomeClientWrapper(config)))
      );

      // Set up error handlers for the new connections
      this.setupErrorHandlers();

      logInfo('[ESPHome] Reconnection successful');
    } catch (error) {
      logError('[ESPHome] Reconnection failed:', error);
      throw error;
    }
  }

  disconnect(): void {
    logInfo('[ESPHome] Disconnecting...');

    for (const connection of this.connections) {
      try {
        connection.disconnect();
      } catch (error) {
        logWarn('[ESPHome] Error during disconnect:', error);
      }
    }
  }

  async getBLEDevices(deviceNames: string[], nameMapper?: (name: string) => string, enableFiltering = true, stayConnected = false): Promise<IBLEDevice[]> {
    logInfo(`[ESPHome] Searching for device(s): ${deviceNames.join(', ')}`);
    deviceNames = deviceNames.map((name) => name.toLowerCase());
    const bleDevices: IBLEDevice[] = [];
    const seenAddresses: number[] = [];
    const complete = new Deferred<void>();
    
    await this.discoverBLEDevices(
      (bleDevice) => {
        const { name, mac, advertisement, address } = bleDevice;

        // Skip if we've already accepted this device
        if (seenAddresses.includes(address)) return;

        let index = deviceNames.indexOf(mac);
        if (index === -1) index = deviceNames.indexOf(name.toLowerCase());
        if (index === -1) return;

        // Skip devices with empty metadata (partial/early advertisements)
        // Wait for a more complete advertisement with service UUIDs or manufacturer data
        const hasEmptyMetadata =
          advertisement.manufacturerDataList.length === 0 && advertisement.serviceUuidsList.length === 0;

        if (hasEmptyMetadata) {
          logInfo(`[ESPHome] Skipping ${name} with empty metadata, waiting for complete advertisement`);
          return;
        }

        // Mark this device as seen and accepted
        seenAddresses.push(address);
        deviceNames.splice(index, 1);
        logInfo(`[ESPHome] Found device: ${name} (${mac})`);
        bleDevices.push(bleDevice);
        if (deviceNames.length) return;
        complete.resolve();
      },
      complete,
      nameMapper,
      stayConnected
    );
    
    // After discovery, enable MAC address filtering on all connections
    // to prevent processing advertisements from non-configured devices
    if (enableFiltering && seenAddresses.length > 0) {
      for (const connection of this.connections) {
        connection.setAllowedDevices(seenAddresses);
      }
    }
    
    // Stop BLE scanning after device discovery to reduce ESP32 load
    this.stopBluetoothScanning();
    
    if (deviceNames.length) logWarn(`[ESPHome] Could not find address for device(s): ${deviceNames.join(', ')}`);
    return bleDevices;
  }

  async discoverBLEDevices(
    onNewDeviceFound: (bleDevice: IBLEDevice) => void,
    complete: Promise<void>,
    nameMapper?: (name: string) => string,
    stayConnected = false
  ) {
    const listenerBuilder = (connection: EspHomeClientWrapper) => ({
      connection,
      listener: (advertisement: BLEAdvertisement) => {
        let { name } = advertisement;

        if (!name) return;

        if (nameMapper) name = nameMapper(name);
        onNewDeviceFound(new BLEDevice(name, advertisement, connection, stayConnected));
      },
    });
    const listeners = this.connections.map(listenerBuilder);
    for (const { connection, listener } of listeners) {
      connection.on('message.BluetoothLEAdvertisementResponse', listener);
      connection.subscribeBluetoothAdvertisementService();
    }
    await complete;
    for (const { connection, listener } of listeners) {
      connection.off('message.BluetoothLEAdvertisementResponse', listener);
    }
  }

  stopBluetoothScanning(): void {
    logInfo('[ESPHome] Stopping Bluetooth scanning to reduce ESP32 load');
    for (const connection of this.connections) {
      connection.unsubscribeBluetoothAdvertisementService();
    }
  }
}
