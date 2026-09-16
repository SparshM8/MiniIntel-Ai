import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, GitCompareArrows, Loader2, RefreshCw } from 'lucide-react';
import { documentApi } from '../api';
import reconciliationApi from '../api/reconciliationApi';
import { outcomeLabel, reviewStateLabel, isVersionConflict } from '../utils/reconciliationView';

const errorText = error => error?.response?.data?.message || error?.message || 'Request failed.';
const idOf = value => value?._id || value?.id;
const requestId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export default function ReconciliationReview() {
  const [documents, setDocuments] = useState([]);
  const [documentId, setDocumentId] = useState('');
  const [records, setRecords] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [decision, setDecision] = useState('accept');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState(null);
  const requestVersion = useRef(0);
  const selected = records.find(record => idOf(record) === selectedId) || records[0];

  useEffect(() => {
    documentApi.getDocuments().then(response => {
      const data = response.data?.data || response.data || [];
      setDocuments(Array.isArray(data) ? data : []);
    }).catch(error => setNotice({ type: 'error', text: errorText(error) }));
  }, []);

  const loadRecords = async (id, preserveNotice = false) => {
    const version = ++requestVersion.current;
    setLoading(true);
    if (!preserveNotice) setNotice(null);
    try {
      const data = await reconciliationApi.listByDocument(id);
      if (version !== requestVersion.current) return;
      const next = Array.isArray(data) ? data : [];
      setRecords(next);
      setSelectedId(idOf(next[0]) || '');
    } catch (error) {
      if (version !== requestVersion.current) return;
      setRecords([]);
      setSelectedId('');
      setNotice({ type: 'error', text: errorText(error) });
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  };

  const chooseDocument = event => {
    const id = event.target.value;
    setDocumentId(id);
    setRecords([]);
    setSelectedId('');
    if (id) loadRecords(id); else requestVersion.current += 1;
  };

  const submitDecision = async event => {
    event.preventDefault();
    if (!selected || !reason.trim() || submitting) return;
    setSubmitting(true);
    setNotice(null);
    try {
      const updated = await reconciliationApi.decide(idOf(selected), {
        requestId: requestId(), decision, reason: reason.trim(), expectedVersion: selected.reviewVersion
      });
      setRecords(current => current.map(record => idOf(record) === idOf(updated) ? updated : record));
      setReason('');
      setNotice({ type: 'success', text: 'Decision recorded in the audit history.' });
    } catch (error) {
      if (isVersionConflict(error)) {
        setNotice({ type: 'error', text: 'This review changed elsewhere. Records were reloaded; review the latest version before submitting again.' });
        await loadRecords(documentId, true);
      } else setNotice({ type: 'error', text: errorText(error) });
    } finally { setSubmitting(false); }
  };

  return (
    <main className="p-3 md:p-5 max-w-[1500px] mx-auto text-slate-800 dark:text-slate-200">
      <header className="flex items-center gap-3 mb-5">
        <span className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center"><GitCompareArrows /></span>
        <div><h1 className="text-xl font-bold text-slate-900 dark:text-white">Reconciliation Review</h1><p className="text-xs text-slate-500">Compare immutable evidence and record an auditable decision.</p></div>
      </header>

      <section className="bg-white dark:bg-dark-card border border-slate-200 dark:border-[#2d3139] rounded-lg p-4 mb-5">
        <label htmlFor="reconciliation-document" className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Source document</label>
        <div className="flex gap-2">
          <select id="reconciliation-document" value={documentId} onChange={chooseDocument} disabled={submitting}
            className="flex-1 bg-slate-50 dark:bg-[#1c1f26] border border-slate-200 dark:border-[#2d3139] rounded-lg px-3 py-2 text-sm">
            <option value="">Choose a document</option>
            {documents.map(doc => <option key={idOf(doc)} value={idOf(doc)}>{doc.originalName || doc.filename || idOf(doc)}</option>)}
          </select>
          <button type="button" aria-label="Reload reconciliations" disabled={!documentId || loading || submitting} onClick={() => loadRecords(documentId)} className="px-3 rounded-lg border border-slate-300 disabled:opacity-50"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
        </div>
      </section>

      {notice && <div role={notice.type === 'error' ? 'alert' : 'status'} className={`mb-5 p-3 rounded-lg border flex gap-2 text-sm ${notice.type === 'error' ? 'text-red-600 bg-red-50 border-red-200' : 'text-emerald-700 bg-emerald-50 border-emerald-200'}`}>{notice.type === 'error' ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}{notice.text}</div>}

      {!documentId ? <Empty text="Select a source document to review its reconciliation records." /> : loading ? <Empty text="Loading reconciliation records…" loading /> : records.length === 0 ? <Empty text="No reconciliation records exist for this document." /> : (
        <div className="grid lg:grid-cols-[320px_1fr] gap-5">
          <aside className="space-y-2" aria-label="Reconciliation records">
            {records.map(record => <button type="button" key={idOf(record)} onClick={() => setSelectedId(idOf(record))} className={`w-full text-left p-3 rounded-lg border ${idOf(selected) === idOf(record) ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/20' : 'border-slate-200 dark:border-[#2d3139] bg-white dark:bg-dark-card'}`}>
              <span className="block text-sm font-semibold">{record.caseId}</span><span className="text-xs text-slate-500">{outcomeLabel(record.outcome)} · {reviewStateLabel(record.reviewState)}</span>
            </button>)}
          </aside>
          <section className="bg-white dark:bg-dark-card border border-slate-200 dark:border-[#2d3139] rounded-lg p-4 min-w-0">
            <div className="flex flex-wrap justify-between gap-2 mb-4"><div><h2 className="font-bold text-lg">{selected.caseId}</h2><p className="text-xs text-slate-500">{selected.reasonCode} · Engine {selected.engineVersion}</p></div><span className="text-xs font-semibold px-2 py-1 rounded bg-slate-100 dark:bg-slate-800">{reviewStateLabel(selected.reviewState)} · v{selected.reviewVersion}</span></div>
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
