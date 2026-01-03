import { EspHomeClientWrapper, BLEAdvertisement } from './EspHomeClientWrapper';

// Mock esphome-client
jest.mock('esphome-client');

describe('EspHomeClientWrapper', () => {
  describe('handleBLERawAdvertisements', () => {
    let wrapper: EspHomeClientWrapper;
    let receivedAdvertisements: BLEAdvertisement[];

    beforeEach(() => {
      receivedAdvertisements = [];
      wrapper = new EspHomeClientWrapper({
        host: 'test.local',
        port: 6053,
      });

      // Listen for parsed advertisements
      wrapper.on('message.BluetoothLEAdvertisementResponse', (ad: BLEAdvertisement) => {
        receivedAdvertisements.push(ad);
      });
    });

    afterEach(() => {
      wrapper.removeAllListeners();
    });

    it('should parse raw BLE advertisement with complete local name and service UUIDs', () => {
      // Create a raw advertising data packet for KSBT03C101071926 device
      // Format: [length][type][data...]
      const deviceName = 'KSBT03C101071926';
      const rawAdData = Buffer.concat([
        // Complete Local Name (0x09)
        Buffer.from([deviceName.length + 1, 0x09]), // length includes type byte
        Buffer.from(deviceName, 'utf8'),
        
        // Complete List of 128-bit Service UUIDs (0x07)
        Buffer.from([0x11, 0x07]), // length=17, type=0x07
        // UUID: 6e400001-b5a3-f393-e0a9-e50e24dcca9e (little-endian)
        Buffer.from([
          0x9e, 0xca, 0xdc, 0x24, 0x0e, 0xe5, 0xa9, 0xe0,
          0x93, 0xf3, 0xa3, 0xb5, 0x01, 0x00, 0x40, 0x6e,
        ]),
      ]);

      // Use a smaller address that JavaScript can handle precisely
      const address = 228421478233; // Smaller value that fits in JS number
      const rssi = -68;
      const addressType = 0;

      // Encode the BluetoothLERawAdvertisement protobuf message
      const adMessage = encodeBluetoothLERawAdvertisement(address, rssi, addressType, rawAdData);

      // Encode the outer BluetoothLERawAdvertisementsResponse
      const payload = encodeBluetoothLERawAdvertisementsResponse([adMessage]);

      // Trigger the message handler
      (wrapper as any).handleBLERawAdvertisements(payload);

      // Verify the parsed advertisement
      expect(receivedAdvertisements).toHaveLength(1);
      const ad = receivedAdvertisements[0];
      expect(ad.name).toBe('KSBT03C101071926');
      expect(ad.address).toBe(address);
      expect(ad.rssi).toBe(rssi);
      expect(ad.addressType).toBe(addressType);
      expect(ad.serviceUuidsList).toContain('6e400001-b5a3-f393-e0a9-e50e24dcca9e');
    });

    it('should parse raw BLE advertisement with manufacturer data', () => {
      // Create raw advertising data with manufacturer data
      const deviceName = 'TestDev';
      const rawAdData = Buffer.concat([
        // Complete Local Name
        Buffer.from([deviceName.length + 1, 0x09]),
        Buffer.from(deviceName, 'utf8'),
        
        // Manufacturer Specific Data (0xFF)
        // Total length = 1 (type) + 2 (company ID) + 4 (data) = 7
        Buffer.from([0x07, 0xFF]), // length=7 (includes type byte)
        Buffer.from([0x4C, 0x00]), // Company ID: Apple (0x004C, little-endian)
        Buffer.from([0x01, 0x02, 0x03, 0x04]), // Manufacturer data
      ]);

      const address = 123456789;
      const rssi = -50;
      const addressType = 1;

      const adMessage = encodeBluetoothLERawAdvertisement(address, rssi, addressType, rawAdData);
      const payload = encodeBluetoothLERawAdvertisementsResponse([adMessage]);

      (wrapper as any).handleBLERawAdvertisements(payload);

      expect(receivedAdvertisements).toHaveLength(1);
      const ad = receivedAdvertisements[0];
      expect(ad.name).toBe('TestDev');
      expect(ad.address).toBe(address);
      expect(ad.rssi).toBe(rssi);
      expect(ad.manufacturerDataList).toHaveLength(1);
      expect(ad.manufacturerDataList[0].uuid).toBe('004c');
      expect(Buffer.from(ad.manufacturerDataList[0].legacyDataList)).toEqual(Buffer.from([0x01, 0x02, 0x03, 0x04]));
    });

    it('should parse raw BLE advertisement with 16-bit service UUIDs', () => {
      const rawAdData = Buffer.concat([
        // Complete Local Name
        Buffer.from([0x05, 0x09]), // length=5, type=0x09
        Buffer.from('Test', 'utf8'),
        
        // Complete List of 16-bit Service UUIDs (0x03)
        Buffer.from([0x05, 0x03]), // length=5, type=0x03
        Buffer.from([0x0F, 0x18]), // Heart Rate Service (0x180F, little-endian)
        Buffer.from([0x0A, 0x18]), // Device Information Service (0x180A)
      ]);

      const address = 999;
      const rssi = -60;
      const addressType = 0;

      const adMessage = encodeBluetoothLERawAdvertisement(address, rssi, addressType, rawAdData);
      const payload = encodeBluetoothLERawAdvertisementsResponse([adMessage]);

      (wrapper as any).handleBLERawAdvertisements(payload);

      expect(receivedAdvertisements).toHaveLength(1);
      const ad = receivedAdvertisements[0];
      expect(ad.serviceUuidsList).toHaveLength(2);
      expect(ad.serviceUuidsList).toContain('0000180f-0000-1000-8000-00805f9b34fb');
      expect(ad.serviceUuidsList).toContain('0000180a-0000-1000-8000-00805f9b34fb');
    });

    it('should parse raw BLE advertisement with service data', () => {
      const deviceName = 'Test';
      const rawAdData = Buffer.concat([
        // Complete Local Name
        Buffer.from([deviceName.length + 1, 0x09]),
        Buffer.from(deviceName, 'utf8'),
        
        // Service Data - 16-bit UUID (0x16)
        Buffer.from([0x08, 0x16]), // length=8, type=0x16
        Buffer.from([0x0F, 0x18]), // Service UUID: 0x180F
        Buffer.from([0xAA, 0xBB, 0xCC, 0xDD, 0xEE]), // Service data
      ]);

      const address = 888;
      const rssi = -70;
      const addressType = 0;

      const adMessage = encodeBluetoothLERawAdvertisement(address, rssi, addressType, rawAdData);
      const payload = encodeBluetoothLERawAdvertisementsResponse([adMessage]);

      (wrapper as any).handleBLERawAdvertisements(payload);

      expect(receivedAdvertisements).toHaveLength(1);
      const ad = receivedAdvertisements[0];
      expect(ad.serviceDataList).toHaveLength(1);
      expect(ad.serviceDataList[0].uuid).toBe('0000180f-0000-1000-8000-00805f9b34fb');
      expect(Buffer.from(ad.serviceDataList[0].legacyDataList)).toEqual(
        Buffer.from([0xAA, 0xBB, 0xCC, 0xDD, 0xEE])
      );
    });

    it('should handle multiple advertisements in a single message', () => {
      // Create first advertisement
      const deviceName1 = 'Device1';
      const rawAdData1 = Buffer.concat([
        Buffer.from([deviceName1.length + 1, 0x09]),
        Buffer.from(deviceName1, 'utf8'),
      ]);
      const adMessage1 = encodeBluetoothLERawAdvertisement(111, -50, 0, rawAdData1);

      // Create second advertisement
      const deviceName2 = 'Device2';
      const rawAdData2 = Buffer.concat([
        Buffer.from([deviceName2.length + 1, 0x09]),
        Buffer.from(deviceName2, 'utf8'),
      ]);
      const adMessage2 = encodeBluetoothLERawAdvertisement(222, -60, 1, rawAdData2);

      const payload = encodeBluetoothLERawAdvertisementsResponse([adMessage1, adMessage2]);

      (wrapper as any).handleBLERawAdvertisements(payload);

      expect(receivedAdvertisements).toHaveLength(2);
      expect(receivedAdvertisements[0].name).toBe('Device1');
      expect(receivedAdvertisements[0].address).toBe(111);
      expect(receivedAdvertisements[0].rssi).toBe(-50);
      expect(receivedAdvertisements[1].name).toBe('Device2');
      expect(receivedAdvertisements[1].address).toBe(222);
      expect(receivedAdvertisements[1].rssi).toBe(-60);
    });

    it('should handle advertisement with no name', () => {
      // Create advertising data without a name
      const rawAdData = Buffer.concat([
        // Complete List of 16-bit Service UUIDs
        Buffer.from([0x03, 0x03]),
        Buffer.from([0x0F, 0x18]),
      ]);

      const address = 777;
      const rssi = -55;
      const addressType = 0;

      const adMessage = encodeBluetoothLERawAdvertisement(address, rssi, addressType, rawAdData);
      const payload = encodeBluetoothLERawAdvertisementsResponse([adMessage]);

      (wrapper as any).handleBLERawAdvertisements(payload);

      expect(receivedAdvertisements).toHaveLength(1);
      const ad = receivedAdvertisements[0];
      expect(ad.name).toBe('');
      expect(ad.address).toBe(address);
      expect(ad.serviceUuidsList).toHaveLength(1);
    });

    it('should handle empty advertising data', () => {
      const rawAdData = Buffer.alloc(0);

      const address = 666;
      const rssi = -80;
      const addressType = 0;

      const adMessage = encodeBluetoothLERawAdvertisement(address, rssi, addressType, rawAdData);
      const payload = encodeBluetoothLERawAdvertisementsResponse([adMessage]);

      (wrapper as any).handleBLERawAdvertisements(payload);

      expect(receivedAdvertisements).toHaveLength(1);
      const ad = receivedAdvertisements[0];
      expect(ad.name).toBe('');
      expect(ad.address).toBe(address);
      expect(ad.serviceUuidsList).toHaveLength(0);
      expect(ad.manufacturerDataList).toHaveLength(0);
      expect(ad.serviceDataList).toHaveLength(0);
    });
  });
});

// Helper functions to encode protobuf messages for testing

function encodeVarint(value: number): Buffer {
  const bytes: number[] = [];
  
  // Handle values up to 2^53-1 (JavaScript's safe integer range)
  let remaining = value;
  
  while (remaining > 127) {
    bytes.push((remaining % 128) | 0x80);
    remaining = Math.floor(remaining / 128);
  }
  bytes.push(remaining % 128);

  return Buffer.from(bytes);
}

function encodeSignedVarint(value: number): Buffer {
  // ZigZag encoding: (n << 1) ^ (n >> 31)
  const encoded = (value << 1) ^ (value >> 31);
  return encodeVarint(encoded);
}

function encodeProtoField(fieldNumber: number, wireType: number, value: Buffer): Buffer {
  const tag = (fieldNumber << 3) | wireType;
  return Buffer.concat([encodeVarint(tag), value]);
}

function encodeBluetoothLERawAdvertisement(
  address: number,
  rssi: number,
  addressType: number,
  data: Buffer
): Buffer {
  const parts: Buffer[] = [];

  // Field 1: address (uint64, wire type 0)
  parts.push(encodeProtoField(1, 0, encodeVarint(address)));

  // Field 2: rssi (sint32, wire type 0) - uses ZigZag encoding
  parts.push(encodeProtoField(2, 0, encodeSignedVarint(rssi)));

  // Field 3: address_type (uint32, wire type 0)
  parts.push(encodeProtoField(3, 0, encodeVarint(addressType)));

  // Field 4: data (bytes, wire type 2 - length-delimited)
  parts.push(encodeProtoField(4, 2, Buffer.concat([encodeVarint(data.length), data])));

  return Buffer.concat(parts);
}

function encodeBluetoothLERawAdvertisementsResponse(advertisements: Buffer[]): Buffer {
  const parts: Buffer[] = [];

  // Field 1: repeated advertisements (wire type 2 - length-delimited)
  for (const ad of advertisements) {
    parts.push(encodeProtoField(1, 2, Buffer.concat([encodeVarint(ad.length), ad])));
  }

  return Buffer.concat(parts);
}
