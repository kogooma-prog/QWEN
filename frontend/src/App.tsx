import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './App.css';

interface Deal {
  id: number;
  ebayId: string;
  ebayTitle: string;
  ebayPriceUSD: number;
  ebayUrl: string;
  ebayImage: string;
  bunjangTitle: string | null;
  bunjangPriceKRW: number | null;
  bunjangUrl: string | null;
  daangnnTitle: string | null;
  daangnnPriceKRW: number | null;
  daangnnUrl: string | null;
  naverTitle: string | null;
  naverPriceKRW: number | null;
  naverUrl: string | null;
  danawaTitle: string | null;
  danawaPriceKRW: number | null;
  danawaUrl: string | null;
  priceRatio: number | null;
  lastSync: string;
}

const API_URL = import.meta.env.VITE_API_URL || '';

function App() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sort, setSort] = useState('latest');
  const [status, setStatus] = useState<{ lastSync: any; exchangeRate: number | null }>({
    lastSync: null,
    exchangeRate: null,
  });
  const [syncing, setSyncing] = useState(false);
  const [lastSyncTimestamp, setLastSyncTimestamp] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);
  const prevTimestampRef = useRef<string | null>(null);

  const fetchDeals = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const searchParam = searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : '';
      const sortParam = sort !== 'latest' ? `&sort=${sort}` : '';
      const [dealsRes, statusRes] = await Promise.all([
        axios.get(`${API_URL}/api/deals?page=${page}${searchParam}${sortParam}`),
        axios.get(`${API_URL}/api/status`),
      ]);
      setDeals(dealsRes.data.deals);
      setTotalPages(dealsRes.data.totalPages);
      setStatus(statusRes.data);

      const ts = statusRes.data.lastSync?.timestamp || null;
      if (ts !== lastSyncTimestamp) {
        setLastSyncTimestamp(ts);
        if (prevTimestampRef.current && ts !== prevTimestampRef.current) {
          // Sync completed - refresh deals with animation
          if (syncing) setSyncing(false);
        }
        prevTimestampRef.current = ts;
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleSearch = () => {
    setPage(1);
    setSearchQuery(searchInput);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSearch();
  };

  useEffect(() => {
    fetchDeals();
  }, [page, searchQuery, sort]);

  // 환율 30분마다 자동 갱신
  useEffect(() => {
    const refreshRate = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/status`);
        setStatus(prev => ({ ...prev, exchangeRate: res.data.exchangeRate }));
      } catch {}
    };
    const id = window.setInterval(refreshRate, 30 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // Poll for sync progress every 5 seconds
  useEffect(() => {
    if (!syncing) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }

    const pollStatus = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/status`);
        setStatus(res.data);

        const ts = res.data.lastSync?.timestamp || null;
        const status_msg = res.data.lastSync?.status || '';

        // Check if sync completed
        if (status_msg === 'COMPLETED' && ts !== prevTimestampRef.current) {
          setSyncing(false);
          prevTimestampRef.current = ts;
          fetchDeals(); // Refresh deals
        }

        // Auto-refresh deals list during sync
        const dealsRes = await axios.get(`${API_URL}/api/deals?page=${page}`);
        setDeals(dealsRes.data.deals);
        setTotalPages(dealsRes.data.totalPages);
      } catch (error) {
        console.error('Poll error:', error);
      }
    };

    pollRef.current = window.setInterval(pollStatus, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [syncing, page]);

  const triggerSync = async () => {
    setSyncing(true);
    try {
      await axios.post(`${API_URL}/api/sync`);
      // Polling will start automatically due to syncing=true
    } catch (error) {
      alert('동기화 요청 실패');
      setSyncing(false);
    }
  };

  return (
    <div className="container">
      <header>
        <h1>eBay VIPOutlet Monitor</h1>
        <div className="controls">
          <div className="search-box">
            <input
              type="text"
              className="search-input"
              placeholder="상품명 검색..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={handleSearchKeyDown}
            />
            <button className="btn search-btn" onClick={handleSearch}>검색</button>
            {searchQuery && (
              <button className="btn clear-btn" onClick={() => { setSearchInput(''); setSearchQuery(''); setPage(1); }}>✕</button>
            )}
          </div>
          <select
            className="sort-select"
            value={sort}
            onChange={e => { setSort(e.target.value); setPage(1); }}
          >
            <option value="latest">최신순</option>
            <option value="ratio_asc">이베이가 싼 순서</option>
            <option value="ratio_desc">이베이가 비싼 순서</option>
            <option value="price_desc">이베이 최고가격</option>
            <option value="price_asc">이베이 최저가격</option>
          </select>
          <button className="btn refresh-btn" onClick={() => fetchDeals()} disabled={loading}>
            {loading ? '로딩 중...' : '새로고침'}
          </button>
          <button
            className={`btn sync-btn ${syncing ? 'loading' : ''}`}
            onClick={triggerSync}
            disabled={syncing}
          >
            {syncing ? '🔄 동기화 진행 중...' : '수동 동기화 시작'}
          </button>
        </div>
        <div className="info-row">
          {status.exchangeRate && (
            <span>💱 1$ = {status.exchangeRate}원</span>
          )}
          {status.lastSync && (
            <span>📡 마지막 동기화: {new Date(status.lastSync.timestamp).toLocaleString('ko-KR')}</span>
          )}
          {syncing && <span className="sync-indicator">⏳ 동기화 진행 중... (자동 갱신)</span>}
        </div>
      </header>

      <main>
        {loading && deals.length === 0 ? (
          <p className="loading-msg">로딩 중...</p>
        ) : (
          <>
            {syncing && deals.length > 0 && (
              <p className="syncing-notice">📦 동기화 중입니다. 새 상품이 추가되면 자동으로 표시됩니다.</p>
            )}
            <div className="grid">
              {deals.length === 0 ? (
                <p className="empty-msg">데이터가 없습니다. {syncing ? '동기화를 기다려주세요...' : '동기화를 시작해주세요.'}</p>
              ) : (
                deals.map(deal => (
                  <div key={deal.id} className="card">
                    <img src={deal.ebayImage || ''} alt={deal.ebayTitle} className="item-img" />
                    <div className="details">
                      <h3>{deal.ebayTitle}</h3>
                      <div className="price-compare">
                        <div className="price-box ebay">
                          <span>eBay</span>
                          <strong>₩{status.exchangeRate ? (deal.ebayPriceUSD * status.exchangeRate).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '-'}</strong>
                          <small>${deal.ebayPriceUSD.toFixed(2)} {deal.ebayPriceUSD > 220 ? '(관부과세 포함)' : ''}</small>
                          <a href={deal.ebayUrl} target="_blank" rel="noreferrer">보기 →</a>
                        </div>
                        {deal.bunjangPriceKRW && deal.bunjangUrl && (
                          <div className="price-box bunjang">
                            <span>번개장터</span>
                            <strong>₩{deal.bunjangPriceKRW.toLocaleString()}</strong>
                            <small>{deal.bunjangTitle?.slice(0, 30)}</small>
                            <a href={deal.bunjangUrl} target="_blank" rel="noreferrer">보기 →</a>
                          </div>
                        )}
                        {deal.daangnnPriceKRW && deal.daangnnUrl && (
                          <div className="price-box daangn">
                            <span>당근마켓</span>
                            <strong>₩{deal.daangnnPriceKRW.toLocaleString()}</strong>
                            <small>{deal.daangnnTitle?.slice(0, 30)}</small>
                            <a href={deal.daangnnUrl} target="_blank" rel="noreferrer">보기 →</a>
                          </div>
                        )}
                        {deal.naverPriceKRW && deal.naverUrl && (
                          <div className="price-box naver">
                            <span>네이버 쇼핑</span>
                            <strong>₩{deal.naverPriceKRW.toLocaleString()}</strong>
                            <small>{deal.naverTitle?.slice(0, 30)}</small>
                            <a href={deal.naverUrl} target="_blank" rel="noreferrer">보기 →</a>
                          </div>
                        )}
                        {deal.danawaPriceKRW && deal.danawaUrl && (
                          <div className="price-box danawa">
                            <span>다나와</span>
                            <strong>₩{deal.danawaPriceKRW.toLocaleString()}</strong>
                            <small>{deal.danawaTitle?.slice(0, 30)}</small>
                            <a href={deal.danawaUrl} target="_blank" rel="noreferrer">보기 →</a>
                          </div>
                        )}
                        {deal.priceRatio !== null && (
                          <div className="ratio-badge" title="eBay가격 / 국내최저가">
                            비율 {(deal.priceRatio * 100).toFixed(0)}%
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {deals.length > 0 && (
              <div className="pagination">
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>이전</button>
                <span>{page} / {totalPages || 1}</span>
                <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>다음</button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
