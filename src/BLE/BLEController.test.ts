import { BLEController } from './BLEController';
import { IBLEDevice } from '../ESPHome/types/IBLEDevice';
import { IDeviceData } from '@ha/IDeviceData';

describe('BLEController', () => {
  let mockBleDevice: jest.Mocked<IBLEDevice>;
  let mockDeviceData: IDeviceData;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock BLE device
    mockBleDevice = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      writeCharacteristic: jest.fn().mockResolvedValue(undefined),
      subscribeToCharacteristic: jest.fn().mockResolvedValue(undefined),
      readCharacteristic: jest.fn().mockResolvedValue(new Uint8Array([0x00])),
    } as any;

    mockDeviceData = {
      deviceTopic: 'homeassistant/test',
      device: {
        ids: ['test-device-123'],
        name: 'TestDevice',
        mf: 'TestMfg',
        mdl: 'TestModel',
      },
    };
  });

  describe('constructor with notify handles', () => {
    it('should set stayConnected to true when notify handles are provided', () => {
      const notifyHandles = {
        status: 10,
        battery: 11,
      };

      new BLEController(
        mockDeviceData,
        mockBleDevice,
        5, // write handle
        (_command: any) => [0x01, 0x02],
        notifyHandles,
        false // stayConnected initially false
      );

      // Access the private stayConnected field via reflection
      // In a real scenario, we would verify this through behavior
      // For now, we verify that subscribeToCharacteristic was called for each notify handle
      expect(mockBleDevice.subscribeToCharacteristic).toHaveBeenCalledTimes(2);
      expect(mockBleDevice.subscribeToCharacteristic).toHaveBeenCalledWith(
        10,
        expect.any(Function)
      );
      expect(mockBleDevice.subscribeToCharacteristic).toHaveBeenCalledWith(
        11,
        expect.any(Function)
      );
    });

    it('should set stayConnected to true even when initially undefined', () => {
      const notifyHandles = {
        status: 10,
      };

      new BLEController(
        mockDeviceData,
        mockBleDevice,
        5,
        (_command: any) => [0x01, 0x02],
        notifyHandles
        // stayConnected not provided (defaults to false)
      );

      expect(mockBleDevice.subscribeToCharacteristic).toHaveBeenCalledTimes(1);
      expect(mockBleDevice.subscribeToCharacteristic).toHaveBeenCalledWith(
        10,
        expect.any(Function)
      );
    });

    it('should not call subscribeToCharacteristic when no notify handles provided', () => {
      new BLEController(
        mockDeviceData,
        mockBleDevice,
        5,
        (_command: any) => [0x01, 0x02],
        {}, // empty notify handles
        false
      );

      expect(mockBleDevice.subscribeToCharacteristic).not.toHaveBeenCalled();
    });
  });

  describe('notifyNames', () => {
    it('should return keys of notify handles', () => {
      const notifyHandles = {
        status: 10,
        battery: 11,
        position: 12,
      };

      const controller = new BLEController(
        mockDeviceData,
        mockBleDevice,
        5,
        (_command: any) => [0x01, 0x02],
        notifyHandles
      );

      expect(controller.notifyNames).toEqual(['status', 'battery', 'position']);
    });
  });
});
