import axios from 'axios';

export interface ShoppingResult {
  title: string;
  priceKRW: number;
  url: string;
}

export class NaverShoppingService {
  async search(query: string): Promise<ShoppingResult | null> {
    // 공식 API 키가 있으면 사용 (안정적)
    const clientId = process.env.NAVER_CLIENT_ID;
    const clientSecret = process.env.NAVER_CLIENT_SECRET;

    if (clientId && clientSecret) {
      return this.searchViaApi(query, clientId, clientSecret);
    }
    return null; // 키 없으면 스킵
  }

  private async searchViaApi(query: string, clientId: string, clientSecret: string): Promise<ShoppingResult | null> {
    try {
      const response = await axios.get('https://openapi.naver.com/v1/search/shop.json', {
        params: { query, display: 1, sort: 'sim' },
        headers: {
          'X-Naver-Client-Id': clientId,
          'X-Naver-Client-Secret': clientSecret
        },
        timeout: 10000
      });

      const item = response.data?.items?.[0];
      if (!item) return null;

      const price = parseInt(item.lprice || item.hprice || '0', 10);
      if (!price) return null;

      return {
        title: item.title.replace(/<[^>]+>/g, ''),
        priceKRW: price,
        url: item.link
      };
    } catch (error: any) {
      console.error(`네이버 쇼핑 API 오류 "${query}":`, error.message);
      return null;
    }
  }
}
