import { EspHomeClientWrapper } from './EspHomeClientWrapper';

describe('GATT Service Parser', () => {
  let wrapper: EspHomeClientWrapper;

  beforeEach(() => {
    wrapper = new EspHomeClientWrapper({
      host: 'test.local',
      port: 6053,
    });
  });

  afterEach(() => {
    wrapper.removeAllListeners();
  });

  describe('parseGATTServices with 128-bit UUIDs', () => {
    it('should parse Nordic UART Service with 128-bit UUID', () => {
      // Nordic UART Service UUID: 6e400001-b5a3-f393-e0a9-e50e24dcca9e
      // Remove dashes: 6e400001b5a3f393e0a9e50e24dcca9e
      // This is 16 bytes: 6e 40 00 01 b5 a3 f3 93 e0 a9 e5 0e 24 dc ca 9e
      //
      // ESPHome sends this as two uint64 values (in protobuf varint format):
      // First 8 bytes as BE uint64:  6e 40 00 01 b5 a3 f3 93 -> 0x6e400001b5a3f393
      // Last 8 bytes as BE uint64:   e0 a9 e5 0e 24 dc ca 9e -> 0xe0a9e50e24dcca9e
      
      const lowPart = 0x6e400001b5a3f393n;
      const highPart = 0xe0a9e50e24dcca9en;

      // Create a GATT service with the Nordic UART Service UUID
      const serviceBuffer = encodeGATTService(
        lowPart,
        highPart,
        1, // handle
        []  // no characteristics for this test
      );

      const services = (wrapper as any).parseGATTServices([serviceBuffer]);

      expect(services).toHaveLength(1);
      expect(services[0].uuid).toBe('6e400001-b5a3-f393-e0a9-e50e24dcca9e');
      expect(services[0].handle).toBe(1);
    });

    it('should parse service with characteristics having 128-bit UUIDs', () => {
      // Nordic UART Service TX characteristic: 6e400003-b5a3-f393-e0a9-e50e24dcca9e
      // Bytes: 6e 40 00 03 b5 a3 f3 93 e0 a9 e5 0e 24 dc ca 9e
      // First 8 bytes as BE uint64:  6e 40 00 03 b5 a3 f3 93 -> 0x6e400003b5a3f393
      // Last 8 bytes as BE uint64:   e0 a9 e5 0e 24 dc ca 9e -> 0xe0a9e50e24dcca9e
      
      const serviceLow = 0x6e400001b5a3f393n;
      const serviceHigh = 0xe0a9e50e24dcca9en;
      const charLow = 0x6e400003b5a3f393n;
      const charHigh = 0xe0a9e50e24dcca9en;

      const characteristicBuffer = encodeGATTCharacteristic(
        charLow,
        charHigh,
        10, // handle
        0x10, // properties: notify
        [] // no descriptors
      );

      const serviceBuffer = encodeGATTService(
        serviceLow,
        serviceHigh,
        1,
        [characteristicBuffer]
      );

      const services = (wrapper as any).parseGATTServices([serviceBuffer]);

      expect(services).toHaveLength(1);
      expect(services[0].uuid).toBe('6e400001-b5a3-f393-e0a9-e50e24dcca9e');
      expect(services[0].characteristicsList).toHaveLength(1);
      expect(services[0].characteristicsList[0].uuid).toBe('6e400003-b5a3-f393-e0a9-e50e24dcca9e');
      expect(services[0].characteristicsList[0].handle).toBe(10);
      expect(services[0].characteristicsList[0].properties).toBe(0x10);
    });

    it('should prioritize 128-bit UUID over short UUID when both present', () => {
      // If for some reason both are present, 128-bit should win
      const lowPart = 0x6e400001b5a3f393n;
      const highPart = 0xe0a9e50e24dcca9en;

      const serviceBuffer = encodeGATTServiceWithShortUuid(
        lowPart,
        highPart,
        1,
        0x180F, // short UUID (Battery Service) - should be ignored
        []
      );

      const services = (wrapper as any).parseGATTServices([serviceBuffer]);

      expect(services).toHaveLength(1);
      // Should use 128-bit UUID, not the short UUID
      expect(services[0].uuid).toBe('6e400001-b5a3-f393-e0a9-e50e24dcca9e');
      expect(services[0].uuid).not.toBe('0000180f-0000-1000-8000-00805f9b34fb');
    });

    it('should fall back to short UUID if 128-bit UUID is not present', () => {
      const serviceBuffer = encodeGATTServiceShortOnly(
        1,
        0x180F, // Battery Service
        []
      );

      const services = (wrapper as any).parseGATTServices([serviceBuffer]);

      expect(services).toHaveLength(1);
      expect(services[0].uuid).toBe('0000180f-0000-1000-8000-00805f9b34fb');
    });

    it('should handle descriptors with 128-bit UUIDs', () => {
      // Custom descriptor UUID: fedcba09-8765-4321-1234-567890abcdef
      // Bytes: fe dc ba 09 87 65 43 21 12 34 56 78 90 ab cd ef
      const descLow = 0xfedcba0987654321n;
      const descHigh = 0x1234567890abcdefn;

      const descriptorBuffer = encodeGATTDescriptor(
        descLow,
        descHigh,
        15 // handle
      );

      const charLow = 0x6e400003b5a3f393n;
      const charHigh = 0xe0a9e50e24dcca9en;

      const characteristicBuffer = encodeGATTCharacteristic(
        charLow,
        charHigh,
        10,
        0x10,
        [descriptorBuffer]
      );

      const serviceLow = 0x6e400001b5a3f393n;
      const serviceHigh = 0xe0a9e50e24dcca9en;

      const serviceBuffer = encodeGATTService(
        serviceLow,
        serviceHigh,
        1,
        [characteristicBuffer]
      );

      const services = (wrapper as any).parseGATTServices([serviceBuffer]);

      expect(services).toHaveLength(1);
      expect(services[0].characteristicsList).toHaveLength(1);
      expect(services[0].characteristicsList[0].descriptorsList).toHaveLength(1);
      expect(services[0].characteristicsList[0].descriptorsList[0].uuid).toBe('fedcba09-8765-4321-1234-567890abcdef');
      expect(services[0].characteristicsList[0].descriptorsList[0].handle).toBe(15);
    });

    it('should handle empty UUID field (all zeros)', () => {
      const serviceBuffer = encodeGATTService(
        0n,
        0n,
        1,
        []
      );

      const services = (wrapper as any).parseGATTServices([serviceBuffer]);

      expect(services).toHaveLength(1);
      expect(services[0].uuid).toBe('00000000-0000-0000-0000-000000000000');
    });
  });
});

// Helper functions to encode GATT protobuf messages

function encodeVarint(value: number | bigint): Buffer {
  const bytes: number[] = [];
  let remaining = typeof value === 'bigint' ? value : BigInt(value);
  
  while (remaining > 127n) {
    bytes.push(Number(remaining & 0x7fn) | 0x80);
    remaining = remaining >> 7n;
  }
  bytes.push(Number(remaining & 0x7fn));

  return Buffer.from(bytes);
}

function encodeProtoField(fieldNumber: number, wireType: number, value: Buffer): Buffer {
  const tag = (fieldNumber << 3) | wireType;
  return Buffer.concat([encodeVarint(tag), value]);
}

function encodeGATTDescriptor(
  uuidLow: bigint,
  uuidHigh: bigint,
  handle: number
): Buffer {
  const parts: Buffer[] = [];

  // Field 1: uuid (repeated uint64) - two varints
  parts.push(encodeProtoField(1, 0, encodeVarint(uuidLow)));
  parts.push(encodeProtoField(1, 0, encodeVarint(uuidHigh)));

  // Field 2: handle (uint32)
  parts.push(encodeProtoField(2, 0, encodeVarint(handle)));

  return Buffer.concat(parts);
}

function encodeGATTCharacteristic(
  uuidLow: bigint,
  uuidHigh: bigint,
  handle: number,
  properties: number,
  descriptors: Buffer[]
): Buffer {
  const parts: Buffer[] = [];

  // Field 1: uuid (repeated uint64) - two varints
  parts.push(encodeProtoField(1, 0, encodeVarint(uuidLow)));
  parts.push(encodeProtoField(1, 0, encodeVarint(uuidHigh)));

  // Field 2: handle (uint32)
  parts.push(encodeProtoField(2, 0, encodeVarint(handle)));

  // Field 3: properties (uint32)
  parts.push(encodeProtoField(3, 0, encodeVarint(properties)));

  // Field 4: descriptors (repeated BluetoothGATTDescriptor)
  for (const desc of descriptors) {
    parts.push(encodeProtoField(4, 2, Buffer.concat([encodeVarint(desc.length), desc])));
  }

  return Buffer.concat(parts);
}

function encodeGATTService(
  uuidLow: bigint,
  uuidHigh: bigint,
  handle: number,
  characteristics: Buffer[]
): Buffer {
  const parts: Buffer[] = [];

  // Field 1: uuid (repeated uint64) - two varints
  // Only add if not zero
  if (uuidLow !== 0n || uuidHigh !== 0n) {
    parts.push(encodeProtoField(1, 0, encodeVarint(uuidLow)));
    parts.push(encodeProtoField(1, 0, encodeVarint(uuidHigh)));
  }

  // Field 2: handle (uint32)
  parts.push(encodeProtoField(2, 0, encodeVarint(handle)));

  // Field 3: characteristics (repeated BluetoothGATTCharacteristic)
  for (const char of characteristics) {
    parts.push(encodeProtoField(3, 2, Buffer.concat([encodeVarint(char.length), char])));
  }

  return Buffer.concat(parts);
}

function encodeGATTServiceWithShortUuid(
  uuidLow: bigint,
  uuidHigh: bigint,
  handle: number,
  shortUuid: number,
  characteristics: Buffer[]
): Buffer {
  const parts: Buffer[] = [];

  // Field 1: uuid (repeated uint64) - two varints
  parts.push(encodeProtoField(1, 0, encodeVarint(uuidLow)));
  parts.push(encodeProtoField(1, 0, encodeVarint(uuidHigh)));

  // Field 2: handle (uint32)
  parts.push(encodeProtoField(2, 0, encodeVarint(handle)));

  // Field 3: characteristics
  for (const char of characteristics) {
    parts.push(encodeProtoField(3, 2, Buffer.concat([encodeVarint(char.length), char])));
  }

  // Field 4: short_uuid (uint32)
  parts.push(encodeProtoField(4, 0, encodeVarint(shortUuid)));

  return Buffer.concat(parts);
}

function encodeGATTServiceShortOnly(
  handle: number,
  shortUuid: number,
  characteristics: Buffer[]
): Buffer {
  const parts: Buffer[] = [];

  // Field 2: handle (uint32)
  parts.push(encodeProtoField(2, 0, encodeVarint(handle)));

  // Field 3: characteristics
  for (const char of characteristics) {
    parts.push(encodeProtoField(3, 2, Buffer.concat([encodeVarint(char.length), char])));
  }

  // Field 4: short_uuid (uint32)
  parts.push(encodeProtoField(4, 0, encodeVarint(shortUuid)));

  return Buffer.concat(parts);
}
