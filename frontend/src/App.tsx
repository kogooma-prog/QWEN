import { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

interface Deal {
  id: number;
  ebayId: string;
  ebayTitle: string;
  ebayPriceUSD: number;
  ebayUrl: string;
  ebayImage: string;
  lastSync: string;
}

function App() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ lastSync: any; exchangeRate: number | null }>({
    lastSync: null,
    exchangeRate: null,
  });

  const fetchDeals = async () => {
    setLoading(true);
    try {
      const [dealsRes, statusRes] = await Promise.all([
        axios.get(`/api/deals?page=${page}`),
        axios.get('/api/status'),
      ]);
      setDeals(dealsRes.data.deals);
      setTotalPages(dealsRes.data.totalPages);
      setStatus(statusRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeals();
  }, [page]);

  const [syncing, setSyncing] = useState(false);

  const triggerSync = async () => {
    setSyncing(true);
    try {
      await axios.post('/api/sync');
      alert('동기화가 백그라운드에서 시작되었습니다. 잠시 후 새로고침 해주세요.');
    } catch (error) {
      alert('동기화 요청 실패');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="container">
      <header>
        <h1>eBay VIPOutlet Monitor</h1>
        <div className="controls">
          <button className="btn refresh-btn" onClick={fetchDeals} disabled={loading}>
            {loading ? '로딩 중...' : '새로고침'}
          </button>
          <button
            className={`btn sync-btn ${syncing ? 'loading' : ''}`}
            onClick={triggerSync}
            disabled={syncing}
          >
            {syncing ? '동기화 중...' : '수동 동기화 시작'}
          </button>
        </div>
        {status.exchangeRate && (
          <p className="info">현재 적용 환율: 1$ = {status.exchangeRate}원 | 마지막 동기화: {status.lastSync?.timestamp || '없음'}</p>
        )}
      </header>

      <main>
        {loading ? <p>로딩 중...</p> : (
          <>
            <div className="grid">
              {deals.length === 0 ? <p>데이터가 없습니다.</p> : deals.map(deal => (
                <div key={deal.id} className="card">
                  <img src={deal.ebayImage || ''} alt={deal.ebayTitle} className="item-img" />
                  <div className="details">
                    <h3>{deal.ebayTitle}</h3>
                    <div className="price-compare">
                      <div className="price-box ebay">
                        <span>eBay 가격</span>
                        <strong>₩{status.exchangeRate ? (deal.ebayPriceUSD * status.exchangeRate).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '-'}</strong>
                        <small style={{display:'block', color:'#666'}}>${deal.ebayPriceUSD.toFixed(2)} {deal.ebayPriceUSD > 220 ? '(관부과세 포함)' : ''}</small>
                        <a href={deal.ebayUrl} target="_blank" rel="noreferrer">eBay에서 보기 →</a>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="pagination">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>이전</button>
              <span>{page} / {totalPages || 1}</span>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>다음</button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default App;
