import { BluetoothGATTService } from '../EspHomeClientWrapper';
import { EspHomeClientWrapper } from '../EspHomeClientWrapper';
import { Dictionary } from '@utils/Dictionary';
import { BLEAdvertisement } from './BLEAdvertisement';
import { BLEDeviceInfo } from './BLEDeviceInfo';
import { IBLEDevice } from './IBLEDevice';
import { logInfo, logWarn } from '@utils/logger';

export class BLEDevice implements IBLEDevice {
  private connected = false;
  private paired = false;
  private connecting = false;
  private connectionAttempts = 0;
  private readonly MAX_CONNECTION_ATTEMPTS = 3;
  private readonly INITIAL_RETRY_DELAY_MS = 1000;
  private connectionTimeout?: NodeJS.Timeout;
  private retryTimeout?: NodeJS.Timeout;

  private servicesList?: BluetoothGATTService[];
  private serviceCache: Dictionary<BluetoothGATTService | null> = {};

  private deviceInfo?: BLEDeviceInfo;

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

  constructor(public name: string, public advertisement: BLEAdvertisement, private connection: EspHomeClientWrapper) {
    this.mac = this.address.toString(16).padStart(12, '0');
    this.connection.on('message.BluetoothDeviceConnectionResponse', ({ address, connected }) => {
      if (this.address !== address) return;
      
      // Update connection state based on response
      if (connected) {
        this.connected = true;
        this.connecting = false;
        this.connectionAttempts = 0;
        if (this.connectionTimeout) {
          clearTimeout(this.connectionTimeout);
          this.connectionTimeout = undefined;
        }
        logInfo(`[BLEDevice] Device ${this.mac} connected successfully`);
      } else {
        this.connected = false;
        this.connecting = false;
        if (this.connectionTimeout) {
          clearTimeout(this.connectionTimeout);
          this.connectionTimeout = undefined;
        }
        logInfo(`[BLEDevice] Device ${this.mac} disconnected`);
      }
    });
  }

  pair = async () => {
    const { paired } = await this.connection.pairBluetoothDeviceService(this.address);
    this.paired = paired;
  };

  connect = async () => {
    // Prevent multiple simultaneous connection attempts
    if (this.connecting) {
      logWarn(`[BLEDevice] Connection attempt already in progress for device ${this.mac}`);
      return;
    }

    // Check if already connected
    if (this.connected) {
      logInfo(`[BLEDevice] Device ${this.mac} is already connected`);
      return;
    }

    // Check retry limit
    if (this.connectionAttempts >= this.MAX_CONNECTION_ATTEMPTS) {
      logWarn(`[BLEDevice] Maximum connection attempts (${this.MAX_CONNECTION_ATTEMPTS}) reached for device ${this.mac}`);
      return;
    }

    this.connecting = true;
    this.connectionAttempts++;

    try {
      const { addressType } = this.advertisement;
      logInfo(`[BLEDevice] Connecting to device ${this.mac} (attempt ${this.connectionAttempts}/${this.MAX_CONNECTION_ATTEMPTS})`);
      
      // Set connection timeout
      this.connectionTimeout = setTimeout(() => {
        this.connecting = false;
        logWarn(`[BLEDevice] Connection timeout for device ${this.mac}`);
      }, 10000); // 10 second timeout

      await this.connection.connectBluetoothDeviceService(this.address, addressType);
      
      // Note: Don't set this.connected = true here
      // Wait for BluetoothDeviceConnectionResponse to confirm connection
      
      if (this.paired) await this.pair();
    } catch (error) {
      this.connecting = false;
      if (this.connectionTimeout) {
        clearTimeout(this.connectionTimeout);
        this.connectionTimeout = undefined;
      }
      
      logWarn(`[BLEDevice] Failed to connect to device ${this.mac}:`, error);
      
      // Implement exponential backoff for retry
      if (this.connectionAttempts < this.MAX_CONNECTION_ATTEMPTS) {
        const delay = this.INITIAL_RETRY_DELAY_MS * Math.pow(2, this.connectionAttempts - 1);
        logInfo(`[BLEDevice] Retrying connection in ${delay}ms...`);
        this.retryTimeout = setTimeout(() => void this.connect(), delay);
      }
    }
  };

  disconnect = async () => {
    // Clear connection state
    this.connecting = false;
    this.connected = false;
    this.connectionAttempts = 0;
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = undefined;
    }
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = undefined;
    }
    
    await this.connection.disconnectBluetoothDeviceService(this.address);
  };

  writeCharacteristic = async (handle: number, bytes: Uint8Array, response = true) => {
    await this.connection.writeBluetoothGATTCharacteristicService(this.address, handle, bytes, response);
  };

  getServices = async () => {
    if (!this.servicesList) {
      const { servicesList } = await this.connection.listBluetoothGATTServicesService(this.address);
      this.servicesList = servicesList;
    }
    return this.servicesList;
  };

  getCharacteristic = async (serviceUuid: string, characteristicUuid: string, writeLogs = true) => {
    const service = await this.getService(serviceUuid);

    if (!service) {
      writeLogs && logInfo('[BLE] Could not find expected service for device:', serviceUuid, this.name);
      return undefined;
    }

    const characteristic = service?.characteristicsList?.find((c) => c.uuid === characteristicUuid);
    if (!characteristic) {
      writeLogs && logInfo('[BLE] Could not find expected characteristic for device:', characteristicUuid, this.name);
      return undefined;
    }

    return characteristic;
  };

  subscribeToCharacteristic = async (handle: number, notify: (data: Uint8Array) => void) => {
    this.connection.on('message.BluetoothGATTNotifyDataResponse', (message) => {
      if (message.address != this.address || message.handle != handle) return;
      notify(new Uint8Array([...Buffer.from(message.data, 'base64')]));
    });
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
