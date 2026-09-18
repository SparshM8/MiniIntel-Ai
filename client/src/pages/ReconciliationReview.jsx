import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, GitCompareArrows, Loader2, RefreshCw, Search } from 'lucide-react';
import { documentApi } from '../api';
import reconciliationApi from '../api/reconciliationApi';
import { outcomeLabel, reviewStateLabel, isVersionConflict } from '../utils/reconciliationView';

const errorText = error => error?.response?.data?.message || error?.message || 'Request failed.';
const idOf = value => value?._id || value?.id;
const requestId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export default function ReconciliationReview() {
  const [documents, setDocuments] = useState([]);
  const [documentId, setDocumentId] = useState('');
  const [reviewState, setReviewState] = useState('pending');
  const [outcome, setOutcome] = useState('');
  const [caseInput, setCaseInput] = useState('');
  const [caseId, setCaseId] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [meta, setMeta] = useState({ total: 0, pages: 0 });
  const [records, setRecords] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [decision, setDecision] = useState('accept');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState(null);
  const requestVersion = useRef(0);
  const submitLock = useRef(false);
  const selected = records.find(record => idOf(record) === selectedId) || records[0];

  useEffect(() => {
    documentApi.getDocuments().then(response => {
      const data = response.data?.data || response.data || [];
      setDocuments(Array.isArray(data) ? data : []);
    }).catch(error => setNotice({ type: 'error', text: errorText(error) }));
  }, []);

  const loadRecords = async (preserveNotice = false, signal) => {
    const version = ++requestVersion.current;
    setLoading(true);
    setRecords([]);
    setSelectedId('');
    setReason('');
    if (!preserveNotice) setNotice(null);
    try {
      const response = await reconciliationApi.listQueue({ page, limit,
        ...(documentId && { documentId }), ...(reviewState && { reviewState }),
        ...(outcome && { outcome }), ...(caseId && { caseId }) }, { signal });
      if (version !== requestVersion.current) return;
      if (!response.success || !Array.isArray(response.data) || !Number.isSafeInteger(response.meta?.total)
        || response.meta.total < 0 || !Number.isSafeInteger(response.meta?.pages) || response.meta.pages < 0) {
        throw new Error('Unexpected review queue response. Reload to try again.');
      }
      if (page > 1 && page > response.meta.pages) {
        setPage(Math.max(1, response.meta.pages));
        return;
      }
      const next = response.data;
      setRecords(next);
      setMeta(response.meta);
      setSelectedId(idOf(next[0]) || '');
    } catch (error) {
      if (version !== requestVersion.current) return;
      setRecords([]);
      setMeta({ total: 0, pages: 0 });
      setSelectedId('');
      setNotice({ type: 'error', text: errorText(error) });
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    loadRecords(false, controller.signal);
    return () => { requestVersion.current += 1; controller.abort(); };
  }, [documentId, reviewState, outcome, caseId, page, limit]);

  const chooseDocument = event => {
    setDocumentId(event.target.value);
    setPage(1);
  };

  const submitDecision = async event => {
    event.preventDefault();
    if (!selected || !reason.trim() || submitLock.current || loading) return;
    submitLock.current = true;
    setSubmitting(true);
    setNotice(null);
    try {
      await reconciliationApi.decide(idOf(selected), {
        requestId: requestId(), decision, reason: reason.trim(), expectedVersion: selected.reviewVersion
      });
      setReason('');
      setNotice({ type: 'success', text: 'Decision recorded in the audit history.' });
      await loadRecords(true);
    } catch (error) {
      if (isVersionConflict(error)) {
        setNotice({ type: 'error', text: 'This review changed elsewhere. Records were reloaded; review the latest version before submitting again.' });
        await loadRecords(true);
      } else setNotice({ type: 'error', text: errorText(error) });
    } finally { submitLock.current = false; setSubmitting(false); }
  };

  return (
    <main className="p-3 md:p-5 max-w-[1500px] mx-auto text-slate-800 dark:text-slate-200">
      <header className="flex items-center gap-3 mb-5">
        <span className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center"><GitCompareArrows /></span>
        <div><h1 className="text-xl font-bold text-slate-900 dark:text-white">Reconciliation Review</h1></div>
      </header>

      <section className="bg-white dark:bg-dark-card border border-slate-200 dark:border-[#2d3139] rounded-lg p-4 mb-5">
        <label htmlFor="reconciliation-document" className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Source document</label>
        <div className="flex gap-2 min-w-0">
          <select id="reconciliation-document" value={documentId} onChange={chooseDocument} disabled={submitting}
            className="flex-1 min-w-0 bg-slate-50 dark:bg-[#1c1f26] border border-slate-200 dark:border-[#2d3139] rounded-lg px-3 py-2 text-sm">
            <option value="">All accessible documents</option>
            {documents.map(doc => <option key={idOf(doc)} value={idOf(doc)}>{doc.originalName || doc.filename || idOf(doc)}</option>)}
          </select>
          <button type="button" aria-label="Reload reconciliations" title="Reload reconciliations" disabled={loading || submitting} onClick={() => loadRecords()} className="px-3 rounded-lg border border-slate-300 disabled:opacity-50"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
        </div>
        <fieldset disabled={submitting} className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3 mt-3 min-w-0">
          <label className="text-xs font-semibold min-w-0">Review state<select aria-label="Review state" value={reviewState} onChange={event => { setReviewState(event.target.value); setPage(1); }} className="block mt-1 w-full rounded border p-2 text-sm bg-white dark:bg-[#1c1f26]">
            <option value="">All states</option>{['pending', 'accepted', 'rejected', 'correction_requested'].map(value => <option key={value} value={value}>{reviewStateLabel(value)}</option>)}
          </select></label>
          <label className="text-xs font-semibold min-w-0">Outcome<select aria-label="Outcome" value={outcome} onChange={event => { setOutcome(event.target.value); setPage(1); }} className="block mt-1 w-full rounded border p-2 text-sm bg-white dark:bg-[#1c1f26]">
            <option value="">All outcomes</option>{['matched', 'converted', 'conflict', 'incompatible', 'insufficient_evidence'].map(value => <option key={value} value={value}>{outcomeLabel(value)}</option>)}
          </select></label>
          <form onSubmit={event => { event.preventDefault(); setCaseId(caseInput.trim()); setPage(1); }} className="min-w-0">
            <label htmlFor="queue-case" className="text-xs font-semibold">Case ID (exact)</label>
            <div className="flex gap-1 mt-1"><input id="queue-case" value={caseInput} maxLength={200} onChange={event => setCaseInput(event.target.value)} className="min-w-0 w-full rounded border p-2 text-sm bg-white dark:bg-[#1c1f26]" /><button aria-label="Find case" title="Find case" className="border rounded px-2"><Search className="w-4 h-4" /></button></div>
          </form>
          <label className="text-xs font-semibold">Rows per page<select aria-label="Rows per page" value={limit} onChange={event => { setLimit(Number(event.target.value)); setPage(1); }} className="block mt-1 w-full rounded border p-2 text-sm bg-white dark:bg-[#1c1f26]">{[20, 50, 100].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        </fieldset>
      </section>

      {notice && <div role={notice.type === 'error' ? 'alert' : 'status'} className={`mb-5 p-3 rounded-lg border flex gap-2 text-sm ${notice.type === 'error' ? 'text-red-600 bg-red-50 border-red-200' : 'text-emerald-700 bg-emerald-50 border-emerald-200'}`}>{notice.type === 'error' ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}{notice.text}</div>}

      <nav aria-label="Review queue pages" className="flex flex-wrap items-center justify-between gap-2 mb-3 text-sm">
        <span aria-live="polite">{loading ? 'Loading...' : `${meta.total} records`}</span>
        <div className="flex items-center gap-3"><button aria-label="Previous page" title="Previous page" disabled={page <= 1 || loading || submitting} onClick={() => setPage(current => current - 1)} className="p-2 border rounded disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button><span>Page {page} of {Math.max(1, meta.pages)}</span><button aria-label="Next page" title="Next page" disabled={page >= meta.pages || loading || submitting} onClick={() => setPage(current => current + 1)} className="p-2 border rounded disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button></div>
      </nav>
      {loading ? <Empty text="Loading reconciliation records…" loading /> : records.length === 0 ? <Empty text="No records match these filters." /> : (
        <div className="grid lg:grid-cols-[320px_1fr] gap-5">
          <aside className="space-y-2 max-h-[320px] lg:max-h-[680px] overflow-y-auto min-w-0" aria-label="Reconciliation records">
            {records.map(record => <button type="button" key={idOf(record)} disabled={submitting} aria-pressed={idOf(selected) === idOf(record)} onClick={() => { setSelectedId(idOf(record)); setReason(''); setDecision('accept'); }} className={`w-full text-left p-3 rounded-lg border break-words ${idOf(selected) === idOf(record) ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/20' : 'border-slate-200 dark:border-[#2d3139] bg-white dark:bg-dark-card'}`}>
              <span className="block text-sm font-semibold">{record.caseId}</span><span className="block text-xs text-slate-500">{record.documentName}</span><span className="text-xs text-slate-500">{outcomeLabel(record.outcome)} · {reviewStateLabel(record.reviewState)}</span>
            </button>)}
          </aside>
          <section className="bg-white dark:bg-dark-card border border-slate-200 dark:border-[#2d3139] rounded-lg p-4 min-w-0">
            <div className="flex flex-wrap justify-between gap-2 mb-4 break-words"><div className="min-w-0"><h2 className="font-bold text-lg">{selected.caseId}</h2><p className="text-xs text-slate-500">{selected.reasonCode} · Engine {selected.engineVersion}</p></div><span className="text-xs font-semibold px-2 py-1 rounded bg-slate-100 dark:bg-slate-800">{reviewStateLabel(selected.reviewState)} · v{selected.reviewVersion}</span></div>
            <div className="overflow-x-auto mb-5"><table className="w-full text-sm"><thead><tr className="text-left border-b"><th className="py-2">Fact</th><th>Original</th><th>Normalized</th><th>Revision</th></tr></thead><tbody>{(selected.operands || []).map(operand => <tr key={`${operand.factId}-${operand.sourceRevisionId}`} className="border-b border-slate-100 dark:border-slate-800"><td className="py-3 font-medium">{operand.factId}</td><td>{operand.originalValue} {operand.originalUnit}</td><td>{operand.normalizedValue} {operand.normalizedUnit}</td><td className="font-mono text-xs">{operand.sourceRevisionId}</td></tr>)}</tbody></table></div>
            <form onSubmit={submitDecision} className="border-t pt-4">
              <fieldset disabled={submitting} className="space-y-3"><legend className="font-semibold mb-2">Reviewer decision</legend><div className="flex flex-wrap gap-4">{[['accept','Accept'],['reject','Reject'],['request_correction','Request correction']].map(([value,label]) => <label key={value} className="flex gap-2 items-center text-sm"><input type="radio" name="decision" value={value} checked={decision === value} onChange={event => setDecision(event.target.value)} />{label}</label>)}</div>
                <label className="block text-sm font-medium">Reason<textarea required value={reason} onChange={event => setReason(event.target.value)} rows="3" className="mt-1 w-full rounded-lg border border-slate-300 dark:border-[#2d3139] bg-white dark:bg-[#1c1f26] p-2" /></label>
                <button disabled={!reason.trim() || submitting} className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-semibold">{submitting ? 'Recording…' : 'Record decision'}</button>
              </fieldset>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}

function Empty({ text, loading = false }) {
  return <div className="min-h-[320px] rounded-lg border border-dashed border-slate-300 dark:border-[#2d3139] flex flex-col items-center justify-center gap-3 text-sm text-slate-500">{loading && <Loader2 className="w-6 h-6 animate-spin text-amber-500" />}<p>{text}</p></div>;
}
