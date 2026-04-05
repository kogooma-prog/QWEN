# eBay VIP Outlet Monitor

eBay VIP Outlet의 전자제품 가격을 실시간으로 보여주는 대시보드입니다.

## 실행 방법

```bash
# 의존성 설치
npm install

# 데이터베이스 초기화
npx prisma db push

# 서버 실행
npm start
```

## 접속
- 대시보드: `http://localhost:3000`
- API 서버: `http://localhost:3001`

## 환경 변수
`.env` 파일에 다음 값을 설정하세요:
- `EBAY_APP_ID`: eBay 개발자 API 키
- `EBAY_CERT_ID`: eBay 인증 키
- `EXCHANGE_RATE_API_KEY`: 환율 API 키 (선택사항)
