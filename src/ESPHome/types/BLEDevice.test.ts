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
      isConnected: true, // Default to connected
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

      // Get the connection handler registered during connect()
      const allHandlers = mockConnection.on.mock.calls
        .filter(call => call[0] === 'message.BluetoothDeviceConnectionResponse')
        .map(call => call[1]);
      
      expect(allHandlers.length).toBeGreaterThanOrEqual(1);
      
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

    it('should remove event listeners', () => {
      // Get the GATT error handler that was registered
      const gattErrorCall = mockConnection.on.mock.calls.find(
        call => call[0] === 'message.BluetoothGATTErrorResponse'
      );
      expect(gattErrorCall).toBeDefined();
      const gattErrorHandler = gattErrorCall![1];

      // Get the device disconnected handler that was registered
      const disconnectedCall = mockConnection.on.mock.calls.find(
        call => call[0] === 'deviceDisconnected'
      );
      expect(disconnectedCall).toBeDefined();
      const disconnectedHandler = disconnectedCall![1];

      // Call cleanup
      bleDevice.cleanup();

      // Verify the listeners were removed
      expect(mockConnection.off).toHaveBeenCalledWith(
        'message.BluetoothGATTErrorResponse',
        gattErrorHandler
      );
      expect(mockConnection.off).toHaveBeenCalledWith(
        'deviceDisconnected',
        disconnectedHandler
      );
    });
  });

  describe('connect with connection validity check', () => {
    it('should reject if underlying ESPHome connection is not active', async () => {
      // Set connection as not connected
      (mockConnection as any).isConnected = false;

      await expect(bleDevice.connect()).rejects.toThrow('Cannot connect to device cfbf8511b3ea - ESPHome connection is not active');
    });

    it('should proceed if underlying ESPHome connection is active', async () => {
      // Set connection as connected
      (mockConnection as any).isConnected = true;

      // Start the connect promise
      const connectPromise = bleDevice.connect();

      // Get all handlers for BluetoothDeviceConnectionResponse
      const allHandlers = mockConnection.on.mock.calls
        .filter(call => call[0] === 'message.BluetoothDeviceConnectionResponse')
        .map(call => call[1]);

      // Trigger successful connection response on all handlers
      allHandlers.forEach(handler => {
        handler({ address: advertisement.address, connected: true });
      });

      // Wait for the promise to resolve
      await connectPromise;

      expect(mockConnection.connectBluetoothDeviceService).toHaveBeenCalled();
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

  describe('updateConnection', () => {
    it('should update connection reference and re-register event listeners', () => {
      const newConnection: jest.Mocked<EspHomeClientWrapper> = {
        on: jest.fn(),
        off: jest.fn(),
        connectBluetoothDeviceService: jest.fn().mockResolvedValue(undefined),
        disconnectBluetoothDeviceService: jest.fn().mockResolvedValue(undefined),
        pairBluetoothDeviceService: jest.fn().mockResolvedValue({ paired: true }),
      } as any;

      // Get handlers registered on old connection
      const oldGattErrorHandler = mockConnection.on.mock.calls.find(
        call => call[0] === 'message.BluetoothGATTErrorResponse'
      )?.[1];
      const oldDisconnectedHandler = mockConnection.on.mock.calls.find(
        call => call[0] === 'deviceDisconnected'
      )?.[1];

      // Update connection
      bleDevice.updateConnection(newConnection);

      // Verify old connection listeners were removed
      expect(mockConnection.off).toHaveBeenCalledWith('message.BluetoothGATTErrorResponse', oldGattErrorHandler);
      expect(mockConnection.off).toHaveBeenCalledWith('deviceDisconnected', oldDisconnectedHandler);

      // Verify new connection has listeners registered
      expect(newConnection.on).toHaveBeenCalledWith('message.BluetoothGATTErrorResponse', expect.any(Function));
      expect(newConnection.on).toHaveBeenCalledWith('deviceDisconnected', expect.any(Function));
    });

    it('should reset connection state when updating connection', () => {
      const newConnection: jest.Mocked<EspHomeClientWrapper> = {
        on: jest.fn(),
        off: jest.fn(),
      } as any;

      // Manually set connected state (simulating a connected device)
      (bleDevice as any).connected = true;
      (bleDevice as any).connecting = true;

      // Update connection
      bleDevice.updateConnection(newConnection);

      // Verify connection state was reset
      expect((bleDevice as any).connected).toBe(false);
      expect((bleDevice as any).connecting).toBe(false);
    });
  });
});
