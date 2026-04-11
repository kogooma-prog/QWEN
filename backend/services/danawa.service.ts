import puppeteer, { Browser } from 'puppeteer';

export interface ShoppingResult {
  title: string;
  priceKRW: number;
  url: string;
}

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.connected) {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
  }
  return browser;
}

export async function closeDanawaBrowser() {
  if (browser) { await browser.close(); browser = null; }
}

export class DanawaService {
  async search(query: string): Promise<ShoppingResult | null> {
    try {
      const b = await getBrowser();
      const page = await b.newPage();
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'ko-KR,ko;q=0.9' });

      const url = `https://search.danawa.com/dsearch.php?query=${encodeURIComponent(query)}&tab=goods&sort=saveDESC`;
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });

      const result = await page.evaluate((): { title: string; priceKRW: number; url: string } | null => {
        const items = document.querySelectorAll('.prod_item, li[class*="prod_item"]');
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const nameEl = item.querySelector('.prod-name a, .prod_name a');
          const priceEl = item.querySelector('.price_sect a strong, .lowest_price a strong, .price a strong');
          const linkEl = item.querySelector('.prod-name a, .prod_name a') as HTMLAnchorElement | null;

          const name = nameEl?.textContent?.trim();
          const priceText = priceEl?.textContent?.replace(/[^0-9]/g, '');
          const price = priceText ? parseInt(priceText, 10) : 0;
          const link = linkEl?.href;

          if (name && price > 0 && link) {
            return { title: name, priceKRW: price, url: link };
          }
        }
        return null;
      });

      await page.close();
      return result;
    } catch (error: any) {
      console.error(`다나와 검색 오류 "${query}":`, error.message);
      return null;
    }
  }
}
