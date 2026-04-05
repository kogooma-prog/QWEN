import axios from 'axios';

export class ExchangeRateService {
  async getUsdToKrwRate(): Promise<number> {
    try {
      const apiKey = process.env.EXCHANGE_RATE_API_KEY;
      if (apiKey) {
        const response = await axios.get(
          `https://v6.exchangerate-api.com/v6/${apiKey}/pair/USD/KRW`
        );
        return response.data.conversion_rate;
      }
    } catch (error: any) {
      console.error('Exchange Rate API Error:', error.message);
    }
    // Fallback to a reasonable default
    return 1400;
  }
}
