'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Shell from '@/components/Shell';
import { toast } from '@/components/Toast';
import { inr, inrShort, fmtDate, fmtMonthYear, statusColor, statusLabel } from '@/lib/format';
import { getAccruedMonthsCount } from '@/lib/debtInterest';
import { buildSnapshotFilename, copyOrDownloadElementImage, TILE_SNAPSHOT_BG } from '@/lib/clipboardImage';

function instrumentTagLabel(value) {
  if (value === 'temp') return 'Temp';
  if (value === 'short_term') return 'Short term';
  if (value === 'long_term') return 'Long term';
  return value || '';
}

function alertTone(status) {
  return status === 'overdue'
    ? 'bg-danger/10 border-danger/20 text-danger'
    : 'bg-honey-50 border-honey-600/20 text-honey-600';
}

function priorityLabel(value) {
  if (value === 'all') return 'All priorities';
  if (value === 'none') return 'No priority';
  return `P${value}`;
}

export default function DebtsClient({ user }) {
  const [debts, setDebts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [instrumentTags, setInstrumentTags] = useState([]);
  const [priorities, setPriorities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all | active | cleared
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [viewMode, setViewMode] = useState('list');
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkTag, setBulkTag] = useState('');
  const [bulkPriority, setBulkPriority] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);

  const loadDebts = useCallback(() => {
    setLoading(true);
    fetch('/api/debts')
      .then(r => r.json())
      .then((data) => {
        setDebts(data.debts || []);
        setCategories(data.categories || []);
        setInstrumentTags(data.instrument_tags || []);
        setPriorities(data.priorities || []);
        setSelectedIds([]);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    loadDebts();
  }, [loadDebts]);

  const alerts = useMemo(
    () => debts.filter((debt) => debt.status === 'active' && debt.urgency_status !== 'none'),
    [debts]
  );

  const filtered = debts
    .filter(d => filter === 'all' ? true : filter === 'active' ? d.status === 'active' : d.status === 'cleared')
    .filter(d => categoryFilter === 'all' ? true : d.category === categoryFilter)
    .filter(d => tagFilter === 'all' ? true : d.instrument_tag === tagFilter)
    .filter(d => {
      if (priorityFilter === 'all') return true;
      if (priorityFilter === 'none') return d.priority == null;
      return Number(d.priority) === Number(priorityFilter);
    })
    .filter(d => {
      const term = search.trim().toLowerCase();
      if (!term) return true;
      return [d.lender_name, d.notes, d.category, d.instrument_tag, instrumentTagLabel(d.instrument_tag)]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(term));
    });

  const allVisibleSelected = filtered.length > 0 && filtered.every((debt) => selectedIds.includes(debt.id));

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedIds((existing) => existing.filter((id) => !filtered.some((debt) => debt.id === id)));
      return;
    }
    setSelectedIds((existing) => {
      const merged = new Set(existing);
      filtered.forEach((debt) => merged.add(debt.id));
      return Array.from(merged);
    });
  };

  const toggleSelectDebt = (debtId) => {
    setSelectedIds((existing) => existing.includes(debtId)
      ? existing.filter((id) => id !== debtId)
      : [...existing, debtId]);
  };

  const handleBulkApply = async () => {
    if (!selectedIds.length) {
      toast('Select at least one debt.', 'error');
      return;
    }
    if (bulkCategory.trim() === '' && bulkTag === '' && bulkPriority === '') {
      toast('Choose a category, tag, or priority to update.', 'error');
      return;
    }

    setBulkSaving(true);
    try {
      const payload = {};
      if (bulkCategory.trim() !== '') payload.category = bulkCategory.trim();
      if (bulkTag !== '') payload.instrument_tag = bulkTag === 'none' ? null : bulkTag;
      if (bulkPriority !== '') payload.priority = bulkPriority === 'none' ? null : Number(bulkPriority);

      const responses = await Promise.all(
        selectedIds.map((id) => fetch(`/api/debts/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }))
      );

      const failures = [];
      responses.forEach((response, index) => {
        if (!response.ok) {
          const failedId = selectedIds[index];
          const debtName = debts.find((debt) => debt.id === failedId)?.lender_name || failedId;
          failures.push({ name: debtName, status: response.status });
        }
      });
      const failed = failures.length;
      if (failed > 0) {
        console.error('Bulk debt update failed for:', failures);
        const failedLabel = failures.slice(0, 2).map((entry) => `${entry.name} (${entry.status})`).join(', ');
        toast(`Updated ${selectedIds.length - failed}/${selectedIds.length} debts.`, failed === selectedIds.length ? 'error' : 'info');
        toast(`Failed: ${failedLabel}${failed > 2 ? ` +${failed - 2} more` : ''}`, 'error');
      } else {
        toast(`Updated ${selectedIds.length} debts.`);
      }

      setBulkCategory('');
      setBulkTag('');
      setBulkPriority('');
      loadDebts();
    } catch (err) {
      toast('Could not apply bulk update.', 'error');
    } finally {
      setBulkSaving(false);
    }
  };

  const handleCopyTile = async (debtId, lenderName) => {
    const element = document.querySelector(`[data-copy-tile="debt-${debtId}"]`);
    if (!element) {
      toast('Could not find tile to copy.', 'error');
      return;
    }

    try {
      const result = await copyOrDownloadElementImage(
        element,
        buildSnapshotFilename(lenderName, 'tile'),
        { padding: 14, backgroundColor: TILE_SNAPSHOT_BG }
      );
      if (result === 'copied') toast('Section copied as image. Paste anywhere.');
      else toast('Clipboard unavailable. Section image downloaded.', 'info');
    } catch (finalErr) {
      toast('Could not copy section image.', 'error');
    }
  };

  return (
    <Shell user={user}>
      <div className="px-4 md:px-8 py-5 md:py-6 max-w-5xl mx-auto w-full">
        <div className="flex items-center justify-between mb-4 gap-3">
          <div>
            <h1 className="text-xl font-medium">All debts</h1>
            <p className="text-xs text-ink-mute mt-1">Track category, payoff priority, and upcoming target alerts.</p>
          </div>
          <Link href="/debts/new" className="btn-primary py-1.5 px-3 rounded-lg text-xs font-medium whitespace-nowrap">
            + Add
          </Link>
        </div>

        {alerts.length > 0 && (
          <div className="mb-4 space-y-2">
            {alerts.slice(0, 3).map((debt) => (
              <Link
                key={debt.id}
                href={`/debts/${debt.id}`}
                className={`block rounded-2xl border px-4 py-3 ${alertTone(debt.urgency_status)}`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-danger mt-0.5" aria-hidden="true">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{debt.lender_name}</p>
                    <p className="text-xs mt-1">{debt.urgency_message} · target {fmtDate(debt.target_date)}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        <div className="grid md:grid-cols-[1fr,180px,180px,170px] gap-3 mb-4">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by lender, notes, or category"
            className="field-input"
          />
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="field-input">
            <option value="all">All categories</option>
            {categories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
          <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} className="field-input">
            <option value="all">All tags</option>
            {instrumentTags.map((tag) => (
              <option key={tag} value={tag}>{instrumentTagLabel(tag)}</option>
            ))}
          </select>
          <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="field-input">
            <option value="all">All priorities</option>
            <option value="none">No priority</option>
            {priorities.map((priority) => (
              <option key={priority} value={priority}>P{priority}</option>
            ))}
          </select>
        </div>

        <div className="flex gap-2 mb-4 flex-wrap items-center justify-between">
          <div className="flex gap-2 flex-wrap">
            {['all', 'active', 'cleared'].map(f => (
              <button key={f} onClick={() => setFilter(f)} className={`chip text-xs capitalize ${filter === f ? 'on' : ''}`}>
                {f}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setViewMode('list')} className={`chip text-xs ${viewMode === 'list' ? 'on' : ''}`}>List view</button>
            <button onClick={() => setViewMode('tile')} className={`chip text-xs ${viewMode === 'tile' ? 'on' : ''}`}>Tile view</button>
          </div>
        </div>

        <section className="bg-paper-card border border-edge rounded-2xl p-3.5 mb-4">
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[auto,minmax(0,1fr),180px,180px,auto,auto] items-center">
            <label className="flex items-center gap-2 text-xs text-ink-soft">
              <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible} className="accent-ink" />
              Select visible
            </label>
            <input
              type="text"
              value={bulkCategory}
              onChange={(e) => setBulkCategory(e.target.value)}
              placeholder="Bulk category (leave blank to skip)"
              className="field-input"
            />
            <select value={bulkTag} onChange={(e) => setBulkTag(e.target.value)} className="field-input">
              <option value="">Bulk tag (skip)</option>
              <option value="none">Clear tag</option>
              <option value="temp">Temp</option>
              <option value="short_term">Short term</option>
              <option value="long_term">Long term</option>
            </select>
            <select value={bulkPriority} onChange={(e) => setBulkPriority(e.target.value)} className="field-input">
              <option value="">Bulk priority (skip)</option>
              <option value="none">Clear priority</option>
              {[1,2,3,4,5,6,7,8,9,10].map((value) => (
                <option key={value} value={value}>P{value}</option>
              ))}
            </select>
            <p className="text-xs text-ink-mute" aria-live="polite" aria-label="Selected items count and priority filter status">
              {selectedIds.length} selected · {priorityLabel(priorityFilter)}
            </p>
            <button
              onClick={handleBulkApply}
              disabled={bulkSaving || selectedIds.length === 0}
              className="btn-primary py-2 px-3 rounded-lg text-xs font-medium whitespace-nowrap"
            >
              {bulkSaving ? 'Applying…' : 'Apply bulk update'}
            </button>
          </div>
        </section>

        {loading && (
          <div className="space-y-3">
            {[1,2,3].map(i => (
              <div key={i} className="h-20 bg-paper-tint rounded-xl animate-pulse" />
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="text-center py-16">
            <p className="text-ink-mute text-sm mb-4">No debts found.</p>
            <Link href="/debts/new" className="btn-primary py-2 px-5 rounded-lg text-sm inline-block">
              Add a debt
            </Link>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className={viewMode === 'tile' ? 'grid sm:grid-cols-2 gap-3' : 'space-y-3'}>
            {filtered.map(d => {
              const unpaidInterest = Number(d.unpaid_interest || 0);
              const totalOwed = Number(d.outstanding_total || Number(d.current_principal || 0) + unpaidInterest);
              const interestMonths = getAccruedMonthsCount(d.interest_start_month, d.interest_to_month);

              return (
                <div key={d.id} className="flex gap-2 items-start">
                  <label className="mt-4">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(d.id)}
                      onChange={() => toggleSelectDebt(d.id)}
                      className="accent-ink"
                    />
                  </label>
                  <div className="flex-1">
                    <button
                      type="button"
                      onClick={() => handleCopyTile(d.id, d.lender_name)}
                      className="snapshot-action mb-2 flex w-full rounded-xl px-3 py-2 text-xs font-medium"
                      title="Copy this section as image"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                      Copy this section
                    </button>
                    <Link
                      href={`/debts/${d.id}`}
                      data-copy-tile={`debt-${d.id}`}
                      className={`block bg-paper-card border border-edge rounded-2xl p-4 hover:border-ink-soft transition ${viewMode === 'tile' ? 'h-full' : ''}`}
                    >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <p className="font-medium text-sm truncate">{d.lender_name}</p>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusColor(d.status)}`}>
                            {statusLabel(d.status)}
                          </span>
                          {d.category && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 font-medium">
                              {d.category}
                            </span>
                          )}
                          {d.instrument_tag && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">
                              {instrumentTagLabel(d.instrument_tag)}
                            </span>
                          )}
                          {d.priority != null && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-plum-50 text-plum-600 font-medium">
                              P{d.priority}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-ink-mute">
                          {d.interest_rate}% /mo · since {fmtDate(d.start_date)}
                          {d.target_date ? ` · target ${fmtDate(d.target_date)}` : ''}
                        </p>
                        {d.urgency_status !== 'none' && (
                          <p className={`text-[11px] mt-1 font-medium ${d.urgency_status === 'overdue' ? 'text-danger' : 'text-honey-700'}`}>
                            {d.urgency_message}
                          </p>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-medium">{inrShort(totalOwed)}</p>
                        <p className="text-[11px] text-danger">{inrShort(d.current_monthly_interest)}/mo interest</p>
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-edge flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-mute">
                      <span>Paid: <span className="text-mint-600 font-medium">{inr(d.total_paid)}</span></span>
                      <span>Interest paid: <span className="text-sky-600 font-medium">{inr(d.total_interest_paid)}</span></span>
                      <span>
                        Unpaid interest: <span className="text-danger font-medium">{inr(unpaidInterest)}</span>
                        {unpaidInterest > 0 && d.interest_start_month && d.interest_to_month && (
                          <span className="text-ink-mute">
                            {' '}({fmtMonthYear(d.interest_start_month)} – {fmtMonthYear(d.interest_to_month)} · {interestMonths} mo)
                          </span>
                        )}
                      </span>
                      <span className="ml-auto">Total owed: <span className="text-ink font-medium">{inr(totalOwed)}</span></span>
                    </div>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Shell>
  );
}
