// Mock for esphome-client module
import { EventEmitter } from 'events';

export class EspHomeClient extends EventEmitter {
  host: string;
  port: number;
  logger: any;
  
  constructor(options: any) {
    super();
    this.host = options.host;
    this.port = options.port || 6053;
    this.logger = options.logger;
  }
  
  async connect() {
    // Mock implementation
  }
  
  disconnect() {
    // Mock implementation
  }
}

export enum LogLevel {
  NONE = 0,
  ERROR = 1,
  WARN = 2,
  INFO = 3,
  DEBUG = 4,
  VERBOSE = 5,
  VERY_VERBOSE = 6,
}
