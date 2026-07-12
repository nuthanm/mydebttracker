'use client';

import { useEffect, useMemo, useState } from 'react';

function formatEvent(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function SecurityActivityClient() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
        if (query) params.set('q', query);
        if (status !== 'all') params.set('status', status);
        const res = await fetch(`/api/auth/security-events?${params.toString()}`, { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not load security activity.');
        setEvents(data.events || []);
        setTotal(Number(data.total || 0));
      } catch (err) {
        setError(err.message || 'Could not load security activity.');
      }
      setLoading(false);
    };
    load();
  }, [query, status, page]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total]);

  const applySearch = () => {
    setPage(1);
    setQuery(queryInput.trim());
  };

  const changeStatus = (value) => {
    setStatus(value);
    setPage(1);
  };

  return (
    <div className="px-4 md:px-8 py-5 md:py-6 max-w-6xl mx-auto w-full">
      <div className="mb-4">
        <h1 className="text-2xl md:text-3xl font-medium tracking-tight mb-1">Security Activity</h1>
        <p className="text-sm text-ink-soft">Review sign-in and security actions on your account.</p>
      </div>

      <div className="bg-paper-card border border-edge rounded-2xl p-4 mb-4">
        <div className="grid md:grid-cols-[1fr_180px_120px] gap-3">
          <input
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') applySearch(); }}
            className="field-input"
            placeholder="Search event, IP, device, or metadata"
          />
          <select value={status} onChange={(e) => changeStatus(e.target.value)} className="field-input">
            <option value="all">All status</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
          </select>
          <button onClick={applySearch} className="btn-primary rounded-lg text-sm px-3 py-2">Search</button>
        </div>
      </div>

      <div className="bg-paper-card border border-edge rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-paper-tint text-ink-soft text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-3">Time</th>
                <th className="text-left px-4 py-3">Event</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">IP Address</th>
                <th className="text-left px-4 py-3">Device</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-4 py-4 text-ink-soft" colSpan={5}>Loading activity...</td>
                </tr>
              ) : error ? (
                <tr>
                  <td className="px-4 py-4 text-danger" colSpan={5}>{error}</td>
                </tr>
              ) : events.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-ink-soft" colSpan={5}>No matching activity found.</td>
                </tr>
              ) : (
                events.map((event, index) => (
                  <tr key={`${event.created_at}-${index}`} className="border-t border-edge">
                    <td className="px-4 py-3 text-xs text-ink-soft">{new Date(event.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3">{formatEvent(event.event_type)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full ${event.status === 'failed' ? 'bg-danger-soft text-danger' : 'bg-mint-50 text-mint-600'}`}>
                        {event.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-soft">{event.ip_address || '-'}</td>
                    <td className="px-4 py-3 text-xs text-ink-soft max-w-[280px] truncate" title={event.user_agent || ''}>{event.user_agent || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t border-edge px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-xs text-ink-soft">Showing page {page} of {totalPages} ({total} records)</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="text-xs px-3 py-2 rounded-lg border border-edge disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="text-xs px-3 py-2 rounded-lg border border-edge disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
