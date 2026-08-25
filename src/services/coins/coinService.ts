import { apiClient } from '../api/apiClient';
import type { CoinCatalogResponse, CoinWalletResponse, GiftSnapshot } from '../../features/gifts/types';

export interface GiftSendResult {
  giftSendId: string;
  balance: number;
  replayed: boolean;
  message: {
    id: string;
    matchId: string;
    senderId: string;
    messageType: 'GIFT';
    giftSendId: string;
    giftSnapshot: GiftSnapshot;
    createdAt: string;
  } | null;
}

export const coinService = {
  async getCatalog(): Promise<CoinCatalogResponse> {
    const response = await apiClient.get('/api/coins/catalog');
    return response.data;
  },

  async getWallet(): Promise<CoinWalletResponse> {
    const response = await apiClient.get('/api/coins/wallet');
    return response.data;
  },

  async sendGift(payload: { matchId: string; giftId: string; clientRequestId: string }): Promise<GiftSendResult> {
    const response = await apiClient.post('/api/coins/gifts/send', payload);
    return response.data;
  },
};
