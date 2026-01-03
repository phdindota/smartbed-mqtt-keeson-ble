import { EspHomeClientWrapper } from './EspHomeClientWrapper';
import { mock } from 'jest-mock-extended';
import { ESPConnection } from './ESPConnection';
import { BLEAdvertisement } from './types/BLEAdvertisement';

// Mock esphome-client
jest.mock('esphome-client');

describe(ESPConnection.name, () => {
  describe('getBLEDevices', () => {
    it('should skip devices with empty metadata and wait for complete advertisement', async () => {
      const mockConnection = mock<EspHomeClientWrapper>();
      let advertisementListener: ((ad: BLEAdvertisement) => void) | undefined;

      mockConnection.on.mockImplementation((event: string | symbol, listener: any) => {
        if (event === 'message.BluetoothLEAdvertisementResponse') {
          advertisementListener = listener;
        }
        return mockConnection;
      });

      mockConnection.subscribeBluetoothAdvertisementService.mockReturnValue(undefined);
      mockConnection.off.mockReturnValue(mockConnection);

      const espConnection = new ESPConnection([mockConnection]);

      // Start the device search in background
      const searchPromise = espConnection.getBLEDevices(['ksbt03c101071926']);

      // Wait a bit for the listener to be set up
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(advertisementListener).toBeDefined();

      // Simulate first advertisement with empty metadata (this should be skipped)
      const emptyAdvertisement: BLEAdvertisement = {
        name: 'KSBT03C101071926',
        address: 228421478233066,
        rssi: -50,
        manufacturerDataList: [],
        serviceDataList: [],
        serviceUuidsList: [],
        addressType: 0,
      };

      advertisementListener!(emptyAdvertisement);

      // Wait a bit to ensure the empty advertisement was processed
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Simulate second advertisement with complete metadata (this should be accepted)
      const completeAdvertisement: BLEAdvertisement = {
        name: 'KSBT03C101071926',
        address: 228421478233066,
        rssi: -50,
        manufacturerDataList: [],
        serviceDataList: [],
        serviceUuidsList: ['6e400001-b5a3-f393-e0a9-e50e24dcca9e'],
        addressType: 0,
      };

      advertisementListener!(completeAdvertisement);

      const devices = await searchPromise;

      expect(devices).toHaveLength(1);
      expect(devices[0].name).toBe('KSBT03C101071926');
      expect(devices[0].advertisement.serviceUuidsList).toContain('6e400001-b5a3-f393-e0a9-e50e24dcca9e');
    });

    it('should accept devices with manufacturer data even if service UUIDs are empty', async () => {
      const mockConnection = mock<EspHomeClientWrapper>();
      let advertisementListener: ((ad: BLEAdvertisement) => void) | undefined;

      mockConnection.on.mockImplementation((event: string | symbol, listener: any) => {
        if (event === 'message.BluetoothLEAdvertisementResponse') {
          advertisementListener = listener;
        }
        return mockConnection;
      });

      mockConnection.subscribeBluetoothAdvertisementService.mockReturnValue(undefined);
      mockConnection.off.mockReturnValue(mockConnection);

      const espConnection = new ESPConnection([mockConnection]);

      const searchPromise = espConnection.getBLEDevices(['base-i5.test']);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(advertisementListener).toBeDefined();

      // Advertisement with manufacturer data but no service UUIDs
      const advertisement: BLEAdvertisement = {
        name: 'base-i5.test',
        address: 123456789,
        rssi: -60,
        manufacturerDataList: [
          {
            uuid: '1234',
            legacyDataList: new Uint8Array([1, 2, 3]),
            data: '010203',
          },
        ],
        serviceDataList: [],
        serviceUuidsList: [],
        addressType: 0,
      };

      advertisementListener!(advertisement);

      const devices = await searchPromise;

      expect(devices).toHaveLength(1);
      expect(devices[0].name).toBe('base-i5.test');
      expect(devices[0].advertisement.manufacturerDataList).toHaveLength(1);
    });

    it('should accept devices with service UUIDs even if manufacturer data is empty', async () => {
      const mockConnection = mock<EspHomeClientWrapper>();
      let advertisementListener: ((ad: BLEAdvertisement) => void) | undefined;

      mockConnection.on.mockImplementation((event: string | symbol, listener: any) => {
        if (event === 'message.BluetoothLEAdvertisementResponse') {
          advertisementListener = listener;
        }
        return mockConnection;
      });

      mockConnection.subscribeBluetoothAdvertisementService.mockReturnValue(undefined);
      mockConnection.off.mockReturnValue(mockConnection);

      const espConnection = new ESPConnection([mockConnection]);

      const searchPromise = espConnection.getBLEDevices(['ksbt03c101071926']);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(advertisementListener).toBeDefined();

      // Advertisement with service UUIDs but no manufacturer data
      const advertisement: BLEAdvertisement = {
        name: 'KSBT03C101071926',
        address: 228421478233066,
        rssi: -50,
        manufacturerDataList: [],
        serviceDataList: [],
        serviceUuidsList: ['6e400001-b5a3-f393-e0a9-e50e24dcca9e'],
        addressType: 0,
      };

      advertisementListener!(advertisement);

      const devices = await searchPromise;

      expect(devices).toHaveLength(1);
      expect(devices[0].name).toBe('KSBT03C101071926');
      expect(devices[0].advertisement.serviceUuidsList).toContain('6e400001-b5a3-f393-e0a9-e50e24dcca9e');
    });
  });
});
