import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Monitor, FileText, CheckCircle, AlertTriangle, FileOutput, Bot, Send, Loader2 } from 'lucide-react';
import { commandCentreApi, aiAssistantApi } from '../api';

const CommandCenter = () => {
  const [taskInput, setTaskInput] = useState('');
  const [isOrchestrating, setIsOrchestrating] = useState(false);
  const [orchestratorResult, setOrchestratorResult] = useState(null);
  const [overviewData, setOverviewData] = useState(null);

    const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const taskPending = useRef(false);

  useEffect(() => {
    let active = true;
    setOverviewLoading(true);
    setOverviewError(false);
    commandCentreApi.getOverview().then(res => {
      const data = res?.data ?? res;
      if (!data?.stats || typeof data.stats !== 'object') throw new Error('Invalid overview');
      if (active) setOverviewData(data);
    }).catch(() => {
      if (active) { setOverviewData(null); setOverviewError(true); }
    }).finally(() => { if (active) setOverviewLoading(false); });
    return () => { active = false; };
  }, [reloadKey]);

  const count = value => overviewLoading ? 'Loading…'
    : !overviewError && Number.isSafeInteger(value) && value >= 0 ? value.toLocaleString() : 'Unavailable';

  const stats = [
    { label: 'Docs Processed', value: count(overviewData?.stats?.docsProcessed?.value), icon: FileText, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20' },
    { label: 'Failed Documents', value: count(overviewData?.systemMetrics?.failedDocuments), icon: AlertTriangle, color: 'text-green-500', bg: 'bg-green-50 dark:bg-green-900/20' },
    { label: 'Open Issues', value: count(overviewData?.stats?.openIssues?.value), icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20' },
    { label: 'Reports Generated', value: count(overviewData?.stats?.reportsGenerated?.value), icon: FileOutput, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20' }
  ];

  const handleOrchestrate = async (e) => {
    e.preventDefault();
        if (!taskInput.trim() || taskPending.current) return;
    taskPending.current = true;
    setIsOrchestrating(true);
    setOrchestratorResult(null);
    try {
      const res = await aiAssistantApi.orchestrate(taskInput, { source: 'command-center' });
      const body = res?.data ?? res;
      if (body?.success === false || res?.success === false) throw new Error('Server reported an unsuccessful task. Check its status before retrying.');
      const successMessage = typeof body?.message === 'string' && body.message.trim()
        ? body.message : 'Server responded without task details. Completion has not been verified.';
      setOrchestratorResult({ success: true, message: successMessage });
    } catch (err) {
      setOrchestratorResult({ success: false, message: err.message || 'Failed to orchestrate task.' });
    } finally {
      taskPending.current = false;
      setIsOrchestrating(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Monitor className="w-8 h-8 text-amber-600 dark:text-amber-400" />
        <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">Command Center</h1>
      </div>

      <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">System-wide counts returned by the service, not your filtered document list. Processing and report generation do not establish accuracy or approval.</p>
      {overviewError && <div role="alert" className="rounded-lg border border-red-200 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-300">
        <p>System overview is unavailable. No estimated counts are shown.</p>
        <button type="button" onClick={() => setReloadKey(key => key + 1)} className="mt-2 min-h-10 underline font-semibold">Reload overview</button>
      </div>}
      {/* System Stats Summary */}
      <section>
        <h2 className="text-xl font-semibold text-neutral-800 dark:text-neutral-200 mb-4">System Overview</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-4 gap-4">
          {stats.map((stat, idx) => (
            <section aria-label={stat.label} key={idx} className="bg-white dark:bg-dark-card p-5 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
              <div className={`p-4 rounded-lg ${stat.bg}`}>
                <stat.icon className={`w-8 h-8 ${stat.color}`} />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-slate-400">{stat.label}</p>
                                <p className="text-2xl font-bold text-neutral-900 dark:text-white">{stat.value}</p>
              </div>
            </section>
          ))}
        </div>
      </section>

      {/* Multi-Agent Orchestrator Section */}
      <section className="bg-white dark:bg-dark-card rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-slate-700 bg-neutral-50 dark:bg-dark-bg/50 flex items-center gap-3">
          <Bot className="w-6 h-6 text-amber-500" />
          <div>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">Request an assisted task</h2>
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
              Describe the documents, period and output you need. Inspect the returned evidence and task status before using the result.
            </p>
          </div>
        </div>
        
        <div className="p-5">
          <form onSubmit={handleOrchestrate} className="space-y-4">
            <div>
              <label htmlFor="taskInput" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                New Task Assignment
              </label>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  id="taskInput"
                  type="text"
                  value={taskInput}
                  onChange={(e) => setTaskInput(e.target.value)}
                  placeholder='e.g., "Analyze production metrics from last month and generate a summary report"'
                  className="min-w-0 flex-1 px-4 py-3 bg-white dark:bg-dark-bg border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 dark:text-white transition-shadow text-base"
                  disabled={isOrchestrating}
                />
                <button
                  type="submit"
                  disabled={!taskInput.trim() || isOrchestrating}
                  className="px-6 py-3 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 dark:disabled:bg-amber-800 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
                >
                  {isOrchestrating ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Send className="w-5 h-5" />
                  )}
                  Send request
                </button>
              </div>
            </div>
          </form>

          {orchestratorResult && (
            <div role={orchestratorResult.success ? 'status' : 'alert'} className={`mt-4 p-4 rounded-lg border flex items-start gap-3 ${
              orchestratorResult.success 
                ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/50 text-green-800 dark:text-green-300' 
                : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/50 text-red-800 dark:text-red-300'
            }`}>
              {orchestratorResult.success ? (
                <CheckCircle className="w-5 h-5 mt-0.5 shrink-0" />
              ) : (
                <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
              )}
              <div>
                <h4 className="font-medium mb-2">
                  {orchestratorResult.success ? 'Server response — review required' : 'Task request not confirmed'}
                </h4>
                <div className="prose dark:prose-invert max-w-none prose-sm text-sm opacity-90 prose-p:my-1 prose-headings:my-2 prose-table:my-2 prose-code:before:content-none prose-code:after:content-none">
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm, remarkMath]} 
                    rehypePlugins={[rehypeKatex]}
                    components={{
                      table: ({node, ...props}) => (
                        <div className="overflow-x-auto my-2">
                          <table className="min-w-full divide-y divide-neutral-300 dark:divide-neutral-700" {...props} />
                        </div>
                      )
                    }}
                  >
                    {orchestratorResult.message}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default CommandCenter;
