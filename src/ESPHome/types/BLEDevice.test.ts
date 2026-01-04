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

      // Simulate the connection response
      const onCall = mockConnection.on.mock.calls.find(call => call[0] === 'message.BluetoothDeviceConnectionResponse');
      expect(onCall).toBeDefined();
      const connectionHandler = onCall![1];
      
      // Trigger successful connection response
      connectionHandler({ address: advertisement.address, connected: true });

      // Wait for the promise to resolve
      await connectPromise;

      expect(mockConnection.connectBluetoothDeviceService).toHaveBeenCalledWith(
        advertisement.address,
        advertisement.addressType
      );
      expect(mockConnection.connectBluetoothDeviceService).toHaveBeenCalledTimes(1);
      expect(mockConnection.off).toHaveBeenCalledWith('message.BluetoothDeviceConnectionResponse', connectionHandler);
    });

    it('should reject if connection fails', async () => {
      // Start the connect promise
      const connectPromise = bleDevice.connect();

      // Simulate the connection response with error
      const onCall = mockConnection.on.mock.calls.find(call => call[0] === 'message.BluetoothDeviceConnectionResponse');
      const connectionHandler = onCall![1];
      
      // Trigger failed connection response
      connectionHandler({ address: advertisement.address, connected: false, error: 1 });

      // Wait for the promise to reject
      await expect(connectPromise).rejects.toThrow('Connection failed for device cfbf8511b3ea: error code 1');
      expect(mockConnection.off).toHaveBeenCalledWith('message.BluetoothDeviceConnectionResponse', connectionHandler);
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
      const onCall = mockConnection.on.mock.calls.find(call => call[0] === 'message.BluetoothDeviceConnectionResponse');
      const connectionHandler = onCall![1];
      connectionHandler({ address: advertisement.address, connected: true });
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
