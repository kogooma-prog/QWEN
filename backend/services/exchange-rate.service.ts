import axios from 'axios';

export class ExchangeRateService {
  async getUsdToKrwRate(): Promise<number> {
    // 1차: open.er-api.com (무료, 키 불필요)
    try {
      const response = await axios.get('https://open.er-api.com/v6/latest/USD', { timeout: 10000 });
      const rate = response.data?.rates?.KRW;
      if (rate) return rate;
    } catch (e) {}

    // 2차: exchangerate-api.com (무료 v4, 키 불필요)
    try {
      const response = await axios.get('https://api.exchangerate-api.com/v4/latest/USD', { timeout: 10000 });
      const rate = response.data?.rates?.KRW;
      if (rate) return rate;
    } catch (e) {}

    // 3차: 유저 설정 키
    try {
      const apiKey = process.env.EXCHANGE_RATE_API_KEY;
      if (apiKey) {
        const response = await axios.get(
          `https://v6.exchangerate-api.com/v6/${apiKey}/pair/USD/KRW`,
          { timeout: 10000 }
        );
        return response.data.conversion_rate;
      }
    } catch (e) {}

    return 1400;
  }
}
