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

  describe('subscribeBluetoothAdvertisementService', () => {
    let wrapper: EspHomeClientWrapper;
    let mockSendPlaintextMessage: jest.Mock;

    beforeEach(() => {
      wrapper = new EspHomeClientWrapper({
        host: 'test.local',
        port: 6053,
      });

      // Mock the sendPlaintextMessage method
      mockSendPlaintextMessage = jest.fn();
      (wrapper as any).client.sendPlaintextMessage = mockSendPlaintextMessage;
      (wrapper as any).connected = true; // Simulate connected state
    });

    afterEach(() => {
      wrapper.removeAllListeners();
    });

    it('should send V2 protocol flag when subscribing to BLE advertisements', () => {
      wrapper.subscribeBluetoothAdvertisementService();

      // Verify sendPlaintextMessage was called
      expect(mockSendPlaintextMessage).toHaveBeenCalledTimes(1);
      
      // Verify it was called with the correct message type (66)
      expect(mockSendPlaintextMessage).toHaveBeenCalledWith(
        66, // SUBSCRIBE_BLUETOOTH_LE_ADVERTISEMENTS_REQUEST
        expect.any(Buffer)
      );

      // Decode the payload to verify flags = 1
      const payload = mockSendPlaintextMessage.mock.calls[0][1] as Buffer;
      
      // The payload should be: tag (field 1, wire type 0) + value (1)
      // Tag = (1 << 3) | 0 = 8
      // Value = 1
      // So the buffer should be [0x08, 0x01]
      expect(payload).toEqual(Buffer.from([0x08, 0x01]));
    });

    it('should not send request when not connected', () => {
      (wrapper as any).connected = false;

      wrapper.subscribeBluetoothAdvertisementService();

      // Verify sendPlaintextMessage was not called
      expect(mockSendPlaintextMessage).not.toHaveBeenCalled();
    });
  });

  describe('connectBluetoothDeviceService', () => {
    let wrapper: EspHomeClientWrapper;
    let mockSendPlaintextMessage: jest.Mock;

    beforeEach(() => {
      wrapper = new EspHomeClientWrapper({
        host: 'test.local',
        port: 6053,
      });

      // Mock the sendPlaintextMessage method
      mockSendPlaintextMessage = jest.fn();
      (wrapper as any).client.sendPlaintextMessage = mockSendPlaintextMessage;
      (wrapper as any).connected = true; // Simulate connected state
    });

    afterEach(() => {
      wrapper.removeAllListeners();
    });

    it('should send V3 connect request with CONNECT_V3_WITHOUT_CACHE type', async () => {
      const address = 0xcfbf8511b3ea; // Example BLE device address
      const addressType = 0;

      await wrapper.connectBluetoothDeviceService(address, addressType);

      // Verify sendPlaintextMessage was called
      expect(mockSendPlaintextMessage).toHaveBeenCalledTimes(1);
      
      // Verify it was called with the correct message type (68 = BLUETOOTH_DEVICE_REQUEST)
      expect(mockSendPlaintextMessage).toHaveBeenCalledWith(
        68, // BLUETOOTH_DEVICE_REQUEST
        expect.any(Buffer)
      );

      // Decode the payload to verify the fields
      const payload = mockSendPlaintextMessage.mock.calls[0][1] as Buffer;
      
      // Expected payload structure (protobuf encoded):
      // Field 1 (address): tag=(1<<3)|0=0x08, then varint of address
      // Field 2 (request_type): tag=(2<<3)|0=0x10, then varint value 5 (CONNECT_V3_WITHOUT_CACHE)
      // Field 3 (has_address_type): tag=(3<<3)|0=0x18, then varint value 1
      // Field 4 (address_type): tag=(4<<3)|0=0x20, then varint value 0
      
      // Verify that the payload contains field 2 (tag=0x10) with value 5 (0x05)
      // This confirms we're sending CONNECT_V3_WITHOUT_CACHE instead of deprecated CONNECT (0)
      expect(payload.includes(Buffer.from([0x10, 0x05]))).toBe(true);
    });

    it('should throw error when not connected', async () => {
      (wrapper as any).connected = false;

      const address = 0xcfbf8511b3ea;
      const addressType = 0;

      await expect(wrapper.connectBluetoothDeviceService(address, addressType))
        .rejects
        .toThrow('Not connected to ESPHome device');

      // Verify sendPlaintextMessage was not called
      expect(mockSendPlaintextMessage).not.toHaveBeenCalled();
    });
  });

  describe('disconnectBluetoothDeviceService', () => {
    let wrapper: EspHomeClientWrapper;
    let mockSendPlaintextMessage: jest.Mock;

    beforeEach(() => {
      jest.useFakeTimers();
      wrapper = new EspHomeClientWrapper({
        host: 'test.local',
        port: 6053,
      });

      // Mock the sendPlaintextMessage method
      mockSendPlaintextMessage = jest.fn();
      (wrapper as any).client.sendPlaintextMessage = mockSendPlaintextMessage;
      (wrapper as any).connected = true; // Simulate connected state
    });

    afterEach(() => {
      wrapper.removeAllListeners();
      jest.useRealTimers();
    });

    it('should send disconnect request when called', async () => {
      const address = 0xcfbf8511b3ea;

      await wrapper.disconnectBluetoothDeviceService(address);

      // Verify sendPlaintextMessage was called
      expect(mockSendPlaintextMessage).toHaveBeenCalledTimes(1);
      
      // Verify it was called with the correct message type (68 = BLUETOOTH_DEVICE_REQUEST)
      expect(mockSendPlaintextMessage).toHaveBeenCalledWith(
        68, // BLUETOOTH_DEVICE_REQUEST
        expect.any(Buffer)
      );
    });

    it('should debounce rapid disconnect requests for the same device', async () => {
      const address = 0xcfbf8511b3ea;

      // Send first disconnect request
      await wrapper.disconnectBluetoothDeviceService(address);
      expect(mockSendPlaintextMessage).toHaveBeenCalledTimes(1);

      // Send second disconnect request immediately
      await wrapper.disconnectBluetoothDeviceService(address);
      // Should be debounced - still only 1 call
      expect(mockSendPlaintextMessage).toHaveBeenCalledTimes(1);

      // Send third disconnect request immediately
      await wrapper.disconnectBluetoothDeviceService(address);
      // Should still be debounced
      expect(mockSendPlaintextMessage).toHaveBeenCalledTimes(1);
    });

    it('should allow disconnect request after debounce period', async () => {
      const address = 0xcfbf8511b3ea;

      // Send first disconnect request
      await wrapper.disconnectBluetoothDeviceService(address);
      expect(mockSendPlaintextMessage).toHaveBeenCalledTimes(1);

      // Advance time past debounce period (1000ms)
      jest.advanceTimersByTime(1001);

      // Send second disconnect request - should go through
      await wrapper.disconnectBluetoothDeviceService(address);
      expect(mockSendPlaintextMessage).toHaveBeenCalledTimes(2);
    });

    it('should not debounce disconnect requests for different devices', async () => {
      const address1 = 0xcfbf8511b3ea;
      const address2 = 0x123456789abc;

      // Send disconnect for first device
      await wrapper.disconnectBluetoothDeviceService(address1);
      expect(mockSendPlaintextMessage).toHaveBeenCalledTimes(1);

      // Send disconnect for second device - should not be debounced
      await wrapper.disconnectBluetoothDeviceService(address2);
      expect(mockSendPlaintextMessage).toHaveBeenCalledTimes(2);
    });

    it('should throw error when not connected to ESPHome', async () => {
      (wrapper as any).connected = false;

      const address = 0xcfbf8511b3ea;

      await expect(wrapper.disconnectBluetoothDeviceService(address))
        .rejects
        .toThrow('Not connected to ESPHome device');

      // Verify sendPlaintextMessage was not called
      expect(mockSendPlaintextMessage).not.toHaveBeenCalled();
    });
  });

  describe('MAC address filtering', () => {
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

    it('should allow all advertisements when filtering is disabled (empty allowed list)', () => {
      // Don't set any allowed devices - filtering is disabled by default
      const deviceName1 = 'Device1';
      const rawAdData1 = Buffer.concat([
        Buffer.from([deviceName1.length + 1, 0x09]),
        Buffer.from(deviceName1, 'utf8'),
      ]);
      const adMessage1 = encodeBluetoothLERawAdvertisement(111, -50, 0, rawAdData1);

      const deviceName2 = 'Device2';
      const rawAdData2 = Buffer.concat([
        Buffer.from([deviceName2.length + 1, 0x09]),
        Buffer.from(deviceName2, 'utf8'),
      ]);
      const adMessage2 = encodeBluetoothLERawAdvertisement(222, -60, 1, rawAdData2);

      const payload = encodeBluetoothLERawAdvertisementsResponse([adMessage1, adMessage2]);
      (wrapper as any).handleBLERawAdvertisements(payload);

      // Both advertisements should be received
      expect(receivedAdvertisements).toHaveLength(2);
      expect(receivedAdvertisements[0].address).toBe(111);
      expect(receivedAdvertisements[1].address).toBe(222);
    });

    it('should filter out non-allowed devices in handleBLERawAdvertisements', () => {
      // Set allowed devices to only allow address 111
      wrapper.setAllowedDevices([111]);

      const deviceName1 = 'Device1';
      const rawAdData1 = Buffer.concat([
        Buffer.from([deviceName1.length + 1, 0x09]),
        Buffer.from(deviceName1, 'utf8'),
      ]);
      const adMessage1 = encodeBluetoothLERawAdvertisement(111, -50, 0, rawAdData1);

      const deviceName2 = 'Device2';
      const rawAdData2 = Buffer.concat([
        Buffer.from([deviceName2.length + 1, 0x09]),
        Buffer.from(deviceName2, 'utf8'),
      ]);
      const adMessage2 = encodeBluetoothLERawAdvertisement(222, -60, 1, rawAdData2);

      const payload = encodeBluetoothLERawAdvertisementsResponse([adMessage1, adMessage2]);
      (wrapper as any).handleBLERawAdvertisements(payload);

      // Only the allowed device should be received
      expect(receivedAdvertisements).toHaveLength(1);
      expect(receivedAdvertisements[0].address).toBe(111);
      expect(receivedAdvertisements[0].name).toBe('Device1');
    });

    it('should filter out non-allowed devices in handleBLEAdvertisement', () => {
      // Set allowed devices to only allow address 333
      wrapper.setAllowedDevices([333]);

      // Create a legacy advertisement message (message type 67) for allowed device
      const allowedPayload = encodeLegacyBLEAdvertisement(333, 'AllowedDevice', -50, 0);
      (wrapper as any).handleBLEAdvertisement(allowedPayload);

      // Create a legacy advertisement message for non-allowed device
      const blockedPayload = encodeLegacyBLEAdvertisement(444, 'BlockedDevice', -60, 1);
      (wrapper as any).handleBLEAdvertisement(blockedPayload);

      // Only the allowed device should be received
      expect(receivedAdvertisements).toHaveLength(1);
      expect(receivedAdvertisements[0].address).toBe(333);
      expect(receivedAdvertisements[0].name).toBe('AllowedDevice');
    });

    it('should allow multiple configured devices', () => {
      // Set allowed devices to allow both 111 and 222
      wrapper.setAllowedDevices([111, 222]);

      const deviceName1 = 'Device1';
      const rawAdData1 = Buffer.concat([
        Buffer.from([deviceName1.length + 1, 0x09]),
        Buffer.from(deviceName1, 'utf8'),
      ]);
      const adMessage1 = encodeBluetoothLERawAdvertisement(111, -50, 0, rawAdData1);

      const deviceName2 = 'Device2';
      const rawAdData2 = Buffer.concat([
        Buffer.from([deviceName2.length + 1, 0x09]),
        Buffer.from(deviceName2, 'utf8'),
      ]);
      const adMessage2 = encodeBluetoothLERawAdvertisement(222, -60, 1, rawAdData2);

      const deviceName3 = 'Device3';
      const rawAdData3 = Buffer.concat([
        Buffer.from([deviceName3.length + 1, 0x09]),
        Buffer.from(deviceName3, 'utf8'),
      ]);
      const adMessage3 = encodeBluetoothLERawAdvertisement(333, -70, 0, rawAdData3);

      const payload = encodeBluetoothLERawAdvertisementsResponse([adMessage1, adMessage2, adMessage3]);
      (wrapper as any).handleBLERawAdvertisements(payload);

      // Only devices 111 and 222 should be received
      expect(receivedAdvertisements).toHaveLength(2);
      expect(receivedAdvertisements[0].address).toBe(111);
      expect(receivedAdvertisements[1].address).toBe(222);
    });

    it('should allow clearing the filter by setting empty array', () => {
      // Set allowed devices first
      wrapper.setAllowedDevices([111]);

      const deviceName1 = 'Device1';
      const rawAdData1 = Buffer.concat([
        Buffer.from([deviceName1.length + 1, 0x09]),
        Buffer.from(deviceName1, 'utf8'),
      ]);
      const adMessage1 = encodeBluetoothLERawAdvertisement(111, -50, 0, rawAdData1);

      const deviceName2 = 'Device2';
      const rawAdData2 = Buffer.concat([
        Buffer.from([deviceName2.length + 1, 0x09]),
        Buffer.from(deviceName2, 'utf8'),
      ]);
      const adMessage2 = encodeBluetoothLERawAdvertisement(222, -60, 1, rawAdData2);

      let payload = encodeBluetoothLERawAdvertisementsResponse([adMessage1, adMessage2]);
      (wrapper as any).handleBLERawAdvertisements(payload);

      // Only device 111 should be received
      expect(receivedAdvertisements).toHaveLength(1);
      expect(receivedAdvertisements[0].address).toBe(111);

      // Clear the filter
      receivedAdvertisements = [];
      wrapper.setAllowedDevices([]);

      payload = encodeBluetoothLERawAdvertisementsResponse([adMessage1, adMessage2]);
      (wrapper as any).handleBLERawAdvertisements(payload);

      // Both devices should now be received
      expect(receivedAdvertisements).toHaveLength(2);
      expect(receivedAdvertisements[0].address).toBe(111);
      expect(receivedAdvertisements[1].address).toBe(222);
    });
  });

  describe('filtered logger', () => {
    let wrapper: EspHomeClientWrapper;
    let consoleWarnSpy: jest.SpyInstance;

    beforeEach(() => {
      // Spy on console.warn to verify suppression
      consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      wrapper = new EspHomeClientWrapper({
        host: 'test.local',
        port: 6053,
      });
    });

    afterEach(() => {
      wrapper.removeAllListeners();
      consoleWarnSpy.mockRestore();
    });

    it('should suppress warnings for known Bluetooth message types', () => {
      // Get the logger that was passed to EspHomeClient
      const logger = (wrapper as any).client.logger;

      // Test suppression for message type 93 (BLUETOOTH_LE_RAW_ADVERTISEMENTS_RESPONSE)
      logger.warn('Unhandled message type: 93');
      expect(consoleWarnSpy).not.toHaveBeenCalled();

      // Test suppression for message type 69 (BLUETOOTH_DEVICE_CONNECTION_RESPONSE)
      logger.warn('Unhandled message type: 69');
      expect(consoleWarnSpy).not.toHaveBeenCalled();

      // Test suppression for message type 71 (BLUETOOTH_GATT_GET_SERVICES_RESPONSE)
      logger.warn('Unhandled message type: 71');
      expect(consoleWarnSpy).not.toHaveBeenCalled();

      // Test suppression for message type 126 (BLUETOOTH_DEVICE_CLEAR_CACHE_RESPONSE)
      logger.warn('Unhandled message type: 126');
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should not suppress warnings for unknown message types', () => {
      // Get the logger that was passed to EspHomeClient
      const logger = (wrapper as any).client.logger;

      // Test that warnings for non-suppressed message types are still logged
      logger.warn('Unhandled message type: 999');
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unhandled message type: 999')
      );
    });

    it('should not suppress other warning messages', () => {
      // Get the logger that was passed to EspHomeClient
      const logger = (wrapper as any).client.logger;

      // Test that other warnings are not suppressed
      logger.warn('Some other warning message');
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Some other warning message')
      );
    });

    it('should handle warnings with additional arguments', () => {
      // Get the logger that was passed to EspHomeClient
      const logger = (wrapper as any).client.logger;

      // Test that warnings with additional arguments are logged correctly
      logger.warn('Non-Bluetooth warning', { extra: 'data' });
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Non-Bluetooth warning'),
        { extra: 'data' }
      );
    });

    it('should suppress all known Bluetooth message types', () => {
      // Get the logger that was passed to EspHomeClient
      const logger = (wrapper as any).client.logger;

      // Test all the main suppressed message types mentioned in the problem statement
      // These correspond to the BluetoothMessageType enum values that we handle
      const knownTypes = [67, 69, 71, 72, 74, 79, 81, 83, 93, 126];
      
      for (const type of knownTypes) {
        logger.warn(`Unhandled message type: ${type}`);
      }

      // None of these should have been logged
      expect(consoleWarnSpy).not.toHaveBeenCalled();
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

function encodeLegacyBLEAdvertisement(
  address: number,
  name: string,
  rssi: number,
  addressType: number
): Buffer {
  const parts: Buffer[] = [];

  // Field 1: address (uint64, wire type 0)
  parts.push(encodeProtoField(1, 0, encodeVarint(address)));

  // Field 2: name (string, wire type 2 - length-delimited)
  const nameBuffer = Buffer.from(name, 'utf8');
  parts.push(encodeProtoField(2, 2, Buffer.concat([encodeVarint(nameBuffer.length), nameBuffer])));

  // Field 3: rssi (sint32, wire type 0)
  parts.push(encodeProtoField(3, 0, encodeSignedVarint(rssi)));

  // Field 7: address_type (uint32, wire type 0)
  parts.push(encodeProtoField(7, 0, encodeVarint(addressType)));

  return Buffer.concat(parts);
}
