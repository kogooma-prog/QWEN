import axios from 'axios';

export interface KoreanMarketResult {
  title: string;
  priceKRW: number;
  url: string;
}

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8'
};

export class KoreanMarketService {
  extractSearchQuery(ebayTitle: string): string {
    // 브랜드 + 모델명 위주로 앞 4단어 추출
    return ebayTitle
      .replace(/['"]/g, '')
      .split(/\s+/)
      .slice(0, 4)
      .join(' ');
  }

  async searchBunjang(query: string): Promise<KoreanMarketResult | null> {
    try {
      const response = await axios.get('https://api.bunjang.co.kr/api/1/find_v2.json', {
        params: { q: query, order: 'relevance', n: 1, page: 0 },
        headers: HEADERS,
        timeout: 10000
      });

      const item = response.data?.list?.[0];
      if (!item?.pid) return null;

      const price = parseInt(item.price, 10);
      if (!price || price <= 0) return null;

      return {
        title: item.name,
        priceKRW: price,
        url: `https://bunjang.co.kr/products/${item.pid}`
      };
    } catch (error: any) {
      console.error(`번개장터 검색 오류 "${query}":`, error.message);
      return null;
    }
  }

  async searchDaangn(query: string): Promise<KoreanMarketResult | null> {
    try {
      const url = `https://www.daangn.com/kr/buy-sell/?search=${encodeURIComponent(query)}`;
      const response = await axios.get(url, {
        headers: { ...HEADERS, Accept: 'text/html' },
        timeout: 10000
      });

      // JSON-LD (schema.org) 파싱
      const matches = [...response.data.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
      for (const m of matches) {
        try {
          const data = JSON.parse(m[1]);
          if (data['@type'] === 'ItemList') {
            const first = data.itemListElement?.[0]?.item;
            if (!first) continue;
            const price = parseFloat(first.offers?.price || '0');
            const itemUrl = first.url || '';
            if (price > 0 && itemUrl) {
              return {
                title: first.name,
                priceKRW: Math.round(price),
                url: itemUrl
              };
            }
          }
        } catch {}
      }

      return null;
    } catch (error: any) {
      console.error(`당근마켓 검색 오류 "${query}":`, error.message);
      return null;
    }
  }
}
