import React, { useState, useEffect } from 'react';
import { Cloud, List, RefreshCw, Search, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../api/client';

const TopicsExplorer = () => {
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [overview, setOverview] = useState(null);
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState('');
  const [view, setView] = useState('cloud');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    const fetchTopics = async () => {
      setLoading(true);
      setError(null);
      setOverview(null);
      setTopics([]);
      setSelected(null);
      try {
        const res = await api.get('/topics', { signal: controller.signal });
        const data = res.data;
        if (!Array.isArray(data?.data) || !Array.isArray(data?.wordCloud) ||
            !['analyzedDocuments', 'processedDocuments', 'topicCount'].every(key => Number.isSafeInteger(data.meta?.[key]) && data.meta[key] >= 0) ||
            !data.data.every(topic => typeof topic.name === 'string' && Number.isSafeInteger(topic.documentCount) && topic.documentCount > 0) ||
            !data.wordCloud.every(word => typeof word.text === 'string' && Number.isSafeInteger(word.count) && word.count > 0 && Number.isSafeInteger(word.documentCount) && word.documentCount > 0)) {
          throw new Error('Invalid topics response');
        }
        if (controller.signal.aborted) return;
        setTopics(res.data.data);
        setOverview(data);
        setError(null);
      } catch (err) {
        if (!controller.signal.aborted) setError('Topics are unavailable. Please reload.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    fetchTopics();
    return () => controller.abort();
  }, [revision]);

  const words = (overview?.wordCloud || []).filter(word => word.text.includes(query.trim().toLocaleLowerCase()));
  const filteredTopics = topics.filter(topic => topic.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const maximum = Math.max(1, ...(overview?.wordCloud || []).map(word => word.count));
  const count = key => loading ? 'Loading...' : error ? 'Unavailable' : overview?.meta[key] ?? 0;
  const palette = ['#166534', '#9f1239', '#155e75', '#854d0e', '#4338ca'];

  return (
    <div className="p-5 max-w-7xl mx-auto text-gray-800 dark:text-neutral-200 min-w-0">
      <header className="flex items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold">Topics Explorer</h1>
        <button type="button" title="Reload topics" aria-label="Reload topics" disabled={loading} onClick={() => setRevision(value => value + 1)} className="p-2 rounded border border-gray-300 disabled:opacity-40">
          <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
        </button>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-y border-gray-200 dark:border-neutral-700 py-4 mb-6">
        {[
          ['Processed documents', 'processedDocuments'],
          ['Documents with topics', 'analyzedDocuments'],
          ['Discovered topics', 'topicCount']
        ].map(([label, key]) => <section key={key} aria-label={label}>
          <h2 className="text-sm text-gray-500 dark:text-neutral-400">{label}</h2>
          <p className="text-xl font-semibold mt-1" aria-live="polite">{count(key)}</p>
        </section>)}
      </div>
      {error && <p role="alert" className="text-red-700 dark:text-red-300 mb-4">{error}</p>}
      {!loading && !error && <>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <label className="flex items-center gap-2 border rounded px-3 py-2 min-w-0 w-full sm:w-72">
            <Search size={18} className="shrink-0" />
            <input aria-label="Filter topics and words" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search topics and words" className="bg-transparent min-w-0 w-full outline-none" />
          </label>
          <div className="flex gap-1" role="group" aria-label="Word display">
            {[[Cloud, 'cloud', 'Word cloud'], [List, 'list', 'Word frequencies']].map(([Icon, mode, label]) => <button key={mode} type="button" title={label} aria-label={label} aria-pressed={view === mode} onClick={() => setView(mode)} className={`p-2 border rounded ${view === mode ? 'bg-gray-200 dark:bg-neutral-700' : ''}`}><Icon size={20} /></button>)}
          </div>
        </div>
        <section aria-label="Word frequencies" className="border-b border-gray-200 dark:border-neutral-700 pb-6">
          <h2 className="text-lg font-semibold mb-3">Document Word Cloud</h2>
          {!words.length ? <p className="text-gray-500 dark:text-neutral-400 py-8">{query ? 'No matching words.' : 'No processed document text available.'}</p> : view === 'cloud' ? <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3 min-h-64 py-6 bg-white rounded" aria-label="Word cloud visualization">
            {words.map((word, index) => <button key={word.text} type="button" title={`${word.text}: ${word.count} occurrences in ${word.documentCount} documents`} aria-label={`${word.text}: ${word.count} occurrences in ${word.documentCount} documents`} aria-pressed={selected?.text === word.text} onClick={() => setSelected(word)} className="max-w-full px-1 leading-tight hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" style={{ fontSize: `${Math.min(word.text.length > 18 ? 24 : 42, 16 + 26 * Math.sqrt(word.count / maximum))}px`, overflowWrap: 'anywhere', color: palette[index % palette.length], fontWeight: 600 }}>{word.text}</button>)}
          </div> : <table className="w-full text-sm table-fixed"><thead><tr className="text-left border-b"><th className="py-2">Word</th><th>Occurrences</th><th>Documents</th></tr></thead><tbody>{words.map(word => <tr key={word.text} className="border-b border-gray-100 dark:border-neutral-800"><td className="py-2 break-words">{word.text}</td><td>{word.count}</td><td>{word.documentCount}</td></tr>)}</tbody></table>}
          {selected && <div role="status" className="mt-4 flex flex-wrap items-center gap-3 text-sm"><strong className="break-all">{selected.text}</strong><span>{selected.count} occurrences</span><span>{selected.documentCount} documents</span><Link className="underline inline-flex items-center gap-1" to={`/knowledge-base?q=${encodeURIComponent(selected.text)}`}>Search evidence <ArrowUpRight size={16} /></Link></div>}
        </section>
        <section aria-label="Discovered topic list" className="mt-6">
          <h2 className="text-lg font-semibold mb-3">Discovered Topics</h2>
          {!filteredTopics.length ? <p className="text-gray-500 dark:text-neutral-400">{query ? 'No matching topics.' : 'No topics discovered yet.'}</p> : <ul className="divide-y divide-gray-200 dark:divide-neutral-700">{filteredTopics.map(topic => <li key={topic._id}><Link className="flex justify-between items-center gap-4 py-4 hover:underline" to={`/knowledge-base?q=${encodeURIComponent(topic.name)}`}><span className="min-w-0 break-words">{topic.name}</span><span className="text-sm shrink-0">{topic.documentCount} documents</span></Link></li>)}</ul>}
        </section>
      </>}
    </div>
  );
};

export default TopicsExplorer;
