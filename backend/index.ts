import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { EbayService } from './services/ebay.service';
import { ExchangeRateService } from './services/exchange-rate.service';

const app = express();
const port = process.env.PORT || 3001;
const prisma = new PrismaClient();
const ebayService = new EbayService();
const exchangeRateService = new ExchangeRateService();

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
  } catch (error: any) {
    console.error('Sync Error:', error);
    await prisma.syncLog.create({ data: { status: 'FAILED', message: error.message } });
  }
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

  const orderBy: any =
    sort === 'price_asc'  ? { ebayPriceUSD: 'asc' }  :
    sort === 'price_desc' ? { ebayPriceUSD: 'desc' } :
    { lastSync: 'desc' };

  const [deals, total] = await Promise.all([
    prisma.deal.findMany({
      where: searchWhere,
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
        lastSync: true
      }
    }),
    prisma.deal.count({ where: searchWhere })
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
  await updateExchangeRate();
});
