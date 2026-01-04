import { BLEDevice } from './BLEDevice';
import { EspHomeClientWrapper } from '../EspHomeClientWrapper';
import { BLEAdvertisement } from './BLEAdvertisement';

// Mock the EspHomeClientWrapper
jest.mock('../EspHomeClientWrapper');

describe('BLEDevice', () => {
  let mockConnection: jest.Mocked<EspHomeClientWrapper>;
  let advertisement: BLEAdvertisement;
  let bleDevice: BLEDevice;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock connection
    mockConnection = {
      on: jest.fn(),
      off: jest.fn(),
      connectBluetoothDeviceService: jest.fn().mockResolvedValue(undefined),
      disconnectBluetoothDeviceService: jest.fn().mockResolvedValue(undefined),
      pairBluetoothDeviceService: jest.fn().mockResolvedValue({ paired: true }),
    } as any;

    advertisement = {
      name: 'TestDevice',
      address: 0xcfbf8511b3ea,
      rssi: -50,
      addressType: 0,
      manufacturerDataList: [],
      serviceDataList: [],
      serviceUuidsList: [],
    };

    bleDevice = new BLEDevice('TestDevice', advertisement, mockConnection);
  });

  afterEach(() => {
    // Clean up the device to prevent memory leaks
    bleDevice.cleanup();
  });

  describe('connect', () => {
    it('should connect successfully and wait for connection response', async () => {
      // Start the connect promise
      const connectPromise = bleDevice.connect();

      // Get all handlers for BluetoothDeviceConnectionResponse
      // There should be at least 2: auto-reconnect handler (from constructor) and connect handler
      const allHandlers = mockConnection.on.mock.calls
        .filter(call => call[0] === 'message.BluetoothDeviceConnectionResponse')
        .map(call => call[1]);
      
      expect(allHandlers.length).toBeGreaterThanOrEqual(2);
      
      // Trigger successful connection response on all handlers
      allHandlers.forEach(handler => {
        handler({ address: advertisement.address, connected: true });
      });

      // Wait for the promise to resolve
      await connectPromise;

      expect(mockConnection.connectBluetoothDeviceService).toHaveBeenCalledWith(
        advertisement.address,
        advertisement.addressType
      );
      // Note: May be called more than once due to auto-reconnect handler
    });

    it('should reject if connection fails', async () => {
      // Start the connect promise
      const connectPromise = bleDevice.connect();

      // Get all handlers for BluetoothDeviceConnectionResponse
      const allHandlers = mockConnection.on.mock.calls
        .filter(call => call[0] === 'message.BluetoothDeviceConnectionResponse')
        .map(call => call[1]);
      
      // Trigger failed connection response on all handlers
      allHandlers.forEach(handler => {
        handler({ address: advertisement.address, connected: false, error: 1 });
      });

      // Wait for the promise to reject
      await expect(connectPromise).rejects.toThrow('Connection failed for device cfbf8511b3ea: error code 1');
    });

    it('should timeout if no response received', async () => {
      jest.useFakeTimers();
      
      // Start the connect promise
      const connectPromise = bleDevice.connect();

      // Fast-forward time by 10 seconds
      jest.advanceTimersByTime(10000);

      // Wait for the promise to reject
      await expect(connectPromise).rejects.toThrow('Connection timeout for device cfbf8511b3ea');
      
      jest.useRealTimers();
    });

    it('should return immediately if already connected', async () => {
      // First connect
      const connectPromise1 = bleDevice.connect();
      const allHandlers = mockConnection.on.mock.calls
        .filter(call => call[0] === 'message.BluetoothDeviceConnectionResponse')
        .map(call => call[1]);
      allHandlers.forEach(handler => {
        handler({ address: advertisement.address, connected: true });
      });
      await connectPromise1;

      // Clear mock calls
      mockConnection.connectBluetoothDeviceService.mockClear();

      // Second connect should return immediately
      await bleDevice.connect();
      expect(mockConnection.connectBluetoothDeviceService).not.toHaveBeenCalled();
    });
  });

  describe('disconnect', () => {
    it('should disconnect successfully', async () => {
      await bleDevice.disconnect();
      
      expect(mockConnection.disconnectBluetoothDeviceService).toHaveBeenCalledWith(advertisement.address);
    });
  });

  describe('cleanup', () => {
    it('should be callable without errors', () => {
      // Call cleanup - should not throw
      expect(() => bleDevice.cleanup()).not.toThrow();
    });

    it('should remove auto-reconnect listener', () => {
      // Get the auto-reconnect handler that was registered
      const autoReconnectCall = mockConnection.on.mock.calls.find(
        call => call[0] === 'message.BluetoothDeviceConnectionResponse'
      );
      expect(autoReconnectCall).toBeDefined();
      const autoReconnectHandler = autoReconnectCall![1];

      // Call cleanup
      bleDevice.cleanup();

      // Verify the auto-reconnect listener was removed
      expect(mockConnection.off).toHaveBeenCalledWith(
        'message.BluetoothDeviceConnectionResponse',
        autoReconnectHandler
      );
    });
  });

  describe('auto-reconnect', () => {
    it('should register auto-reconnect handler in constructor', () => {
      // Verify that the auto-reconnect handler was registered
      const autoReconnectCalls = mockConnection.on.mock.calls.filter(
        call => call[0] === 'message.BluetoothDeviceConnectionResponse'
      );
      
      // Should have at least one handler registered for auto-reconnect
      expect(autoReconnectCalls.length).toBeGreaterThanOrEqual(1);
      expect(autoReconnectCalls[0][0]).toBe('message.BluetoothDeviceConnectionResponse');
      expect(autoReconnectCalls[0][1]).toBeInstanceOf(Function);
    });
  });

  describe('writeCharacteristic', () => {
    beforeEach(() => {
      mockConnection.writeBluetoothGATTCharacteristicService = jest.fn().mockResolvedValue(undefined);
    });

    it('should write successfully', async () => {
      // Write characteristic directly (no auto-connect)
      const testData = new Uint8Array([0x01, 0x02, 0x03]);
      await bleDevice.writeCharacteristic(10, testData);

      expect(mockConnection.writeBluetoothGATTCharacteristicService).toHaveBeenCalledWith(
        advertisement.address,
        10,
        testData,
        true
      );
    });

    it('should write successfully with response=false', async () => {
      // Write characteristic with custom response parameter
      const testData = new Uint8Array([0x01, 0x02, 0x03]);
      await bleDevice.writeCharacteristic(10, testData, false);

      expect(mockConnection.writeBluetoothGATTCharacteristicService).toHaveBeenCalledWith(
        advertisement.address,
        10,
        testData,
        false
      );
    });
  });
});
