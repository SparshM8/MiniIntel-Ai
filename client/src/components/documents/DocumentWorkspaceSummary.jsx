import React from 'react';
import { Link } from 'react-router-dom';
import { FileText, CheckCircle, Clock, XCircle, ArrowRight } from 'lucide-react';

export function DocumentWorkspaceSummary({ documents, loading, error, onReload }) {
  const cards = [
    { label: 'Documents in view', value: documents.length, detail: 'Current list and filters', Icon: FileText },
    { label: 'Processed', value: documents.filter(doc => ['completed', 'extracted'].includes(doc.status)).length, detail: 'Processing complete, not approval', Icon: CheckCircle },
    { label: 'Pending / Processing', value: documents.filter(doc => ['pending', 'processing'].includes(doc.status)).length, detail: 'Queued or being processed', Icon: Clock },
    { label: 'Failed processing', value: documents.filter(doc => doc.status === 'failed').length, detail: 'Inspect the error before retrying', Icon: XCircle }
  ];
  return <section aria-label="Document summary" className="space-y-4">
    <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">Counts cover documents returned for the current filters, not organization-wide totals. Processed does not mean reviewed or approved.</p>
    {error && <div role="alert" className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 p-4 text-sm text-red-800 dark:text-red-300">
      <p>Document list could not be refreshed. Counts are unavailable until a successful reload.</p>
      <button type="button" onClick={onReload} disabled={loading} className="mt-2 min-h-10 underline underline-offset-4 font-semibold focus-visible:outline focus-visible:outline-2">Reload documents</button>
    </div>}
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {cards.map(({ label, value, detail, Icon }) => <section aria-label={label} key={label} className="min-w-0 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-dark-card p-5 shadow-sm">
        <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300"><Icon aria-hidden="true" className="h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" /><h2 className="text-xs font-semibold">{label}</h2></div>
        <p className="mt-4 text-2xl font-semibold tabular-nums text-neutral-900 dark:text-white">{loading ? 'Loading…' : error ? 'Unavailable' : value}</p>
        <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{detail}</p>
      </section>)}
    </div>
  </section>;
}

export function DocumentNextSteps() {
  return <section aria-label="Next steps" className="rounded-xl border border-amber-200 dark:border-slate-700 bg-amber-50/50 dark:bg-dark-card p-5">
    <p className="text-xs uppercase tracking-widest font-semibold text-amber-800 dark:text-amber-400">Next steps</p>
    <h2 className="mt-2 text-base font-semibold text-neutral-900 dark:text-white">From source to review</h2>
    <ol className="mt-5 space-y-5 text-sm text-slate-700 dark:text-slate-300">
      <li><strong className="block font-medium">1. Add your evidence</strong><p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">Upload source files and check their processing status in the document list.</p></li>
      <li><strong className="block font-medium">2. Review before reporting</strong><p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">Check extracted values, units and source references. Processing success alone does not establish accuracy.</p></li>
    </ol>
    <Link to="/extraction" className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-400 hover:underline focus-visible:outline focus-visible:outline-2">Open extraction review <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
  </section>;
}
