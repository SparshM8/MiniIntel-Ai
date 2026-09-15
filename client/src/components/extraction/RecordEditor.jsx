import React, { useState, useEffect, useRef, useId } from 'react';
import { X, Save } from 'lucide-react';
import RecordEvidence from './RecordEvidence';
import { extractionApi } from '../../api';

const RecordEditor = ({ record, onSave, onClose }) => {
  const [formData, setFormData] = useState({
    value: record.value ?? '',
    unit: record.unit || '',
  });

  const dialogRef = useRef(null);
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [checking, setChecking] = useState(false);
  const [serverSnapshot, setServerSnapshot] = useState(null);

  const checkCurrentRecord = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setChecking(true);
    setServerSnapshot(null);
    try {
      const documentId = record.documentId?._id || record.documentId;
      if (!documentId) throw new Error('Document reference unavailable');
      const records = await extractionApi.getExtractedRecords(documentId);
      const current = Array.isArray(records) && records.find(item => (item.id || item._id) === (record.id || record._id));
      if (!current) throw new Error('Record unavailable in current response');
      setServerSnapshot({ value: current.value, unit: current.unit, status: current.status });
    } catch (error) {
      setSaveError(`Could not check current record. Your draft is retained. ${error.message}`);
    } finally {
      savingRef.current = false;
      setChecking(false);
    }
  };
  const titleId = useId();
  const valueId = useId();
  const unitId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement;
    dialog.showModal();
    dialog.querySelector('input[name="value"]')?.focus();
    return () => {
      dialog.close();
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  const handleClose = () => {
    if (!savingRef.current) onClose();
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

    const handleSubmit = async (e) => {
    e.preventDefault();
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError('');
    setServerSnapshot(null);
    try {
      await onSave(formData);
    } catch (error) {
      const detail = error.response?.data?.error || error.response?.data?.message || error.message;
      setSaveError(`Save was not confirmed. Your edits are retained. ${typeof detail === 'string' ? detail : 'Please retry.'}`);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const inputClass = "w-full bg-white dark:bg-[#1c1f26] border border-slate-200 dark:border-[#2d3139] rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-[#f1f5f9] placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30 transition-colors";
  const labelClass = "block text-xs font-semibold text-gray-500 dark:text-[#64748b] uppercase tracking-wider mb-1.5";

  return (
        <dialog ref={dialogRef} aria-labelledby={titleId} aria-busy={saving || checking}
      onCancel={(event) => { event.preventDefault(); handleClose(); }}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const focusable = [...dialogRef.current.querySelectorAll('button:not(:disabled), input:not(:disabled), summary')];
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first?.focus();
        }
      }}
      className="m-auto p-0 w-[calc(100%_-_2rem)] max-w-md max-h-[90vh] overflow-y-auto rounded-xl bg-white dark:bg-dark-card text-gray-900 dark:text-white shadow-2xl backdrop:bg-black/60 border border-slate-200 dark:border-[#2d3139]">
      <div>
        <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-[#2d3139] bg-slate-50/50 dark:bg-[#1c1f26]/50">
          <h3 id={titleId} className="text-base font-bold text-gray-900 dark:text-white">Edit Extracted Record</h3>
          <button type="button" aria-label="Close record editor" disabled={saving || checking} onClick={handleClose} className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#ffffff0a] rounded transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <RecordEvidence record={record} currentValue={formData.value} />
          {saveError && <div className="space-y-2">
            <p role="alert" className="text-sm text-red-700 dark:text-red-400">{saveError}</p>
            <button type="button" disabled={saving || checking} onClick={checkCurrentRecord} className="underline text-sm">
              {checking ? 'Checking current record...' : 'Check current server record'}
            </button>
          </div>}
          {serverSnapshot && <p role="status" className="text-sm">
            Current server snapshot: {String(serverSnapshot.value ?? 'unavailable')} {String(serverSnapshot.unit ?? '')}; status: {String(serverSnapshot.status ?? 'unavailable')}.
            Your draft is unchanged. An earlier request may still finish after this check.
          </p>}
          <div>
            <label className={labelClass}>Parameter</label>
            <input 
              type="text" 
              value={record.parameter || ''} 
              disabled 
              className="w-full bg-slate-50 dark:bg-[#1c1f26]/50 border border-slate-200 dark:border-[#2d3139] rounded-lg px-3 py-2 text-sm text-gray-500 dark:text-[#64748b] cursor-not-allowed"
            />
          </div>
          
          <div>
            <label htmlFor={valueId} className={labelClass}>Value</label>
            <input 
              type="text" 
              id={valueId}
              disabled={saving || checking}
              name="value"
                            value={formData.value}
              onChange={handleChange}
              className={inputClass} />
          </div>
          
          <div>
            <label htmlFor={unitId} className={labelClass}>Unit</label>
            <input 
              type="text" 
              id={unitId}
              disabled={saving || checking}
              name="unit"
              value={formData.unit} 
              onChange={handleChange}
              className={inputClass}

            />
          </div>
          
          <div className="flex justify-end gap-3 pt-4 mt-2 border-t border-slate-100 dark:border-[#2d3139]">
            <button 
              type="button" 
              disabled={saving || checking}
              onClick={handleClose}
              className="px-4 py-2 text-sm font-semibold text-gray-700 dark:text-[#94a3b8] hover:text-gray-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#ffffff0a] rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit"
              disabled={saving || checking}
              className="px-4 py-2 text-sm font-semibold bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors flex items-center gap-1.5 shadow-sm shadow-amber-500/20"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
    </div>
    </dialog>
  );
};

export default RecordEditor;
