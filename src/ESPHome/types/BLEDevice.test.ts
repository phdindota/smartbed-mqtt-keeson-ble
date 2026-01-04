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
  let mockIsConnected: boolean;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockIsConnected = true;

    // Create mock connection
    mockConnection = {
      on: jest.fn((event, handler) => {
        if (event === 'message.BluetoothDeviceConnectionResponse') {
          connectionResponseHandler = handler;
        }
      }),
      off: jest.fn(),
      get isConnected() { return mockIsConnected; }, // Mock ESPHome as connected
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

      // Wait a bit for the second promise to start waiting
      await Promise.resolve();
      
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
      mockConnection.connectBluetoothDeviceService.mockRejectedValue(
        new Error('Connection failed')
      );

      const connectPromise = bleDevice.connect();
      
      // Wait for first attempt to fail
      await Promise.resolve();
      
      // Should have called connectBluetoothDeviceService once and failed
      expect(mockConnection.connectBluetoothDeviceService).toHaveBeenCalledTimes(1);

      // Advance timer by initial retry delay (500ms)
      jest.advanceTimersByTime(500);

      // Should have called connectBluetoothDeviceService again (retry)
      await Promise.resolve(); // Allow microtasks to execute
      expect(mockConnection.connectBluetoothDeviceService).toHaveBeenCalledTimes(2);
      
      // Advance timer by second retry delay (1000ms)
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
      expect(mockConnection.connectBluetoothDeviceService).toHaveBeenCalledTimes(3);
      
      // Advance timer by third retry delay (2000ms)
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
      expect(mockConnection.connectBluetoothDeviceService).toHaveBeenCalledTimes(4);
      
      // Advance timer by fourth retry delay (4000ms)
      jest.advanceTimersByTime(4000);
      await Promise.resolve();
      expect(mockConnection.connectBluetoothDeviceService).toHaveBeenCalledTimes(5);
      
      // After 5th attempt, should reject with maximum attempts error
      await expect(connectPromise).rejects.toThrow('Maximum connection attempts');
    });

    it('should stop retrying after maximum attempts', async () => {
      mockConnection.connectBluetoothDeviceService.mockRejectedValue(
        new Error('Connection failed')
      );

      const connectPromise = bleDevice.connect();
      
      // First attempt - should not reject yet, should schedule retry
      await Promise.resolve();
      expect(mockConnection.connectBluetoothDeviceService).toHaveBeenCalledTimes(1);

      // Trigger retry 1 (delay: 500ms)
      jest.advanceTimersByTime(500);
      await Promise.resolve();
      expect(mockConnection.connectBluetoothDeviceService).toHaveBeenCalledTimes(2);

      // Trigger retry 2 (delay: 1000ms)
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
      expect(mockConnection.connectBluetoothDeviceService).toHaveBeenCalledTimes(3);

      // Trigger retry 3 (delay: 2000ms)
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
      expect(mockConnection.connectBluetoothDeviceService).toHaveBeenCalledTimes(4);

      // Trigger retry 4 (delay: 4000ms)
      jest.advanceTimersByTime(4000);
      await Promise.resolve();
      expect(mockConnection.connectBluetoothDeviceService).toHaveBeenCalledTimes(5);

      // After 5th attempt, should reject and not retry anymore
      await expect(connectPromise).rejects.toThrow('Maximum connection attempts');
      
      // Should not retry after maximum attempts reached
      jest.advanceTimersByTime(10000);
      await Promise.resolve();
      expect(mockConnection.connectBluetoothDeviceService).toHaveBeenCalledTimes(5);

      // Sixth attempt should be prevented with error
      await expect(bleDevice.connect()).rejects.toThrow('Maximum connection attempts');
      expect(mockConnection.connectBluetoothDeviceService).toHaveBeenCalledTimes(5);
    });

    it('should handle connection timeout and retry', async () => {
      // Don't send connection response to trigger timeout
      const connectPromise = bleDevice.connect();
      
      // Advance timer by timeout duration (5 seconds)
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
      
      expect(mockConnection.connectBluetoothDeviceService).toHaveBeenCalledTimes(1);
      
      // Advance timer by retry delay (500ms) to trigger retry
      jest.advanceTimersByTime(500);
      await Promise.resolve();
      
      // Should have retried
      expect(mockConnection.connectBluetoothDeviceService).toHaveBeenCalledTimes(2);
      
      // Now send a successful connection response for the retry
      connectionResponseHandler({ address: advertisement.address, connected: true });
      
      // Should resolve successfully
      await connectPromise;
      expect(mockConnection.connectBluetoothDeviceService).toHaveBeenCalledTimes(2);
    });

    it('should reset retry counter on successful connection', async () => {
      mockConnection.connectBluetoothDeviceService
        .mockRejectedValueOnce(new Error('Connection failed'))
        .mockRejectedValueOnce(new Error('Connection failed'))
        .mockResolvedValue(undefined);

      const connectPromise = bleDevice.connect();
      
      // First attempt - fails, schedules retry
      await Promise.resolve();
      expect(mockConnection.connectBluetoothDeviceService).toHaveBeenCalledTimes(1);

      // Retry 1 - fails (delay: 500ms)
      jest.advanceTimersByTime(500);
      await Promise.resolve();
      expect(mockConnection.connectBluetoothDeviceService).toHaveBeenCalledTimes(2);

      // Retry 2 - succeeds (service call doesn't throw) (delay: 1000ms)
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
      expect(mockConnection.connectBluetoothDeviceService).toHaveBeenCalledTimes(3);

      // Simulate successful connection response
      connectionResponseHandler({ address: advertisement.address, connected: true });
      await connectPromise; // Should resolve now

      // Now disconnect and try connecting again - should allow connection
      await bleDevice.disconnect();
      
      // Clear previous calls
      mockConnection.connectBluetoothDeviceService.mockClear();
      
      // New connection should work
      const newConnectPromise = bleDevice.connect();
      connectionResponseHandler({ address: advertisement.address, connected: true });
      await newConnectPromise;
      expect(mockConnection.connectBluetoothDeviceService).toHaveBeenCalledTimes(1);
    });
  });

  describe('disconnect', () => {
    it('should clear connection state and stop retries', async () => {
      mockConnection.connectBluetoothDeviceService.mockRejectedValue(
        new Error('Connection failed')
      );

      // Start connection attempt
      const connectPromise = bleDevice.connect();
      await Promise.resolve();

      // Disconnect before retry - this should reject the connection promise
      await bleDevice.disconnect();
      
      // The connect promise should be rejected with 'Disconnected'
      await expect(connectPromise).rejects.toThrow('Disconnected');

      // Clear previous calls
      mockConnection.connectBluetoothDeviceService.mockClear();

      // Advance timers - should not retry
      jest.advanceTimersByTime(5000);
      await Promise.resolve();

      expect(mockConnection.connectBluetoothDeviceService).not.toHaveBeenCalled();
    });

    it('should not send disconnect request if already disconnected', async () => {
      // Device is not connected (initial state)
      await bleDevice.disconnect();
      
      // Should not send disconnect request
      expect(mockConnection.disconnectBluetoothDeviceService).not.toHaveBeenCalled();
    });

    it('should not send disconnect request if ESPHome is not connected', async () => {
      // Connect the device first
      const connectPromise = bleDevice.connect();
      connectionResponseHandler({ address: advertisement.address, connected: true });
      await connectPromise;
      
      // Clear the mock
      mockConnection.disconnectBluetoothDeviceService.mockClear();
      
      // Simulate ESPHome disconnection
      mockIsConnected = false;
      
      // Try to disconnect
      await bleDevice.disconnect();
      
      // Should not send disconnect request to ESPHome
      expect(mockConnection.disconnectBluetoothDeviceService).not.toHaveBeenCalled();
    });

    it('should send disconnect request when connected and ESPHome is connected', async () => {
      // Connect the device first
      const connectPromise = bleDevice.connect();
      connectionResponseHandler({ address: advertisement.address, connected: true });
      await connectPromise;
      
      // Clear the mock
      mockConnection.disconnectBluetoothDeviceService.mockClear();
      
      // Disconnect
      await bleDevice.disconnect();
      
      // Should send disconnect request
      expect(mockConnection.disconnectBluetoothDeviceService).toHaveBeenCalledWith(advertisement.address);
    });
  });

  describe('cleanup', () => {
    it('should remove event listener to prevent memory leaks', () => {
      // Mock the off method
      mockConnection.off = jest.fn();
      
      // Call cleanup
      bleDevice.cleanup();
      
      // Verify that the event listener was removed
      expect(mockConnection.off).toHaveBeenCalledWith(
        'message.BluetoothDeviceConnectionResponse',
        expect.any(Function)
      );
    });

    it('should clear pending timeouts', async () => {
      // Start a connection that will timeout
      void bleDevice.connect();
      
      // Cleanup before timeout
      bleDevice.cleanup();
      
      // Advance timers - should not trigger timeout handler since cleanup was called
      jest.advanceTimersByTime(15000);
      await Promise.resolve();
      
      // The connection should still be pending or rejected (not resolved)
      // We just verify no errors are thrown
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
