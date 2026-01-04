import { EspHomeClient } from 'esphome-client';
import { EventEmitter } from 'events';
import { logInfo, logWarn, logError } from '@utils/logger';

// Bluetooth proxy message type IDs from api.proto
enum BluetoothMessageType {
  SUBSCRIBE_BLUETOOTH_LE_ADVERTISEMENTS_REQUEST = 66,
  BLUETOOTH_LE_ADVERTISEMENT_RESPONSE = 67,
  BLUETOOTH_DEVICE_REQUEST = 68,
  BLUETOOTH_DEVICE_CONNECTION_RESPONSE = 69,
  BLUETOOTH_GATT_GET_SERVICES_REQUEST = 70,
  BLUETOOTH_GATT_GET_SERVICES_RESPONSE = 71,
  BLUETOOTH_GATT_GET_SERVICES_DONE_RESPONSE = 72,
  BLUETOOTH_GATT_READ_REQUEST = 73,
  BLUETOOTH_GATT_READ_RESPONSE = 74,
  BLUETOOTH_GATT_WRITE_REQUEST = 75,
  BLUETOOTH_GATT_NOTIFY_REQUEST = 78,
  BLUETOOTH_GATT_NOTIFY_DATA_RESPONSE = 79,
  BLUETOOTH_GATT_ERROR_RESPONSE = 83,
  BLUETOOTH_LE_RAW_ADVERTISEMENTS_RESPONSE = 93,
  BLUETOOTH_DEVICE_CLEAR_CACHE_RESPONSE = 126,
}

enum BluetoothDeviceRequestType {
  CONNECT = 0,  // Deprecated - V1, do not use
  DISCONNECT = 1,
  PAIR = 2,
  UNPAIR = 3,
  CONNECT_V3_WITH_CACHE = 4,  // V3 connection using cached GATT services (faster, use for reconnections)
  CONNECT_V3_WITHOUT_CACHE = 5,  // V3 connection with fresh GATT discovery (slower but safer, use for first connections)
  CLEAR_CACHE = 6,
}

// Wire types for protobuf encoding
enum WireType {
  VARINT = 0,
  FIXED64 = 1,
  LENGTH_DELIMITED = 2,
  FIXED32 = 5,
}

// Constants
const NULL_UUID = '00000000-0000-0000-0000-000000000000';

// BLE data structure
export interface BLEData {
  uuid: string;
  legacyDataList: Uint8Array;
  data: string;
}

// BLE advertisement structure
export interface BLEAdvertisement {
  name: string;
  address: number;
  rssi: number;
  manufacturerDataList: BLEData[];
  serviceDataList: BLEData[];
  serviceUuidsList: string[];
  addressType: number;
}

// GATT structures matching the proto definitions
export interface BluetoothGATTDescriptor {
  uuid: string;
  handle: number;
}

export interface BluetoothGATTCharacteristic {
  uuid: string;
  handle: number;
  properties: number;
  descriptorsList: BluetoothGATTDescriptor[];
}

export interface BluetoothGATTService {
  uuid: string;
  handle: number;
  characteristicsList: BluetoothGATTCharacteristic[];
}

/**
 * Wrapper around EspHomeClient that adds Bluetooth proxy functionality.
 * This extends the base EspHomeClient with Bluetooth LE advertisement scanning
 * and GATT operations for BLE device communication.
 */
export class EspHomeClientWrapper extends EventEmitter {
  private client: EspHomeClient;
  private connected: boolean = false;
  private messageHandlers: Map<number, (payload: Buffer) => void> = new Map();

  constructor(config: {
    host: string;
    port?: number;
    password?: string;
    encryptionKey?: string;
    expectedServerName?: string;
  }) {
    super();

    // Create the base ESPHome client
    this.client = new EspHomeClient({
      host: config.host,
      port: config.port || 6053,
      psk: config.encryptionKey,
      clientId: 'smartbed-mqtt-keeson-ble',
      serverName: config.expectedServerName,
      logger: {
        debug: logInfo, // Map debug to info since we don't have a separate debug logger
        info: logInfo,
        warn: logWarn,
        error: logError,
      },
    });

    // Set up event forwarding and message handling
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Forward core events
    this.client.on('connect', (data) => {
      this.connected = true;
      logInfo(`[ESPHomeClientWrapper] Connected (encrypted: ${data.encrypted})`);
      this.emit('connected', data);
    });

    this.client.on('disconnect', (reason) => {
      this.connected = false;
      logInfo(`[ESPHomeClientWrapper] Disconnected: ${reason}`);
      this.emit('disconnected', reason);
    });

    this.client.on('deviceInfo', (info) => {
      logInfo(`[ESPHomeClientWrapper] Device info received:`, {
        name: info.name,
        bluetoothProxyFeatureFlags: info.bluetoothProxyFeatureFlags,
      });
      this.emit('deviceInfo', info);
    });

    // Handle raw messages for Bluetooth proxy
    this.client.on('message', ({ type, payload }) => {
      const handler = this.messageHandlers.get(type);
      if (handler) {
        try {
          handler(payload);
        } catch (error) {
          logError(`[ESPHomeClientWrapper] Error handling message type ${type}:`, error);
        }
      }
    });

    // Set up Bluetooth message handlers
    this.setupBluetoothMessageHandlers();
  }

  private setupBluetoothMessageHandlers(): void {
    // Handle BLE advertisements (deprecated message type 67)
    this.messageHandlers.set(
      BluetoothMessageType.BLUETOOTH_LE_ADVERTISEMENT_RESPONSE,
      this.handleBLEAdvertisement.bind(this)
    );

    // Handle BLE raw advertisements (new message type 93)
    this.messageHandlers.set(
      BluetoothMessageType.BLUETOOTH_LE_RAW_ADVERTISEMENTS_RESPONSE,
      this.handleBLERawAdvertisements.bind(this)
    );

    // Handle device connection response
    this.messageHandlers.set(
      BluetoothMessageType.BLUETOOTH_DEVICE_CONNECTION_RESPONSE,
      this.handleDeviceConnectionResponse.bind(this)
    );

    // Handle GATT services response
    this.messageHandlers.set(
      BluetoothMessageType.BLUETOOTH_GATT_GET_SERVICES_RESPONSE,
      this.handleGATTServicesResponse.bind(this)
    );

    // Handle GATT services done
    this.messageHandlers.set(
      BluetoothMessageType.BLUETOOTH_GATT_GET_SERVICES_DONE_RESPONSE,
      this.handleGATTServicesDone.bind(this)
    );

    // Handle GATT read response
    this.messageHandlers.set(
      BluetoothMessageType.BLUETOOTH_GATT_READ_RESPONSE,
      this.handleGATTReadResponse.bind(this)
    );

    // Handle GATT notify data
    this.messageHandlers.set(
      BluetoothMessageType.BLUETOOTH_GATT_NOTIFY_DATA_RESPONSE,
      this.handleGATTNotifyData.bind(this)
    );

    // Handle GATT error response
    this.messageHandlers.set(
      BluetoothMessageType.BLUETOOTH_GATT_ERROR_RESPONSE,
      this.handleGATTError.bind(this)
    );

    // Handle device clear cache response
    this.messageHandlers.set(
      BluetoothMessageType.BLUETOOTH_DEVICE_CLEAR_CACHE_RESPONSE,
      this.handleDeviceClearCacheResponse.bind(this)
    );
  }

  async connect(): Promise<void> {
    await this.client.connect();
  }

  disconnect(): void {
    this.connected = false;
    this.client.disconnect();
  }

  get isConnected(): boolean {
    return this.connected;
  }

  get host(): string {
    return (this.client as any).host;
  }

  get port(): number {
    return (this.client as any).port || 6053;
  }

  // Bluetooth proxy methods

  subscribeBluetoothAdvertisementService(): void {
    if (!this.connected) {
      logWarn('[ESPHomeClientWrapper] Cannot subscribe to BLE advertisements - not connected');
      return;
    }

    // Send SubscribeBluetoothLEAdvertisementsRequest (message type 66)
    // flags = 1 for V2 protocol (raw advertisements via message type 93)
    const payload = this.encodeProtoFields([
      { fieldNumber: 1, wireType: WireType.VARINT, value: 1 }, // flags = 1 (V2 protocol)
    ]);

    this.sendMessage(BluetoothMessageType.SUBSCRIBE_BLUETOOTH_LE_ADVERTISEMENTS_REQUEST, payload);
    logInfo('[ESPHomeClientWrapper] Subscribed to Bluetooth LE advertisements (V2 protocol)');
  }

  async connectBluetoothDeviceService(address: number, addressType: number): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected to ESPHome device');
    }

    // Send BluetoothDeviceRequest (message type 68)
    // Use V3 connection type (without cache for fresh service discovery)
    const payload = this.encodeProtoFields([
      { fieldNumber: 1, wireType: WireType.VARINT, value: address },
      { fieldNumber: 2, wireType: WireType.VARINT, value: BluetoothDeviceRequestType.CONNECT_V3_WITHOUT_CACHE },
      { fieldNumber: 3, wireType: WireType.VARINT, value: 1 }, // has_address_type
      { fieldNumber: 4, wireType: WireType.VARINT, value: addressType },
    ]);

    this.sendMessage(BluetoothMessageType.BLUETOOTH_DEVICE_REQUEST, payload);
    logInfo(`[ESPHomeClientWrapper] Sent V3 connect request for device ${address.toString(16)}`);
  }

  async disconnectBluetoothDeviceService(address: number): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected to ESPHome device');
    }

    // Send BluetoothDeviceRequest with DISCONNECT type (message type 68)
    const payload = this.encodeProtoFields([
      { fieldNumber: 1, wireType: WireType.VARINT, value: address },
      { fieldNumber: 2, wireType: WireType.VARINT, value: BluetoothDeviceRequestType.DISCONNECT },
    ]);

    this.sendMessage(BluetoothMessageType.BLUETOOTH_DEVICE_REQUEST, payload);
    logInfo(`[ESPHomeClientWrapper] Sent disconnect request for device ${address.toString(16)}`);
  }

  async pairBluetoothDeviceService(address: number): Promise<{ paired: boolean }> {
    if (!this.connected) {
      throw new Error('Not connected to ESPHome device');
    }

    // Send BluetoothDeviceRequest with PAIR type
    const payload = this.encodeProtoFields([
      { fieldNumber: 1, wireType: WireType.VARINT, value: address },
      { fieldNumber: 2, wireType: WireType.VARINT, value: BluetoothDeviceRequestType.PAIR },
    ]);

    this.sendMessage(BluetoothMessageType.BLUETOOTH_DEVICE_REQUEST, payload);
    logInfo(`[ESPHomeClientWrapper] Sent pair request for device ${address.toString(16)}`);

    // Note: The old @2colors/esphome-native-api implementation returned success immediately
    // without waiting for the actual pairing result. The actual result would come through
    // a BluetoothDeviceConnectionResponse message. We maintain the same behavior for
    // backward compatibility. In practice, the caller should listen for connection
    // response events to determine if pairing succeeded.
    return { paired: true };
  }

  async listBluetoothGATTServicesService(
    address: number
  ): Promise<{ servicesList: BluetoothGATTService[] }> {
    if (!this.connected) {
      throw new Error('Not connected to ESPHome device');
    }

    return new Promise((resolve, reject) => {
      const services: BluetoothGATTService[] = [];
      const timeout = setTimeout(() => {
        this.removeAllListeners(`gatt-services-${address}`);
        this.removeAllListeners(`gatt-services-done-${address}`);
        reject(new Error('Timeout waiting for GATT services'));
      }, 10000);

      // Listen for services responses
      this.on(`gatt-services-${address}`, (newServices: BluetoothGATTService[]) => {
        services.push(...newServices);
      });

      // Listen for done signal
      this.once(`gatt-services-done-${address}`, () => {
        clearTimeout(timeout);
        this.removeAllListeners(`gatt-services-${address}`);
        resolve({ servicesList: services });
      });

      // Send request
      const payload = this.encodeProtoFields([
        { fieldNumber: 1, wireType: WireType.VARINT, value: address },
      ]);

      this.sendMessage(BluetoothMessageType.BLUETOOTH_GATT_GET_SERVICES_REQUEST, payload);
      logInfo(`[ESPHomeClientWrapper] Sent GATT services request for device ${address.toString(16)}`);
    });
  }

  async readBluetoothGATTCharacteristicService(
    address: number,
    handle: number
  ): Promise<{ data: string }> {
    if (!this.connected) {
      throw new Error('Not connected to ESPHome device');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.removeAllListeners(`gatt-read-${address}-${handle}`);
        reject(new Error('Timeout waiting for GATT read response'));
      }, 5000);

      // Listen for read response
      this.once(`gatt-read-${address}-${handle}`, (data: string) => {
        clearTimeout(timeout);
        resolve({ data });
      });

      // Send read request
      const payload = this.encodeProtoFields([
        { fieldNumber: 1, wireType: WireType.VARINT, value: address },
        { fieldNumber: 2, wireType: WireType.VARINT, value: handle },
      ]);

      this.sendMessage(BluetoothMessageType.BLUETOOTH_GATT_READ_REQUEST, payload);
    });
  }

  async writeBluetoothGATTCharacteristicService(
    address: number,
    handle: number,
    data: Uint8Array,
    response: boolean
  ): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected to ESPHome device');
    }

    // Send write request
    const payload = this.encodeProtoFields([
      { fieldNumber: 1, wireType: WireType.VARINT, value: address },
      { fieldNumber: 2, wireType: WireType.VARINT, value: handle },
      { fieldNumber: 3, wireType: WireType.VARINT, value: response ? 1 : 0 },
      { fieldNumber: 4, wireType: WireType.LENGTH_DELIMITED, value: Buffer.from(data) },
    ]);

    this.sendMessage(BluetoothMessageType.BLUETOOTH_GATT_WRITE_REQUEST, payload);
  }

  async notifyBluetoothGATTCharacteristicService(address: number, handle: number): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected to ESPHome device');
    }

    // Send notify request
    const payload = this.encodeProtoFields([
      { fieldNumber: 1, wireType: WireType.VARINT, value: address },
      { fieldNumber: 2, wireType: WireType.VARINT, value: handle },
      { fieldNumber: 3, wireType: WireType.VARINT, value: 1 }, // enable = true
    ]);

    this.sendMessage(BluetoothMessageType.BLUETOOTH_GATT_NOTIFY_REQUEST, payload);
  }

  // Message handlers

  private handleBLEAdvertisement(payload: Buffer): void {
    try {
      const fields = this.decodeProtobuf(payload);
      
      const address = this.extractNumberField(fields, 1) || 0;
      const nameBytes = this.extractBytesField(fields, 2);
      const name = nameBytes ? nameBytes.toString('utf8') : '';
      const rssi = this.extractNumberField(fields, 3) || 0;
      const serviceUuids = this.extractRepeatedStringField(fields, 4);
      const addressType = this.extractNumberField(fields, 7) || 0;

      // Extract service data and manufacturer data
      const serviceDataList: BLEData[] = [];
      const manufacturerDataList: BLEData[] = [];

      // Note: service_data (field 5) and manufacturer_data (field 6) are deprecated
      // but we still handle them for backwards compatibility

      const advertisement: BLEAdvertisement = {
        name,
        address,
        rssi,
        manufacturerDataList,
        serviceDataList,
        serviceUuidsList: serviceUuids,
        addressType,
      };

      this.emit('message.BluetoothLEAdvertisementResponse', advertisement);
    } catch (error) {
      logError('[ESPHomeClientWrapper] Error parsing BLE advertisement:', error);
    }
  }

  private handleBLERawAdvertisements(payload: Buffer): void {
    try {
      const fields = this.decodeProtobuf(payload);
      
      // Field 1 contains repeated BluetoothLERawAdvertisement messages
      const advertisementBuffers = fields.get(1) || [];
      
      for (const adBuffer of advertisementBuffers) {
        const adFields = this.decodeProtobuf(adBuffer);
        
        // Extract fields from BluetoothLERawAdvertisement
        const address = this.extractNumberField(adFields, 1) || 0;
        const rssi = this.decodeSignedVarint(adFields.get(2)?.[0] || Buffer.alloc(0));
        const addressType = this.extractNumberField(adFields, 3) || 0;
        const rawData = this.extractBytesField(adFields, 4) || Buffer.alloc(0);
        
        // Parse the raw advertising data
        const parsedData = this.parseAdvertisingData(rawData);
        
        // Convert to BLEAdvertisement format and emit
        const advertisement: BLEAdvertisement = {
          name: parsedData.name,
          address,
          rssi,
          manufacturerDataList: parsedData.manufacturerDataList,
          serviceDataList: parsedData.serviceDataList,
          serviceUuidsList: parsedData.serviceUuidsList,
          addressType,
        };
        
        this.emit('message.BluetoothLEAdvertisementResponse', advertisement);
      }
    } catch (error) {
      logError('[ESPHomeClientWrapper] Error parsing raw BLE advertisements:', error);
    }
  }

  private handleDeviceConnectionResponse(payload: Buffer): void {
    try {
      const fields = this.decodeProtobuf(payload);
      
      const address = this.extractNumberField(fields, 1) || 0;
      const connected = this.extractNumberField(fields, 2) === 1;
      const mtu = this.extractNumberField(fields, 3);
      const error = this.extractNumberField(fields, 4);

      this.emit('message.BluetoothDeviceConnectionResponse', {
        address,
        connected,
        mtu,
        error,
      });

      logInfo(
        `[ESPHomeClientWrapper] Device ${address.toString(16)} connection: ${connected ? 'connected' : 'disconnected'}`
      );
    } catch (error) {
      logError('[ESPHomeClientWrapper] Error parsing device connection response:', error);
    }
  }

  private handleGATTServicesResponse(payload: Buffer): void {
    try {
      const fields = this.decodeProtobuf(payload);
      
      const address = this.extractNumberField(fields, 1) || 0;
      const services = this.parseGATTServices(fields.get(2) || []);

      // Debug logging to show all discovered GATT services and characteristics
      logInfo(`[ESPHomeClientWrapper] GATT services discovered for ${address.toString(16)}:`);
      for (const service of services) {
        logInfo(`  Service UUID: ${service.uuid} (handle: ${service.handle})`);
        for (const char of service.characteristicsList) {
          logInfo(`    Characteristic UUID: ${char.uuid} (handle: ${char.handle}, props: 0x${char.properties.toString(16)})`);
        }
      }

      this.emit(`gatt-services-${address}`, services);
    } catch (error) {
      logError('[ESPHomeClientWrapper] Error parsing GATT services response:', error);
    }
  }

  private handleGATTServicesDone(payload: Buffer): void {
    try {
      const fields = this.decodeProtobuf(payload);
      const address = this.extractNumberField(fields, 1) || 0;

      this.emit(`gatt-services-done-${address}`);
      logInfo(`[ESPHomeClientWrapper] GATT services enumeration done for ${address.toString(16)}`);
    } catch (error) {
      logError('[ESPHomeClientWrapper] Error parsing GATT services done:', error);
    }
  }

  private handleGATTReadResponse(payload: Buffer): void {
    try {
      const fields = this.decodeProtobuf(payload);
      
      const address = this.extractNumberField(fields, 1) || 0;
      const handle = this.extractNumberField(fields, 2) || 0;
      const dataBytes = this.extractBytesField(fields, 3);
      const data = dataBytes ? dataBytes.toString('base64') : '';

      this.emit(`gatt-read-${address}-${handle}`, data);
    } catch (error) {
      logError('[ESPHomeClientWrapper] Error parsing GATT read response:', error);
    }
  }

  private handleGATTNotifyData(payload: Buffer): void {
    try {
      const fields = this.decodeProtobuf(payload);
      
      const address = this.extractNumberField(fields, 1) || 0;
      const handle = this.extractNumberField(fields, 2) || 0;
      const dataBytes = this.extractBytesField(fields, 3);
      const data = dataBytes ? dataBytes.toString('base64') : '';

      this.emit('message.BluetoothGATTNotifyDataResponse', {
        address,
        handle,
        data,
      });
    } catch (error) {
      logError('[ESPHomeClientWrapper] Error parsing GATT notify data:', error);
    }
  }

  private handleGATTError(payload: Buffer): void {
    try {
      const fields = this.decodeProtobuf(payload);
      
      const address = this.extractNumberField(fields, 1) || 0;
      const error = this.extractNumberField(fields, 2) || 0;

      this.emit('message.BluetoothGATTErrorResponse', {
        address,
        error,
      });

      logWarn(
        `[ESPHomeClientWrapper] GATT error for device ${address.toString(16)}: error code ${error}`
      );
    } catch (error) {
      logError('[ESPHomeClientWrapper] Error parsing GATT error response:', error);
    }
  }

  private handleDeviceClearCacheResponse(payload: Buffer): void {
    try {
      const fields = this.decodeProtobuf(payload);
      
      const address = this.extractNumberField(fields, 1) || 0;
      const successValue = this.extractNumberField(fields, 2) ?? 0;
      const success = successValue === 1;

      logInfo(
        `[ESPHomeClientWrapper] Clear cache response for device ${address.toString(16)}: ${success ? 'success' : 'failed'}`
      );
    } catch (error) {
      logError('[ESPHomeClientWrapper] Error parsing clear cache response:', error);
    }
  }

  // Protobuf encoding/decoding helpers

  private encodeVarint(value: number): Buffer {
    const bytes: number[] = [];
    
    // Handle values up to JavaScript's safe integer range (2^53 - 1)
    let remaining = value;
    
    while (remaining > 127) {
      bytes.push((remaining % 128) | 0x80);
      remaining = Math.floor(remaining / 128);
    }
    bytes.push(remaining % 128);

    return Buffer.from(bytes);
  }

  private encodeProtoFields(
    fields: Array<{
      fieldNumber: number;
      wireType: WireType;
      value: number | Buffer;
    }>
  ): Buffer {
    const parts: Buffer[] = [];

    for (const { fieldNumber, wireType, value } of fields) {
      const tag = (fieldNumber << 3) | wireType;
      parts.push(this.encodeVarint(tag));

      if (wireType === WireType.VARINT) {
        parts.push(this.encodeVarint(value as number));
      } else if (wireType === WireType.LENGTH_DELIMITED) {
        const data = value as Buffer;
        parts.push(this.encodeVarint(data.length));
        parts.push(data);
      }
    }

    return Buffer.concat(parts);
  }

  private decodeProtobuf(buffer: Buffer): Map<number, Buffer[]> {
    const fields = new Map<number, Buffer[]>();
    let offset = 0;

    while (offset < buffer.length) {
      // Read tag
      const [tag, tagBytes] = this.readVarint(buffer, offset);
      offset += tagBytes;

      const fieldNumber = tag >>> 3;
      const wireType = tag & 0x07;

      if (!fields.has(fieldNumber)) {
        fields.set(fieldNumber, []);
      }

      if (wireType === WireType.VARINT) {
        // Read the varint to get its length, but store the raw bytes
        const [, valueBytes] = this.readVarint(buffer, offset);
        // Store the raw varint bytes directly to preserve precision for uint64 values
        const varintData = buffer.subarray(offset, offset + valueBytes);
        offset += valueBytes;
        fields.get(fieldNumber)!.push(varintData);
      } else if (wireType === WireType.LENGTH_DELIMITED) {
        const [length, lengthBytes] = this.readVarint(buffer, offset);
        offset += lengthBytes;
        const data = buffer.subarray(offset, offset + length);
        offset += length;
        fields.get(fieldNumber)!.push(data);
      } else if (wireType === WireType.FIXED64) {
        const data = buffer.subarray(offset, offset + 8);
        offset += 8;
        fields.get(fieldNumber)!.push(data);
      } else if (wireType === WireType.FIXED32) {
        const data = buffer.subarray(offset, offset + 4);
        offset += 4;
        fields.get(fieldNumber)!.push(data);
      }
    }

    return fields;
  }

  private readVarint(buffer: Buffer, offset: number): [number, number] {
    let value = 0;
    let shift = 0;
    let bytesRead = 0;

    while (offset + bytesRead < buffer.length) {
      const byte = buffer[offset + bytesRead];
      bytesRead++;

      // For small shifts, use bit shifting for efficiency
      // For larger shifts, use arithmetic to avoid 32-bit truncation
      if (shift < 28) {
        value |= (byte & 0x7f) << shift;
      } else {
        // For large shifts, use exponentiation operator for efficiency
        // This handles values up to JavaScript's safe integer limit (2^53 - 1)
        value += (byte % 128) * (2 ** shift);
      }
      shift += 7;

      if ((byte & 0x80) === 0) {
        break;
      }
    }

    return [value, bytesRead];
  }

  private readVarintBigInt(buffer: Buffer, offset: number): [bigint, number] {
    let value = 0n;
    let shift = 0n;
    let bytesRead = 0;

    while (offset + bytesRead < buffer.length) {
      const byte = buffer[offset + bytesRead];
      bytesRead++;

      value |= BigInt(byte & 0x7f) << shift;
      shift += 7n;

      if ((byte & 0x80) === 0) {
        break;
      }
    }

    return [value, bytesRead];
  }

  private decodeSignedVarint(buffer: Buffer): number {
    if (buffer.length === 0) return 0;
    
    const [value] = this.readVarint(buffer, 0);
    // ZigZag decoding: (n >>> 1) ^ -(n & 1)
    return (value >>> 1) ^ -(value & 1);
  }

  private extractNumberField(fields: Map<number, Buffer[]>, fieldNumber: number): number | undefined {
    const values = fields.get(fieldNumber);
    if (!values || values.length === 0) return undefined;

    // Decode varint from buffer
    const [value] = this.readVarint(values[0], 0);
    return value;
  }

  private extractBytesField(fields: Map<number, Buffer[]>, fieldNumber: number): Buffer | undefined {
    const values = fields.get(fieldNumber);
    if (!values || values.length === 0) return undefined;

    return values[0];
  }

  private extractRepeatedStringField(fields: Map<number, Buffer[]>, fieldNumber: number): string[] {
    const values = fields.get(fieldNumber);
    if (!values) return [];

    return values.map((buf) => buf.toString('utf8'));
  }

  private parseGATTServices(serviceBuffers: Buffer[]): BluetoothGATTService[] {
    const services: BluetoothGATTService[] = [];

    for (const serviceBuffer of serviceBuffers) {
      const serviceFields = this.decodeProtobuf(serviceBuffer);
      
      const uuidField = serviceFields.get(1);
      const handle = this.extractNumberField(serviceFields, 2) || 0;
      const shortUuid = this.extractNumberField(serviceFields, 4);

      // Parse UUID - prioritize 128-bit UUID over short UUID
      let uuid: string;
      if (uuidField && uuidField.length >= 2) {
        // Use 128-bit UUID from repeated uint64 field
        const parsed = this.parseUuid128FromRepeatedUint64(uuidField);
        uuid = parsed || NULL_UUID;
      } else if (shortUuid !== undefined) {
        // Fall back to short UUID (16-bit or 32-bit)
        uuid = this.formatShortUuid(shortUuid);
      } else {
        uuid = NULL_UUID;
      }

      // Parse characteristics
      const characteristicsList: BluetoothGATTCharacteristic[] = [];
      const characteristicBuffers = serviceFields.get(3) || [];
      
      for (const charBuffer of characteristicBuffers) {
        const charFields = this.decodeProtobuf(charBuffer);
        
        const charUuidField = charFields.get(1);
        const charHandle = this.extractNumberField(charFields, 2) || 0;
        const properties = this.extractNumberField(charFields, 3) || 0;
        const charShortUuid = this.extractNumberField(charFields, 5);

        // Parse characteristic UUID - prioritize 128-bit UUID over short UUID
        let charUuid: string;
        if (charUuidField && charUuidField.length >= 2) {
          const parsed = this.parseUuid128FromRepeatedUint64(charUuidField);
          charUuid = parsed || NULL_UUID;
        } else if (charShortUuid !== undefined) {
          charUuid = this.formatShortUuid(charShortUuid);
        } else {
          charUuid = NULL_UUID;
        }

        // Parse descriptors (field 4)
        const descriptorsList: BluetoothGATTDescriptor[] = [];
        const descriptorBuffers = charFields.get(4) || [];
        
        for (const descBuffer of descriptorBuffers) {
          const descFields = this.decodeProtobuf(descBuffer);
          
          const descUuidField = descFields.get(1);
          const descHandle = this.extractNumberField(descFields, 2) || 0;
          const descShortUuid = this.extractNumberField(descFields, 3);

          // Parse descriptor UUID - prioritize 128-bit UUID over short UUID
          let descUuid: string;
          if (descUuidField && descUuidField.length >= 2) {
            const parsed = this.parseUuid128FromRepeatedUint64(descUuidField);
            descUuid = parsed || NULL_UUID;
          } else if (descShortUuid !== undefined) {
            descUuid = this.formatShortUuid(descShortUuid);
          } else {
            descUuid = NULL_UUID;
          }

          descriptorsList.push({
            uuid: descUuid,
            handle: descHandle,
          });
        }

        characteristicsList.push({
          uuid: charUuid,
          handle: charHandle,
          properties,
          descriptorsList,
        });
      }

      services.push({
        uuid,
        handle,
        characteristicsList,
      });
    }

    return services;
  }

  private formatShortUuid(shortUuid: number): string {
    // Convert 16-bit or 32-bit UUID to standard Bluetooth UUID format
    const hex = shortUuid.toString(16).padStart(8, '0');
    return `${hex}-0000-1000-8000-00805f9b34fb`;
  }

  private parseUuid128FromRepeatedUint64(buffers: Buffer[]): string | null {
    // Parse 128-bit UUID from repeated uint64 field (ESPHome protobuf format)
    // The UUID is sent as two uint64 varints (low and high parts)
    if (!buffers || buffers.length === 0) {
      return null;
    }
    
    if (buffers.length === 1) {
      logWarn('[ESPHomeClientWrapper] Malformed 128-bit UUID: expected 2 uint64 values, got 1');
      return null;
    }
    
    if (buffers.length < 2) {
      // This shouldn't happen, but handle gracefully
      return null;
    }

    // Decode the two uint64 values from varints using BigInt to preserve all bits
    const [lowBig] = this.readVarintBigInt(buffers[0], 0);
    const [highBig] = this.readVarintBigInt(buffers[1], 0);

    // Write the values as little-endian uint64 to get the original bytes
    const lowBuf = Buffer.alloc(8);
    const highBuf = Buffer.alloc(8);
    lowBuf.writeBigUInt64LE(lowBig);
    highBuf.writeBigUInt64LE(highBig);

    // IMPORTANT FIX: Reverse each 8-byte segment to convert from little-endian to big-endian byte order
    // This is needed because Bluetooth UUIDs are displayed in big-endian format
    const lowReversed = Buffer.from(lowBuf).reverse();
    const highReversed = Buffer.from(highBuf).reverse();

    // Combine the reversed buffers and convert to hex string
    const combined = Buffer.concat([lowReversed, highReversed]);
    const hex = combined.toString('hex');
    
    // Format as UUID string: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    return `${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20, 32)}`;
  }

  private parseUuid128(buffer: Buffer): string {
    // Legacy method for parsing 128-bit UUID from a 16-byte buffer
    // This is used for parsing UUIDs from raw BLE advertising data
    // where the UUID bytes are in little-endian (reversed) order
    if (buffer.length < 16) {
      return NULL_UUID;
    }

    // Reverse the buffer to convert from little-endian to big-endian
    const reversed = Buffer.from(buffer).reverse();
    const hex = reversed.toString('hex');
    
    // Format as UUID string
    return `${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20, 32)}`;
  }

  private parseAdvertisingData(rawData: Buffer): {
    name: string;
    serviceUuidsList: string[];
    manufacturerDataList: BLEData[];
    serviceDataList: BLEData[];
  } {
    let name = '';
    const serviceUuidsList: string[] = [];
    const manufacturerDataList: BLEData[] = [];
    const serviceDataList: BLEData[] = [];
    
    let offset = 0;
    
    while (offset < rawData.length) {
      // Each AD structure: [length][type][data...]
      const length = rawData[offset];
      offset++;
      
      if (length === 0 || offset + length > rawData.length) {
        // Invalid or padding
        break;
      }
      
      const adType = rawData[offset];
      offset++;
      
      const dataLength = length - 1; // length includes type byte
      const data = rawData.subarray(offset, offset + dataLength);
      offset += dataLength;
      
      switch (adType) {
        case 0x08: // Shortened Local Name
        case 0x09: // Complete Local Name
          name = data.toString('utf8');
          break;
          
        case 0x02: // Incomplete List of 16-bit Service UUIDs
        case 0x03: // Complete List of 16-bit Service UUIDs
          for (let i = 0; i < data.length; i += 2) {
            const uuid16 = data.readUInt16LE(i);
            serviceUuidsList.push(this.formatShortUuid(uuid16));
          }
          break;
          
        case 0x04: // Incomplete List of 32-bit Service UUIDs
        case 0x05: // Complete List of 32-bit Service UUIDs
          for (let i = 0; i < data.length; i += 4) {
            const uuid32 = data.readUInt32LE(i);
            serviceUuidsList.push(this.formatShortUuid(uuid32));
          }
          break;
          
        case 0x06: // Incomplete List of 128-bit Service UUIDs
        case 0x07: // Complete List of 128-bit Service UUIDs
          for (let i = 0; i < data.length; i += 16) {
            const uuid128 = data.subarray(i, i + 16);
            serviceUuidsList.push(this.parseUuid128(uuid128));
          }
          break;
          
        case 0xFF: // Manufacturer Specific Data
          if (data.length >= 2) {
            const companyId = data.readUInt16LE(0);
            const manufacturerData = data.subarray(2);
            manufacturerDataList.push({
              uuid: companyId.toString(16).padStart(4, '0'),
              legacyDataList: new Uint8Array(manufacturerData),
              data: manufacturerData.toString('base64'),
            });
          }
          break;
          
        case 0x16: // Service Data - 16-bit UUID
          if (data.length >= 2) {
            const serviceUuid16 = data.readUInt16LE(0);
            const serviceData = data.subarray(2);
            serviceDataList.push({
              uuid: this.formatShortUuid(serviceUuid16),
              legacyDataList: new Uint8Array(serviceData),
              data: serviceData.toString('base64'),
            });
          }
          break;
      }
    }
    
    return {
      name,
      serviceUuidsList,
      manufacturerDataList,
      serviceDataList,
    };
  }

  private sendMessage(type: number, payload: Buffer): void {
    // The esphome-client library doesn't expose sendPlaintextMessage in its public API,
    // but we need it to send custom Bluetooth proxy messages that aren't in the library.
    // We access it through the internal client object.
    const client = this.client as any;

    if (typeof client.sendPlaintextMessage === 'function') {
      client.sendPlaintextMessage(type, payload);
    } else {
      // Fallback: Log an error if the method is not available
      // This should not happen with the current version of esphome-client
      logError('[ESPHomeClientWrapper] Cannot send message - sendPlaintextMessage not available in esphome-client');
      throw new Error('sendPlaintextMessage method not available in esphome-client');
    }
  }
}
