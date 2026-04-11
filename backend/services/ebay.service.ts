import axios from 'axios';
import { EbayItem } from '../../shared/types';

export class EbayService {
  private appId: string;
  private certId: string;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor() {
    this.appId = process.env.EBAY_APP_ID || '';
    this.certId = process.env.EBAY_CERT_ID || '';
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const credentials = Buffer.from(`${this.appId}:${this.certId}`).toString('base64');
    const response = await axios.post(
      'https://api.ebay.com/identity/v1/oauth2/token',
      'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope',
      {
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    this.accessToken = response.data.access_token;
    this.tokenExpiry = Date.now() + (response.data.expires_in - 60) * 1000;
    return this.accessToken!;
  }

  async fetchItemsFromSeller(sellerName: string, categoryId: string): Promise<EbayItem[]> {
    try {
      const token = await this.getAccessToken();
      const items: EbayItem[] = [];
      let offset = 0;
      const limit = 50;

      while (true) {
        const response = await axios.get(
          'https://api.ebay.com/buy/browse/v1/item_summary/search',
          {
            params: {
              filter: `sellers:{${sellerName}}`,
              category_ids: categoryId,
              limit,
              offset
            },
            headers: {
              'Authorization': `Bearer ${token}`,
              'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
            },
            timeout: 30000
          }
        );

        const summaries = response.data.itemSummaries || [];
        for (const item of summaries) {
          items.push({
            id: item.itemId || '',
            title: item.title || '',
            price: parseFloat(item.price?.value || '0'),
            currency: item.price?.currency || 'USD',
            url: item.itemWebUrl || '',
            image: item.image?.imageUrl || ''
          });
        }

        const total = response.data.total || 0;
        offset += summaries.length;
        if (offset >= total || summaries.length === 0 || offset >= 200) break;
      }

      return items.filter(item => item.id && item.url);
    } catch (error: any) {
      console.error('eBay API Error:', error.response?.data || error.message);
      return [];
    }
  }
}
