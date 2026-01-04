import { BLEDevice } from './BLEDevice';
import { EspHomeClientWrapper } from '../EspHomeClientWrapper';
import { BLEAdvertisement } from './BLEAdvertisement';

// Mock the EspHomeClientWrapper
jest.mock('../EspHomeClientWrapper');

describe('BLEDevice', () => {
  let mockConnection: jest.Mocked<EspHomeClientWrapper>;
  let advertisement: BLEAdvertisement;
  let bleDevice: BLEDevice;
  let connectionResponseHandler: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock connection
    mockConnection = {
      on: jest.fn((event, handler) => {
        if (event === 'message.BluetoothDeviceConnectionResponse') {
          connectionResponseHandler = handler;
        }
      }),
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
    it('should connect successfully', async () => {
      await bleDevice.connect();

      expect(mockConnection.connectBluetoothDeviceService).toHaveBeenCalledWith(
        advertisement.address,
        advertisement.addressType
      );
      expect(mockConnection.connectBluetoothDeviceService).toHaveBeenCalledTimes(1);
    });
  });

  describe('disconnect', () => {
    it('should disconnect successfully', async () => {
      await bleDevice.disconnect();
      
      expect(mockConnection.disconnectBluetoothDeviceService).toHaveBeenCalledWith(advertisement.address);
    });
  });

  describe('cleanup', () => {
    it('should remove event listener to prevent memory leaks', () => {
      // Call cleanup
      bleDevice.cleanup();
      
      // Verify that the event listener was removed
      expect(mockConnection.off).toHaveBeenCalledWith(
        'message.BluetoothDeviceConnectionResponse',
        expect.any(Function)
      );
    });
  });

  describe('BluetoothDeviceConnectionResponse handler', () => {
    it('should auto-reconnect on unexpected disconnect', async () => {
      // First, actually connect the device
      await bleDevice.connect();

      // Clear previous calls
      mockConnection.connectBluetoothDeviceService.mockClear();

      // Simulate disconnect response (connected state changes from true to false)
      connectionResponseHandler({ address: advertisement.address, connected: false });
      await Promise.resolve();

      // Should automatically reconnect
      expect(mockConnection.connectBluetoothDeviceService).toHaveBeenCalledWith(
        advertisement.address,
        advertisement.addressType
      );
    });

    it('should ignore connection responses for other devices', async () => {
      // Simulate connection response for a different device
      connectionResponseHandler({ address: 0x123456, connected: true });
      await Promise.resolve();

      // Should not call connect
      expect(mockConnection.connectBluetoothDeviceService).not.toHaveBeenCalled();
    });

    it('should not reconnect if already in the same connection state', async () => {
      // Device starts disconnected (connected = false)
      // Simulate another disconnect response (connected = false)
      connectionResponseHandler({ address: advertisement.address, connected: false });
      await Promise.resolve();

      // Should not reconnect since already disconnected
      expect(mockConnection.connectBluetoothDeviceService).not.toHaveBeenCalled();
    });
  });
});
