/**
 * WebRTC & Native Call Signaling Abstraction
 */
import { apiClient } from '../services/api/apiClient';

export const nativeCalls = {
  async getIceConfig() {
    return await apiClient.get('/api/calls/ice-config');
  },

  async getCallHistory() {
    return await apiClient.get('/api/calls/history');
  },

  async getCallStatus(callId: string) {
    return await apiClient.get(`/api/calls/status/${callId}`);
  },
};
