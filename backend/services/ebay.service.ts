import axios from 'axios';
import * as cheerio from 'cheerio';
import { EbayItem } from '../../shared/types';

export class EbayService {
  private appId: string;
  private certId: string;

  constructor() {
    this.appId = process.env.EBAY_APP_ID || '';
    this.certId = process.env.EBAY_CERT_ID || '';
  }

  async fetchItemsFromSeller(sellerName: string, categoryId: string): Promise<EbayItem[]> {
    try {
      const response = await axios.get('https://svcs.ebay.com/services/search/FindingService/v1', {
        params: {
          'OPERATION-NAME': 'findItemsBySeller',
          'SERVICE-VERSION': '1.0.0',
          'SECURITY-APPNAME': this.appId || 'test-app-id',
          'RESPONSE-DATA-FORMAT': 'JSON',
          'paginationInput.entriesPerPage': 60,
          sellerId: sellerName,
          categoryId: categoryId,
          itemFilter: [
            { name: 'Condition', value: 'New' },
            { name: 'FreeShippingOnly', value: 'true' }
          ],
          sorting: 'StartTimeNewest'
        },
        timeout: 30000
      });

      const items = response.data?.findItemsBySellerResponse?.[0]?.searchResult?.[0]?.item || [];
      
      return items.map((item: any) => ({
        id: item.itemId?.[0] || '',
        title: item.title?.[0] || '',
        price: parseFloat(item.sellingStatus?.[0]?.currentPrice?.[0]?.__value__ || '0'),
        currency: item.sellingStatus?.[0]?.currentPrice?.[0]?.['@currencyId'] || 'USD',
        url: item.viewItemURL?.[0] || '',
        image: item.galleryURL?.[0] || ''
      })).filter((item: EbayItem) => item.id && item.url);
    } catch (error: any) {
      console.error('eBay API Error:', error.message);
      return this.fetchItemsFromScrape(sellerName, categoryId);
    }
  }

  private async fetchItemsFromScrape(sellerName: string, categoryId: string): Promise<EbayItem[]> {
    try {
      const url = `https://www.ebay.com/sch/i.html?_nkw=&_sacat=${categoryId}&_sop=10&LH_Complete=0&LH_BIN=1&rt=nc&_udhi=&_udlo=&_fpos=&_fspt=1&LH_Pay=1&LH_ItemLocType=Domestic%7CNative&_ipg=60&_dmd=1&_fcid=1&_udhi=&_samilow=&_samihi=&LH_FS=1&_sadis=&_stpos=&LH_AllOffers=1&LH_SellerWithStore=1&_mPrRngCbx=1&LH_BIN=1&_sop=10&_udhi=&_fcid=1&LH_ItemCondition=3&LH_PrefLoc=1&_sacat=${categoryId}&_from=R40&_nkw=&_sop=10&LH_SellerHasStorePage=1&LH_SpecificSeller=1&_udhi=&_sop=10&_ipg=60&_dmd=1&LH_Complete=0&LH_Sold=0&_samihi=&_sadis=&_stpos=&_fpos=&LH_ItemLocType=Domestic%7CNative&_fspt=1&LH_Pay=1&_udhi=&LH_BIN=1`;
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        },
        timeout: 30000
      });

      const $ = cheerio.load(response.data);
      const items: EbayItem[] = [];

      $('li.s-item').each((i, el) => {
        if (i > 60) return;
        const title = $(el).find('.s-item__title').text().trim();
        const priceText = $(el).find('.s-item__price').text().trim();
        const link = $(el).find('.s-item__link').attr('href') || '';
        const image = $(el).find('.s-item__image-img img').attr('src') || '';

        const priceMatch = priceText.replace(/[^0-9.]/g, '');
        const price = parseFloat(priceMatch);

        if (title && title !== 'Shop on eBay' && price > 0) {
          const itemIdMatch = link.match(/\/(\d+)\?/);
          const itemId = itemIdMatch ? itemIdMatch[1] : `scraped-${i}`;

          items.push({
            id: itemId,
            title,
            price,
            currency: 'USD',
            url: link,
            image
          });
        }
      });

      return items;
    } catch (error: any) {
      console.error('eBay Scrape Error:', error.message);
      return [];
    }
  }
}
