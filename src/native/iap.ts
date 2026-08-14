/**
 * Native In-App Purchase & Subscriptions Abstraction
 * Wraps store receipt verification API contracts.
 */
import { apiClient } from '../services/api/apiClient';

export interface SubscriptionVerifyPayload {
  platform: 'android' | 'ios';
  purchaseToken: string;
  productId: string;
}

export const nativeIap = {
  async verifyPurchase(payload: SubscriptionVerifyPayload) {
    return await apiClient.post('/api/subscriptions/verify', payload);
  },

  async restorePurchases() {
    return await apiClient.get('/api/subscriptions/restore');
  },
};
