import { BluetoothGATTService } from '../EspHomeClientWrapper';
import { EspHomeClientWrapper } from '../EspHomeClientWrapper';
import { Dictionary } from '@utils/Dictionary';
import { BLEAdvertisement } from './BLEAdvertisement';
import { BLEDeviceInfo } from './BLEDeviceInfo';
import { IBLEDevice } from './IBLEDevice';

export class BLEDevice implements IBLEDevice {
  private connected = false;
  private paired = false;

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
  }

  pair = async () => {
    const { paired } = await this.connection.pairBluetoothDeviceService(this.address);
    this.paired = paired;
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
    await this.connection.disconnectBluetoothDeviceService(this.address);
  };

  cleanup = () => {
    // Nothing to clean up now since we don't have persistent listeners
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
