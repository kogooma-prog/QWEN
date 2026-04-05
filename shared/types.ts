export interface EbayItem {
  id: string;
  title: string;
  price: number;
  currency: string;
  url: string;
  image?: string;
  upc?: string;
}

export interface CoupangProduct {
  productId: string;
  productName: string;
  productPrice: number;
  productUrl: string;
  image?: string;
}

export interface DanawaProduct {
  name: string;
  price: number;
  url: string;
}

export interface NaverProduct {
  name: string;
  price: number;
  url: string;
}

export interface DealResult {
  ebay: EbayItem;
  coupang?: CoupangProduct;
  danawa?: DanawaProduct;
  naver?: NaverProduct;
  ratio?: number;
}
