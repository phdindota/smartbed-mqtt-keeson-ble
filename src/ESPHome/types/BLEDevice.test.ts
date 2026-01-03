import { BLEDevice } from './BLEDevice';
import { EspHomeClientWrapper } from '../EspHomeClientWrapper';
import { BLEAdvertisement } from './BLEAdvertisement';

// Mock the EspHomeClientWrapper
jest.mock('../EspHomeClientWrapper');

// Mock the logger
jest.mock('@utils/logger', () => ({
  logInfo: jest.fn(),
  logWarn: jest.fn(),
  logError: jest.fn(),
}));

describe('BLEDevice', () => {
  let mockConnection: jest.Mocked<EspHomeClientWrapper>;
  let advertisement: BLEAdvertisement;
  let bleDevice: BLEDevice;
  let connectionResponseHandler: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Create mock connection
    mockConnection = {
      on: jest.fn((event, handler) => {
        if (event === 'message.BluetoothDeviceConnectionResponse') {
          connectionResponseHandler = handler;
        }
      }),
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
    jest.useRealTimers();
  });

  describe('connect', () => {
    it('should connect successfully on first attempt', async () => {
      const connectPromise = bleDevice.connect();
      
      // Simulate successful connection response
      connectionResponseHandler({ address: advertisement.address, connected: true });
      
      await connectPromise;

      expect(mockConnection.connectBluetoothDeviceService).toHaveBeenCalledWith(
        advertisement.address,
        advertisement.addressType
      );
      expect(mockConnection.connectBluetoothDeviceService).toHaveBeenCalledTimes(1);
    });

    it('should prevent multiple simultaneous connection attempts', async () => {
      const connectPromise1 = bleDevice.connect();
      const connectPromise2 = bleDevice.connect();

      // Simulate successful connection response
      connectionResponseHandler({ address: advertisement.address, connected: true });

      await Promise.all([connectPromise1, connectPromise2]);

      // Should only call connectBluetoothDeviceService once
      expect(mockConnection.connectBluetoothDeviceService).toHaveBeenCalledTimes(1);
    });

    it('should not reconnect when already connected', async () => {
      // First connection
      const connectPromise1 = bleDevice.connect();
      connectionResponseHandler({ address: advertisement.address, connected: true });
      await connectPromise1;

      // Second connection attempt
      await bleDevice.connect();

      // Should only call connectBluetoothDeviceService once (for first connection)
      expect(mockConnection.connectBluetoothDeviceService).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure with exponential backoff', async () => {
      mockConnection.connectBluetoothDeviceService.mockRejectedValueOnce(
        new Error('Connection failed')
      );

      const connectPromise = bleDevice.connect();
      await connectPromise;

      // Should have called connectBluetoothDeviceService once and failed
      expect(mockConnection.connectBluetoothDeviceService).toHaveBeenCalledTimes(1);

      // Advance timer by initial retry delay (1000ms)
      jest.advanceTimersByTime(1000);

      // Should have called connectBluetoothDeviceService again (retry)
      await Promise.resolve(); // Allow microtasks to execute
      expect(mockConnection.connectBluetoothDeviceService).toHaveBeenCalledTimes(2);
    });

    it('should stop retrying after maximum attempts', async () => {
      mockConnection.connectBluetoothDeviceService.mockRejectedValue(
        new Error('Connection failed')
      );

      // First attempt
      await bleDevice.connect();
      expect(mockConnection.connectBluetoothDeviceService).toHaveBeenCalledTimes(1);

      // Trigger retries
      jest.advanceTimersByTime(1000); // Retry 1 (delay: 1s)
      await Promise.resolve();
      expect(mockConnection.connectBluetoothDeviceService).toHaveBeenCalledTimes(2);

      jest.advanceTimersByTime(2000); // Retry 2 (delay: 2s)
      await Promise.resolve();
      expect(mockConnection.connectBluetoothDeviceService).toHaveBeenCalledTimes(3);

      // Should not retry after 3rd attempt
      jest.advanceTimersByTime(10000);
      await Promise.resolve();
      expect(mockConnection.connectBluetoothDeviceService).toHaveBeenCalledTimes(3);

      // Fourth attempt should be prevented
      await bleDevice.connect();
      expect(mockConnection.connectBluetoothDeviceService).toHaveBeenCalledTimes(3);
    });

    it('should handle connection timeout', async () => {
      // Don't send connection response
      const connectPromise = bleDevice.connect();
      
      // Advance timer by timeout duration (10 seconds)
      jest.advanceTimersByTime(10000);
      
      await connectPromise;
      
      expect(mockConnection.connectBluetoothDeviceService).toHaveBeenCalledTimes(1);
    });

    it('should reset retry counter on successful connection', async () => {
      mockConnection.connectBluetoothDeviceService
        .mockRejectedValueOnce(new Error('Connection failed'))
        .mockRejectedValueOnce(new Error('Connection failed'))
        .mockResolvedValue(undefined);

      // First attempt - fails
      await bleDevice.connect();
      expect(mockConnection.connectBluetoothDeviceService).toHaveBeenCalledTimes(1);

      // Retry 1 - fails
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
      expect(mockConnection.connectBluetoothDeviceService).toHaveBeenCalledTimes(2);

      // Retry 2 - succeeds
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
      expect(mockConnection.connectBluetoothDeviceService).toHaveBeenCalledTimes(3);

      // Simulate successful connection response
      connectionResponseHandler({ address: advertisement.address, connected: true });
      await Promise.resolve();

      // Now disconnect and try connecting again - should allow connection
      await bleDevice.disconnect();
      
      // Clear previous calls
      mockConnection.connectBluetoothDeviceService.mockClear();
      
      // New connection should work
      await bleDevice.connect();
      expect(mockConnection.connectBluetoothDeviceService).toHaveBeenCalledTimes(1);
    });
  });

  describe('disconnect', () => {
    it('should clear connection state and stop retries', async () => {
      mockConnection.connectBluetoothDeviceService.mockRejectedValue(
        new Error('Connection failed')
      );

      // Start connection attempt
      await bleDevice.connect();

      // Disconnect before retry
      await bleDevice.disconnect();

      // Clear previous calls
      mockConnection.connectBluetoothDeviceService.mockClear();

      // Advance timers - should not retry
      jest.advanceTimersByTime(5000);
      await Promise.resolve();

      expect(mockConnection.connectBluetoothDeviceService).not.toHaveBeenCalled();
    });
  });

  describe('BluetoothDeviceConnectionResponse handler', () => {
    it('should not trigger auto-reconnect on disconnect', async () => {
      // Connect successfully
      const connectPromise = bleDevice.connect();
      connectionResponseHandler({ address: advertisement.address, connected: true });
      await connectPromise;

      // Clear previous calls
      mockConnection.connectBluetoothDeviceService.mockClear();

      // Simulate disconnect response
      connectionResponseHandler({ address: advertisement.address, connected: false });
      await Promise.resolve();

      // Should NOT automatically reconnect
      expect(mockConnection.connectBluetoothDeviceService).not.toHaveBeenCalled();
    });

    it('should ignore connection responses for other devices', async () => {
      // Simulate connection response for a different device
      connectionResponseHandler({ address: 0x123456, connected: true });
      await Promise.resolve();

      // Should not update state
      expect(mockConnection.connectBluetoothDeviceService).not.toHaveBeenCalled();
    });
  });
});
