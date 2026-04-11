import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { EbayService } from './services/ebay.service';
import { ExchangeRateService } from './services/exchange-rate.service';
import { KoreanMarketService } from './services/korean-market.service';
import { NaverShoppingService } from './services/naver-shopping.service';
import { DanawaService, closeDanawaBrowser } from './services/danawa.service';

const app = express();
const port = process.env.PORT || 3001;
const prisma = new PrismaClient();
const ebayService = new EbayService();
const exchangeRateService = new ExchangeRateService();
const koreanMarketService = new KoreanMarketService();
const naverShoppingService = new NaverShoppingService();
const danawaService = new DanawaService();

app.use(cors());
app.use(express.json());

const categories = [
  { id: '175672', name: 'Laptops' },
  { id: '9355', name: 'Cell Phones' },
  { id: '171485', name: 'Tablets' }
];

async function performSync() {
  try {
    console.log('Sync started...');
    await prisma.syncLog.create({ data: { status: 'STARTED', message: 'Sync cycle started' } });

    const exchangeRate = await exchangeRateService.getUsdToKrwRate();
    await prisma.exchangeRate.upsert({
      where: { currency: 'KRW' },
      update: { rate: exchangeRate, lastUpdate: new Date() },
      create: { currency: 'KRW', rate: exchangeRate }
    });

    for (const category of categories) {
      console.log(`Fetching category: ${category.name}`);
      const ebayItems = await ebayService.fetchItemsFromSeller('vipoutlet', category.id);
      console.log(`Fetched ${ebayItems.length} items from eBay for ${category.name}.`);

      for (const item of ebayItems) {
        let usdEbayPrice = item.price;
        if (item.currency === 'KRW') {
          usdEbayPrice = item.price / exchangeRate;
        }

        let finalUsdPrice = usdEbayPrice;
        if (usdEbayPrice > 200) {
          finalUsdPrice = usdEbayPrice * 1.1;
        }

        await prisma.deal.upsert({
          where: { ebayId: item.id },
          update: {
            ebayTitle: item.title,
            ebayPriceUSD: finalUsdPrice,
            ebayUrl: item.url,
            ebayImage: item.image,
            lastSync: new Date()
          },
          create: {
            ebayId: item.id,
            ebayTitle: item.title,
            ebayPriceUSD: finalUsdPrice,
            ebayUrl: item.url,
            ebayImage: item.image
          }
        });
      }
    }

    await prisma.syncLog.create({ data: { status: 'COMPLETED', message: 'Sync cycle completed' } });
    console.log('Sync completed.');

    // 한국 마켓 데이터 백그라운드 보강 (비차단)
    enrichKoreanMarketData().catch(e => console.error('한국 마켓 보강 오류:', e));
  } catch (error: any) {
    console.error('Sync Error:', error);
    await prisma.syncLog.create({ data: { status: 'FAILED', message: error.message } });
  }
}

async function enrichKoreanMarketData() {
  const items = await prisma.deal.findMany({
    where: { koreanMarketSearchedAt: null },
    take: 50,
    orderBy: { lastSync: 'desc' },
    select: { id: true, ebayTitle: true, ebayPriceUSD: true }
  });

  if (items.length === 0) return;

  const exchangeRateRecord = await prisma.exchangeRate.findUnique({ where: { currency: 'KRW' } });
  const exchangeRate = exchangeRateRecord?.rate || 1400;

  console.log(`한국 마켓 검색 시작: ${items.length}개`);

  for (const item of items) {
    const query = koreanMarketService.extractSearchQuery(item.ebayTitle);
    const [bunjang, daangn, naver, danawa] = await Promise.all([
      koreanMarketService.searchBunjang(query),
      koreanMarketService.searchDaangn(query),
      naverShoppingService.search(query),
      danawaService.search(query)
    ]);

    const ebayPriceKRW = item.ebayPriceUSD * exchangeRate;
    const allPrices = [bunjang?.priceKRW, daangn?.priceKRW, naver?.priceKRW, danawa?.priceKRW]
      .filter((p): p is number => !!p);
    const minKoreanPrice = allPrices.length > 0 ? Math.min(...allPrices) : null;
    const priceRatio = minKoreanPrice ? parseFloat((ebayPriceKRW / minKoreanPrice).toFixed(4)) : null;

    await prisma.deal.update({
      where: { id: item.id },
      data: {
        bunjangTitle: bunjang?.title ?? null,
        bunjangPriceKRW: bunjang?.priceKRW ?? null,
        bunjangUrl: bunjang?.url ?? null,
        daangnnTitle: daangn?.title ?? null,
        daangnnPriceKRW: daangn?.priceKRW ?? null,
        daangnnUrl: daangn?.url ?? null,
        naverTitle: naver?.title ?? null,
        naverPriceKRW: naver?.priceKRW ?? null,
        naverUrl: naver?.url ?? null,
        danawaTitle: danawa?.title ?? null,
        danawaPriceKRW: danawa?.priceKRW ?? null,
        danawaUrl: danawa?.url ?? null,
        priceRatio,
        koreanMarketSearchedAt: new Date()
      }
    });

    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`한국 마켓 검색 완료: ${items.length}개 처리`);
  await closeDanawaBrowser();
}

// API Endpoints
app.get('/api/deals', async (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = 20;
  const search = (req.query.search as string || '').trim();

  const sort = (req.query.sort as string) || 'latest';

  const searchWhere = search
    ? { ebayTitle: { contains: search, mode: 'insensitive' as const } }
    : {};
  const ratioWhere = (sort === 'ratio_asc' || sort === 'ratio_desc')
    ? { priceRatio: { not: null } }
    : {};
  const where = { ...searchWhere, ...ratioWhere };

  const orderBy: any =
    sort === 'price_asc'   ? { ebayPriceUSD: 'asc' }  :
    sort === 'price_desc'  ? { ebayPriceUSD: 'desc' } :
    sort === 'ratio_asc'   ? { priceRatio: 'asc' }    :
    sort === 'ratio_desc'  ? { priceRatio: 'desc' }   :
    { lastSync: 'desc' };

  const [deals, total] = await Promise.all([
    prisma.deal.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        ebayId: true,
        ebayTitle: true,
        ebayPriceUSD: true,
        ebayUrl: true,
        ebayImage: true,
        bunjangTitle: true,
        bunjangPriceKRW: true,
        bunjangUrl: true,
        daangnnTitle: true,
        daangnnPriceKRW: true,
        daangnnUrl: true,
        naverTitle: true,
        naverPriceKRW: true,
        naverUrl: true,
        danawaTitle: true,
        danawaPriceKRW: true,
        danawaUrl: true,
        priceRatio: true,
        lastSync: true
      }
    }),
    prisma.deal.count({ where })
  ]);

  res.json({
    deals,
    total,
    page,
    totalPages: Math.ceil(total / pageSize)
  });
});

app.get('/api/status', async (req, res) => {
  const lastSync = await prisma.syncLog.findFirst({
    orderBy: { timestamp: 'desc' }
  });
  const rate = await prisma.exchangeRate.findUnique({
    where: { currency: 'KRW' }
  });
  res.json({ lastSync, exchangeRate: rate?.rate });
});

app.post('/api/sync', async (req, res) => {
  performSync();
  res.json({ message: 'Sync triggered' });
});

app.post('/api/seed', async (req, res) => {
  try {
    const dummyItems = [
      { ebayId: 'demo-001', ebayTitle: 'Samsung Galaxy Tab A9+ 11" 64GB WiFi Tablet', ebayPriceUSD: 149.99, ebayUrl: 'https://www.ebay.com/itm/demo001', ebayImage: 'https://i.ebayimg.com/images/g/abc/s-l500.webp' },
      { ebayId: 'demo-002', ebayTitle: 'TCL NXTPAPER 11 Plus Tablet 11.5" 256GB', ebayPriceUSD: 189.99, ebayUrl: 'https://www.ebay.com/itm/demo002', ebayImage: 'https://i.ebayimg.com/images/g/def/s-l500.webp' },
      { ebayId: 'demo-003', ebayTitle: 'onn. 12.1" Tablet Pro 6GB RAM 128GB Gray', ebayPriceUSD: 119.00, ebayUrl: 'https://www.ebay.com/itm/demo003', ebayImage: 'https://i.ebayimg.com/images/g/ghi/s-l500.webp' },
      { ebayId: 'demo-004', ebayTitle: 'Lenovo Tab M10 Plus 10.6" 64GB WiFi Tablet', ebayPriceUSD: 129.50, ebayUrl: 'https://www.ebay.com/itm/demo004', ebayImage: 'https://i.ebayimg.com/images/g/jkl/s-l500.webp' },
      { ebayId: 'demo-005', ebayTitle: 'Apple iPad 10.2" 9th Gen 64GB WiFi Space Gray', ebayPriceUSD: 249.99, ebayUrl: 'https://www.ebay.com/itm/demo005', ebayImage: 'https://i.ebayimg.com/images/g/mno/s-l500.webp' },
    ];
    for (const item of dummyItems) {
      await prisma.deal.upsert({
        where: { ebayId: item.ebayId },
        update: { lastSync: new Date() },
        create: item
      });
    }
    res.json({ message: `Seeded ${dummyItems.length} demo items` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

async function updateExchangeRate() {
  try {
    const rate = await exchangeRateService.getUsdToKrwRate();
    await prisma.exchangeRate.upsert({
      where: { currency: 'KRW' },
      update: { rate, lastUpdate: new Date() },
      create: { currency: 'KRW', rate }
    });
    console.log(`환율 갱신: 1 USD = ${rate} KRW`);
  } catch (error: any) {
    console.error('환율 갱신 실패:', error.message);
  }
}

// 환율: 6시간마다 갱신
cron.schedule('0 */6 * * *', updateExchangeRate);

// 상품 동기화: 6시간마다
cron.schedule('0 */6 * * *', () => {
  performSync();
});

app.listen(port, async () => {
  console.log(`Server running on http://localhost:${port}`);
  await updateExchangeRate(); // 서버 시작 시 즉시 환율 갱신
});
