import React from 'react';
import { evidencePresentation } from '../../utils/evidencePresentation';

export default function RecordEvidence({ record, currentValue = record.value }) {
  const evidence = evidencePresentation(record, currentValue);
  return (
    <details className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 text-xs max-w-lg">
      <summary className="cursor-pointer font-semibold text-amber-700 dark:text-amber-400 focus-visible:outline focus-visible:outline-2">
        Source evidence: {record.parameter || 'record'}
      </summary>
      <div className="mt-3 space-y-2 text-gray-700 dark:text-slate-300 break-words">
        <p className="font-semibold">{evidence.label}</p>
        <p>{evidence.location}</p>
        {evidence.reason && <p>Reason: {evidence.reason.replaceAll('_', ' ')}</p>}
        <p className="text-amber-700 dark:text-amber-400" role="status">{evidence.warning}</p>
        <dl className="space-y-1">
          <div><dt className="inline font-semibold">Current value: </dt><dd className="inline">{String(currentValue ?? 'unavailable')}</dd></div>
          <div><dt className="inline font-semibold">Extracted value: </dt><dd className="inline">{String(record.originalValue ?? 'unavailable')}</dd></div>
          <div><dt className="inline font-semibold">Period: </dt><dd className="inline">{record.period || 'unavailable'}</dd></div>
          <div><dt className="inline font-semibold">Mine: </dt><dd className="inline">{record.mineName || record.mine || 'unavailable'}</dd></div>
          <div><dt className="inline font-semibold">Subsidiary: </dt><dd className="inline">{record.subsidiary || 'unavailable'}</dd></div>
        </dl>
        <p className="font-semibold">Stored extraction excerpt (not independently verified)</p>
        <pre className="whitespace-pre-wrap break-words max-h-40 overflow-auto rounded bg-slate-50 dark:bg-slate-900 p-2 font-sans">{record.sourceText || 'No source excerpt available.'}</pre>
      </div>
    </details>
  );
}
