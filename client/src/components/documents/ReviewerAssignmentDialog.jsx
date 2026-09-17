import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import documentApi from '../../api/documentApi';
import userApi from '../../api/userApi';
import { assignmentIds, confirmAssignmentSave, MAX_REVIEWERS, parseAssignmentLoad, sameAssignments } from '../../utils/reviewerAssignments';

export default function ReviewerAssignmentDialog({ document, onClose }) {
  const documentId = document._id || document.id;
  const dialog = useRef(null);
  const request = useRef(null);
  const generation = useRef(0);
  const saving = useRef(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);
  const [choices, setChoices] = useState([]);
  const [selected, setSelected] = useState([]);
  const [baseline, setBaseline] = useState([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (saving.current) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const current = ++generation.current;
    setLoading(true);
    setReady(false);
    setError('');
    setMessage('');
    try {
      const config = { signal: controller.signal, timeout: 15000 };
      const [doc, users] = await Promise.all([
        documentApi.getDocumentById(documentId, config), userApi.getUsers(config)
      ]);
      if (generation.current !== current) return;
      const result = parseAssignmentLoad(doc, users, documentId);
      setChoices(result.choices);
      setSelected(result.selected);
      setBaseline(result.selected);
      setSearch('');
      setReady(true);
    } catch (err) {
      if (generation.current !== current) return;
      setError(`Could not load assignments. ${err.response?.data?.message || err.message || 'Please retry.'}`);
    } finally {
      if (generation.current === current) setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    const opener = window.document.activeElement;
    const modal = dialog.current;
    modal.showModal();
    load();
    return () => {
      generation.current++;
      request.current?.abort();
      modal.close();
      if (opener?.isConnected) opener.focus();
    };
  }, [load]);

  const unavailable = selected.some(id => !choices.find(choice => choice.id === id)?.eligible);
  const changed = !sameAssignments(selected, baseline);
  const visible = choices.filter(choice =>
    `${choice.name} ${choice.department}`.toLowerCase().includes(search.toLowerCase()));

  const keepFocus = event => {
    if (event.key !== 'Tab') return;
    const controls = [...dialog.current.querySelectorAll('button, input')]
      .filter(control => !control.matches(':disabled') && control.getClientRects().length);
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (!first) {
      event.preventDefault();
    } else if (event.shiftKey && event.target === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && event.target === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const save = async event => {
    event.preventDefault();
    if (saving.current || !ready || !changed || unavailable || selected.length > MAX_REVIEWERS) return;
    saving.current = true;
    setPending(true);
    setError('');
    setMessage('');
    const current = ++generation.current;
    const controller = new AbortController();
    request.current = controller;
    try {
      const requested = assignmentIds(selected);
      const response = await documentApi.assignReviewers(documentId, requested, { signal: controller.signal, timeout: 30000 });
      if (generation.current !== current) return;
      const saved = confirmAssignmentSave(response, documentId, requested);
      setSelected(saved);
      setBaseline(saved);
      setMessage(saved.length ? `Reviewer assignments saved (${saved.length}).` : 'All reviewer assignments removed.');
    } catch (err) {
      if (generation.current !== current) return;
      setReady(false);
      setError(`Save not confirmed. ${err.response?.data?.message || err.message || 'Request failed.'} The server may have applied changes. Reload assignments before saving again.`);
    } finally {
      saving.current = false;
      if (generation.current === current) setPending(false);
    }
  };

  return (
    <dialog ref={dialog} aria-labelledby="assignment-title" aria-describedby="assignment-description"
      onKeyDown={keepFocus}
      onCancel={event => { event.preventDefault(); if (!saving.current) onClose(); }}
      className="m-auto w-[calc(100%_-_2rem)] max-w-xl max-h-[90vh] overflow-y-auto rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-dark-card text-slate-900 dark:text-slate-100 p-5 backdrop:bg-black/60">
      <form onSubmit={save} className="space-y-4" aria-busy={loading || pending}>
        <div className="flex items-start justify-between gap-3">
          <h2 id="assignment-title" className="text-lg font-semibold">Assign reviewers</h2>
          <button type="button" disabled={pending} onClick={onClose} aria-label="Close reviewer assignments"
            title="Close reviewer assignments" className="flex h-8 w-8 shrink-0 items-center justify-center rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"><X className="h-4 w-4" aria-hidden="true" /></button>
        </div>
        <p id="assignment-description" className="break-words font-medium">{document.originalName}</p>
        {loading && <p role="status">Loading assignments...</p>}
        {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300 break-words">{error}</p>}
        {message && <p role="status" className="text-sm text-green-700 dark:text-green-300">{message}</p>}
        {!loading && !ready && (
          <button type="button" onClick={load} disabled={pending} className="rounded border px-3 py-2">Reload assignments</button>
        )}
        {!loading && ready && (
          <>
            <label className="block text-sm">Search reviewers
              <input value={search} onChange={event => setSearch(event.target.value)} disabled={pending}
                className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-600 bg-transparent p-2" />
            </label>
            <p className="text-sm" aria-live="polite">{selected.length} / {MAX_REVIEWERS} selected</p>
            {unavailable && <p role="alert" className="text-sm text-amber-700 dark:text-amber-300">Remove unavailable assignments before saving. They cannot be reassigned unless the account becomes an active reviewer.</p>}
            {selected.length > MAX_REVIEWERS && <p role="alert">Remove assignments to stay within the 100-reviewer limit.</p>}
            <fieldset disabled={pending} className="space-y-2 max-h-64 overflow-y-auto">
              <legend className="sr-only">Reviewer selection</legend>
              {visible.map(choice => {
                const checked = selected.includes(choice.id);
                return (
                  <label key={choice.id} className="flex items-start gap-3 rounded border border-slate-200 dark:border-slate-700 p-3 break-words">
                    <input type="checkbox" checked={checked} className="mt-1 shrink-0"
                      disabled={!checked && (!choice.eligible || selected.length >= MAX_REVIEWERS)}
                      onChange={() => { setMessage(''); setSelected(previous => checked ? previous.filter(id => id !== choice.id) : [...previous, choice.id]); }} />
                    <span className="min-w-0 text-sm">{choice.name}{choice.department && ` - ${choice.department}`}{!choice.eligible && ' (unavailable; remove only)'}</span>
                  </label>
                );
              })}
              {!visible.length && <p className="text-sm">{choices.length ? 'No reviewers match your search.' : 'No active reviewers available.'}</p>}
            </fieldset>
            <button type="button" disabled={pending || !selected.length} onClick={() => { setSelected([]); setMessage(''); }}
              className="rounded border px-3 py-2 text-sm disabled:opacity-50">Clear selection</button>
            {changed && selected.length === 0 && <p className="text-sm">Saving will remove all delegated reviewers from this document.</p>}
          </>
        )}
        <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200 dark:border-slate-700 pt-4">
          <button type="button" disabled={pending} onClick={onClose} className="rounded border px-4 py-2 disabled:opacity-50">Cancel</button>
          <button type="submit" disabled={loading || pending || !ready || !changed || unavailable || selected.length > MAX_REVIEWERS}
            className="rounded bg-amber-600 text-white px-4 py-2 disabled:opacity-50">{pending ? 'Saving assignments...' : 'Save assignments'}</button>
        </div>
      </form>
    </dialog>
  );
}