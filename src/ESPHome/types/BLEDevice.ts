import { BluetoothGATTService } from '../EspHomeClientWrapper';
import { EspHomeClientWrapper } from '../EspHomeClientWrapper';
import { Dictionary } from '@utils/Dictionary';
import { BLEAdvertisement } from './BLEAdvertisement';
import { BLEDeviceInfo } from './BLEDeviceInfo';
import { IBLEDevice } from './IBLEDevice';

interface BluetoothGATTNotifyDataMessage {
  address: number;
  handle: number;
  data: string;
}

export class BLEDevice implements IBLEDevice {
  private connected = false;
  private paired = false;
  private notifyListeners: Map<number, (message: BluetoothGATTNotifyDataMessage) => void> = new Map();

  private servicesList?: BluetoothGATTService[];
  private serviceCache: Dictionary<BluetoothGATTService | null> = {};

  private deviceInfo?: BLEDeviceInfo;
  private keepaliveInterval?: NodeJS.Timeout;
  private readonly KEEPALIVE_INTERVAL_MS = 30000; // 30 seconds
  private readonly GENERIC_ACCESS_SERVICE_UUID = '00001800-0000-1000-8000-00805f9b34fb';
  private readonly DEVICE_NAME_CHARACTERISTIC_UUID = '00002a00-0000-1000-8000-00805f9b34fb';
  private readonly GATT_ERROR_DEVICE_DISCONNECTED = 13;
  
  // Command queue and rate limiting for connect-per-command pattern
  private commandQueue: Array<() => Promise<void>> = [];
  private processingCommand = false;
  private lastConnectionAttempt = 0;
  private readonly CONNECTION_COOLDOWN_MS = 1000; // 1 second between connections
  private readonly CONNECTION_STABILIZATION_MS = 100; // Wait for connection to stabilize
  private readonly COMMAND_COMPLETION_DELAY_MS = 100; // Wait for command to complete

  public mac: string;
  public get address() {
    return this.advertisement.address;
  }
  public get manufacturerDataList() {
    return this.advertisement.manufacturerDataList;
  }
  public get serviceUuidsList() {
    return this.advertisement.serviceUuidsList;
  }

  constructor(public name: string, public advertisement: BLEAdvertisement, private connection: EspHomeClientWrapper, private stayConnected = false) {
    this.mac = this.address.toString(16).padStart(12, '0');
    
    // Listen for GATT error events to detect disconnections
    this.connection.on('message.BluetoothGATTErrorResponse', this.handleGATTError);
    this.connection.on('deviceDisconnected', this.handleDeviceDisconnected);
  }

  pair = async () => {
    const { paired } = await this.connection.pairBluetoothDeviceService(this.address);
    this.paired = paired;
  };

  private handleGATTError = ({ address, error }: { address: number; error: number }) => {
    if (address !== this.address) return;
    
    // GATT error 13 means device is disconnected
    // Just mark as disconnected - do NOT trigger automatic reconnection
    // The connect-per-command pattern will handle reconnection when needed
    if (error === this.GATT_ERROR_DEVICE_DISCONNECTED) {
      this.connected = false;
      this.stopKeepalive();
    }
  };

  private handleDeviceDisconnected = (address: number) => {
    if (address !== this.address) return;
    this.connected = false;
    this.stopKeepalive();
  };

  private startKeepalive = () => {
    if (!this.stayConnected) return;
    
    this.stopKeepalive();
    
    this.keepaliveInterval = setInterval(async () => {
      try {
        // Read device name from Generic Access service as keepalive ping
        const characteristic = await this.getCharacteristic(
          this.GENERIC_ACCESS_SERVICE_UUID,
          this.DEVICE_NAME_CHARACTERISTIC_UUID,
          false // Don't log warnings if not found
        );
        
        if (characteristic) {
          await this.readCharacteristic(characteristic.handle);
        }
        // If characteristic is not available, silently skip keepalive
        // The device may not have Generic Access service
      } catch (error) {
        // Keepalive read failed - device is likely disconnected
        // Mark as disconnected but don't log to avoid noise
        this.connected = false;
        this.stopKeepalive();
      }
    }, this.KEEPALIVE_INTERVAL_MS);
  };

  private stopKeepalive = () => {
    if (this.keepaliveInterval) {
      clearInterval(this.keepaliveInterval);
      this.keepaliveInterval = undefined;
    }
  };

  connect = async () => {
    if (this.connected) {
      return;
    }

    const { addressType } = this.advertisement;
    
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.connection.off('message.BluetoothDeviceConnectionResponse', connectionHandler);
        reject(new Error(`Connection timeout for device ${this.mac}`));
      }, 10000);

      const connectionHandler = ({ address, connected, error }: { address: number; connected: boolean; error?: number }) => {
        if (address !== this.address) return;
        
        clearTimeout(timeout);
        this.connection.off('message.BluetoothDeviceConnectionResponse', connectionHandler);
        
        if (connected) {
          this.connected = true;
          
          // Start keepalive for persistent connections
          if (this.stayConnected) {
            this.startKeepalive();
          }
          
          if (this.paired) {
            this.pair().then(resolve).catch(reject);
          } else {
            resolve();
          }
        } else {
          reject(new Error(`Connection failed for device ${this.mac}: error code ${error}`));
        }
      };

      this.connection.on('message.BluetoothDeviceConnectionResponse', connectionHandler);
      this.connection.connectBluetoothDeviceService(this.address, addressType).catch((err) => {
        clearTimeout(timeout);
        this.connection.off('message.BluetoothDeviceConnectionResponse', connectionHandler);
        reject(err);
      });
    });
  };

  disconnect = async () => {
    this.connected = false;
    this.stopKeepalive();
    await this.connection.disconnectBluetoothDeviceService(this.address);
  };

  /**
   * Process the command queue one command at a time
   */
  private async processQueue(): Promise<void> {
    if (this.processingCommand || this.commandQueue.length === 0) {
      return;
    }

    this.processingCommand = true;

    while (this.commandQueue.length > 0) {
      const command = this.commandQueue.shift();
      if (command) {
        try {
          await command();
        } catch (error) {
          // Error already handled in the command, continue processing queue
        }
      }
    }

    this.processingCommand = false;
  }

  /**
   * Queue a command to be executed serially
   */
  private async queueCommand<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.commandQueue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (e) {
          reject(e);
        }
      });
      void this.processQueue();
    });
  }

  /**
   * Send a command using connect-send-disconnect pattern
   * This is the recommended way to send commands to devices that disconnect after each interaction
   */
  async sendCommandAndDisconnect(handle: number, bytes: Uint8Array, response = true): Promise<void> {
    return this.queueCommand(async () => {
      // Rate limiting: ensure minimum time between connection attempts
      const now = Date.now();
      const timeSinceLastAttempt = now - this.lastConnectionAttempt;
      if (timeSinceLastAttempt < this.CONNECTION_COOLDOWN_MS) {
        const waitTime = this.CONNECTION_COOLDOWN_MS - timeSinceLastAttempt;
        await new Promise(r => setTimeout(r, waitTime));
      }
      this.lastConnectionAttempt = Date.now();

      try {
        // Step 1: Connect to device
        if (!this.connected) {
          await this.connect();
        }

        // Step 2: Wait a bit for connection to stabilize
        await new Promise(r => setTimeout(r, this.CONNECTION_STABILIZATION_MS));

        // Step 3: Send the command
        await this.connection.writeBluetoothGATTCharacteristicService(this.address, handle, bytes, response);

        // Step 4: Wait for command to complete
        await new Promise(r => setTimeout(r, this.COMMAND_COMPLETION_DELAY_MS));

        // Step 5: Gracefully disconnect
        await this.disconnect();

        // Step 6: Cooldown period
        await new Promise(r => setTimeout(r, this.CONNECTION_COOLDOWN_MS));
      } catch (error) {
        // Ensure we disconnect even on error
        try {
          await this.disconnect();
        } catch {
          // Ignore disconnect errors
        }
        throw error;
      }
    });
  }

  cleanup = () => {
    this.stopKeepalive();
    this.connection.off('message.BluetoothGATTErrorResponse', this.handleGATTError);
    this.connection.off('deviceDisconnected', this.handleDeviceDisconnected);
    
    // Clear command queue
    this.commandQueue = [];
    this.processingCommand = false;
    
    // Clean up all notify listeners
    for (const listener of this.notifyListeners.values()) {
      this.connection.off('message.BluetoothGATTNotifyDataResponse', listener);
    }
    this.notifyListeners.clear();
  };

  private async reconnectIfNeeded(): Promise<void> {
    if (!this.connected) {
      await this.connect();
    }
  }

  writeCharacteristic = async (handle: number, bytes: Uint8Array, response = true) => {
    // For devices that stay connected, use the traditional approach
    // For devices that disconnect after commands, use sendCommandAndDisconnect() instead
    if (!this.stayConnected) {
      // Use connect-per-command pattern for devices that disconnect after interaction
      return this.sendCommandAndDisconnect(handle, bytes, response);
    }

    // Traditional persistent connection approach for stayConnected devices
    // Try to reconnect if not connected
    try {
      await this.reconnectIfNeeded();
    } catch (error) {
      throw new Error(`Cannot write: failed to reconnect to device ${this.mac}`);
    }
    
    try {
      await this.connection.writeBluetoothGATTCharacteristicService(this.address, handle, bytes, response);
    } catch (error) {
      // If write fails and we're not connected, try to reconnect and retry once
      // Check connected status first to avoid infinite recursion
      if (!this.connected) {
        try {
          await this.connect();
          await this.connection.writeBluetoothGATTCharacteristicService(this.address, handle, bytes, response);
        } catch (retryError) {
          throw new Error(`Write failed after reconnection attempt: ${retryError}`);
        }
      } else {
        throw error;
      }
    }
  };

  getServices = async () => {
    if (!this.servicesList) {
      const { servicesList } = await this.connection.listBluetoothGATTServicesService(this.address);
      this.servicesList = servicesList;
    }
    return this.servicesList;
  };

  getCharacteristic = async (serviceUuid: string, characteristicUuid: string, _writeLogs = true) => {
    const service = await this.getService(serviceUuid);

    if (!service) {
      return undefined;
    }

    const characteristic = service?.characteristicsList?.find((c) => c.uuid === characteristicUuid);
    if (!characteristic) {
      return undefined;
    }

    return characteristic;
  };

  subscribeToCharacteristic = async (handle: number, notify: (data: Uint8Array) => void) => {
    // Remove existing listener for this handle if any
    const existingListener = this.notifyListeners.get(handle);
    if (existingListener) {
      this.connection.off('message.BluetoothGATTNotifyDataResponse', existingListener);
    }
    
    // Create and store new listener
    const listener = (message: BluetoothGATTNotifyDataMessage) => {
      if (message.address != this.address || message.handle != handle) return;
      notify(new Uint8Array([...Buffer.from(message.data, 'base64')]));
    };
    this.notifyListeners.set(handle, listener);
    
    this.connection.on('message.BluetoothGATTNotifyDataResponse', listener);
    await this.connection.notifyBluetoothGATTCharacteristicService(this.address, handle);
  };

  readCharacteristic = async (handle: number) => {
    const response = await this.connection.readBluetoothGATTCharacteristicService(this.address, handle);
    return new Uint8Array([...Buffer.from(response.data, 'base64')]);
  };

  getDeviceInfo = async () => {
    if (this.deviceInfo) return this.deviceInfo;
    const services = await this.getServices();
    const service = services.find((s) => s.uuid === '0000180a-0000-1000-8000-00805f9b34fb');
    if (!service) return undefined;

    const deviceInfo: BLEDeviceInfo = (this.deviceInfo = {});
    const setters: Dictionary<(value: string) => void> = {
      '00002a24-0000-1000-8000-00805f9b34fb': (value: string) => (deviceInfo.modelNumber = value),
      '00002a25-0000-1000-8000-00805f9b34fb': (value: string) => (deviceInfo.serialNumber = value),
      '00002a26-0000-1000-8000-00805f9b34fb': (value: string) => (deviceInfo.firmwareRevision = value),
      '00002a27-0000-1000-8000-00805f9b34fb': (value: string) => (deviceInfo.hardwareRevision = value),
      '00002a28-0000-1000-8000-00805f9b34fb': (value: string) => (deviceInfo.softwareRevision = value),
      '00002a29-0000-1000-8000-00805f9b34fb': (value: string) => (deviceInfo.manufacturerName = value),
    };
    for (const { uuid, handle } of service.characteristicsList) {
      const setter = setters[uuid];
      if (!setter) continue;
      try {
        const value = await this.readCharacteristic(handle);
        setter(Buffer.from(value).toString());
      } catch {}
    }

    return this.deviceInfo;
  };

  private getService = async (serviceUuid: string) => {
    const cachedService = this.serviceCache[serviceUuid];
    if (cachedService !== undefined) return cachedService;

    const services = await this.getServices();
    const service = services.find((s) => s.uuid === serviceUuid) || null;
    this.serviceCache[serviceUuid] = service;
    return service;
  };
}
