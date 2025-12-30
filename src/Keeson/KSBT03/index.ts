/**
 * KSBT03 Module
 * 
 * This module provides constants and utilities for identifying Keeson KSBT03 series
 * smart beds based on observed BLE characteristics from nRF Connect captures.
 * 
 * Note: This module contains only observational data from BLE advertisements.
 * It does not include command protocol implementation, which requires deeper
 * reverse-engineering beyond advertisement-level data.
 */

export * from './constants';
export * from './deviceInfo';
