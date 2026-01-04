import { IBLEDevice } from 'ESPHome/types/IBLEDevice';

// Make the check less strict - just require the name to start with KSBT
// The controllerBuilder will handle finding the right characteristic
export const isSupported = ({ name }: IBLEDevice) => name.startsWith('KSBT');
