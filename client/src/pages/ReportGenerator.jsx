import React, { useState, useEffect, useRef, useContext } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  FileText, Download, Copy, RefreshCw, Loader2, Check, ChevronDown, ChevronRight,
  Shield, AlertTriangle, Plus, CheckCircle2, Search, Sliders, Calendar, Building,
  Tag, Compass, Target, ArrowRight, Printer, Eye, BarChart3, Database, Sparkles,
  X, CheckSquare, Square, Layers, Send, ThumbsUp, ThumbsDown, Clock, ExternalLink,
  Award, TrendingUp, AlertCircle, FileSpreadsheet
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import api from '../services/api';
import { AuthContext } from '../context/AuthContext';

// Enterprise Key Area Options
const KEY_AREAS_OPTIONS = [
  { id: 'excavation', label: 'Overburden & Excavation' },
  { id: 'dispatch', label: 'Dispatch & Rake Logistics' },
  { id: 'variance', label: 'Target Variance & Bottlenecks' },
  { id: 'fleet', label: 'Fleet Health & Equipment OEE' },
  { id: 'safety', label: 'Safety & Incident Compliance' },
  { id: 'grade', label: 'Grade & Quality Control' },
  { id: 'financial', label: 'Financial & Royalty Metrics' }
];

// Enterprise Report Templates
const REPORT_TEMPLATES = [
  'Executive Summary',
  'Production & Dispatch Analysis',
  'Operational Risk & Safety Report',
  'Monthly Mining Performance Audit',
  'Comprehensive Mining Review',
  'Environmental & Compliance Audit'
];

// Department / Subject Options
const DEPARTMENTS = [
  'Operations & Mineral Extraction',
  'Logistics & Rake Dispatch',
  'Safety, Health & Environment',
  'Mine Planning & Geology',
  'Corporate Governance & Audit'
];

// Helper to sanitize markdown string for the preview to ensure zero raw symbols leak
function cleanMarkdownForPreview(markdown) {
  if (!markdown || typeof markdown !== 'string') return '';
  let cleaned = markdown;

  // Remove full-document code wrappers (```markdown ... ```)
  cleaned = cleaned.replace(/^```(?:markdown)?\s*\n([\s\S]*?)\n```\s*$/gi, '$1');

  // Ensure table headers and content have a preceding blank line so remarkGfm parses them properly
  cleaned = cleaned.replace(/([^\n])\n(\|.*?\|)\n/g, '$1\n\n$2\n');

  // Ensure headings have a space after '#' (e.g. '##Executive' -> '## Executive')
  cleaned = cleaned.replace(/^(#{1,6})([^\s#])/gm, '$1 $2');

  return cleaned;
}

// Helper to strip any raw markdown tokens from raw text runs
function stripRawArtifacts(text) {
  if (!text || typeof text !== 'string') return text;
  return text
    .replace(/^#+\s*/g, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/^[-*+]\s+/g, '')
    .replace(/##+/g, '')
    .trim();
}

const ReportGenerator = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useContext(AuthContext);

  // Document states
  const [documents, setDocuments] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [docsError, setDocsError] = useState(null);
  const [docSearchQuery, setDocSearchQuery] = useState('');

  // Report Form Configuration States
  const [selectedDoc, setSelectedDoc] = useState('');
  const [reportType, setReportType] = useState('Executive Summary');
  const [period, setPeriod] = useState('');
  const [reportTitle, setReportTitle] = useState('');
  const [titleManuallyEdited, setTitleManuallyEdited] = useState(false);
  const [mineName, setMineName] = useState('');
  const [subject, setSubject] = useState('Operations & Mineral Extraction');

  // Report Scope States
  const [selectedKeyAreas, setSelectedKeyAreas] = useState([
    'Overburden & Excavation',
    'Dispatch & Rake Logistics',
    'Target Variance & Bottlenecks'
  ]);
  const [instructions, setInstructions] = useState('');
  const [comparisonPeriod, setComparisonPeriod] = useState('');
  const [includeRecommendations, setIncludeRecommendations] = useState(true);
  const [includeAppendix, setIncludeAppendix] = useState(true);

  // Lifecycle & Process States
  const [recentReports, setRecentReports] = useState([]);
  const [report, setReport] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [genStep, setGenStep] = useState(0); // 0: Scoping evidence, 1: Correlating metrics, 2: Synthesizing sections, 3: Verifying audit
  const [error, setError] = useState(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [copied, setCopied] = useState(false);

  // Preview Workspace View Mode
  const [previewTab, setPreviewTab] = useState('document'); // 'document' | 'kpis' | 'sources'
  const [evidenceOpen, setEvidenceOpen] = useState(true);

  // Admin Review / Rejection Modal State
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const stepTimerRef = useRef(null);
  const cooldownTimerRef = useRef(null);
  const isGeneratingRef = useRef(false);

  // Fetch actual indexed documents from API
  const fetchDocs = async () => {
    setLoadingDocs(true);
    setDocsError(null);
    try {
      const res = await api.get('/documents', { params: { limit: 100 } });
      const rawList = res.data?.data || res.data || [];
      const safeList = Array.isArray(rawList) ? rawList : [];

      const eligible = safeList.filter(d => {
        if (!d) return false;
        if (d.status === 'failed' || d.status === 'pending' || d.status === 'processing') return false;
        return (
          d.status === 'completed' ||
          d.status === 'extracted' ||
          d.status === 'indexed' ||
          Boolean(d.isIndexed) ||
          Boolean(d.extractedText)
        );
      });

      eligible.sort((a, b) => new Date(b.uploadedAt || b.createdAt || 0) - new Date(a.uploadedAt || a.createdAt || 0));
      setDocuments(eligible);
    } catch (err) {
      console.error('Failed to load documents', err);
      setDocsError(err.response?.data?.message || err.formattedMessage || err.message || 'Failed to load documents');
    } finally {
      setLoadingDocs(false);
    }
  };

  // Fetch recent reports
  const fetchRecentReports = async () => {
    try {
      const res = await api.get('/reports');
      const list = res.data?.data || res.data || [];
      const safeList = Array.isArray(list) ? list : [];
      setRecentReports(safeList);
      return safeList;
    } catch (err) {
      console.warn('Failed to load recent reports:', err);
      return [];
    }
  };

  // Intelligent Title Auto-generator
  useEffect(() => {
    if (!titleManuallyEdited) {
      const parts = [reportType];
      if (mineName.trim()) parts.push(mineName.trim());
      if (period.trim()) parts.push(period.trim());
      else parts.push(new Date().toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }));
      setReportTitle(parts.join(' - '));
    }
  }, [reportType, period, mineName, titleManuallyEdited]);

  // Load report by ID
  const loadReportById = async (id, fallbackList = []) => {
    if (!id) return;
    setLoadingReport(true);
    try {
      const res = await api.get(`/reports/${id}`);
      const loadedReport = res.data?.data || res.data;
      if (loadedReport) {
        setReport(loadedReport);
        localStorage.setItem('mineintel_active_report_id', loadedReport._id);
        setSearchParams({ id: loadedReport._id }, { replace: true });

        // Restore generation inputs
        const params = loadedReport.content?.parameters || {};
        if (params.documentId) setSelectedDoc(params.documentId);
        if (loadedReport.type) setReportType(loadedReport.type);
        if (loadedReport.title || params.title) {
          setReportTitle(loadedReport.title || params.title);
          setTitleManuallyEdited(true);
        }
        if (params.period) setPeriod(params.period);
        if (params.mineName) setMineName(params.mineName);
        if (params.subject) setSubject(params.subject);
        if (params.instructions) setInstructions(params.instructions);
        if (Array.isArray(params.keyAreas) && params.keyAreas.length > 0) {
          setSelectedKeyAreas(params.keyAreas);
        }
        if (params.comparisonPeriod) setComparisonPeriod(params.comparisonPeriod);
        if (params.includeRecommendations !== undefined) setIncludeRecommendations(params.includeRecommendations);
        if (params.includeAppendix !== undefined) setIncludeAppendix(params.includeAppendix);
      }
    } catch (err) {
      console.warn(`Could not load report ${id}:`, err.message);
      localStorage.removeItem('mineintel_active_report_id');
      if (fallbackList.length > 0 && fallbackList[0]._id !== id) {
        setReport(fallbackList[0]);
      }
    } finally {
      setLoadingReport(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      fetchDocs();
      const list = await fetchRecentReports();
      const urlId = searchParams.get('id');
      const urlDocId = searchParams.get('docId') || searchParams.get('documentId');
      if (urlDocId) {
        setSelectedDoc(urlDocId);
      }
      const savedId = localStorage.getItem('mineintel_active_report_id');
      const targetId = urlId || savedId || (list.length > 0 ? list[0]._id : null);
      if (targetId) {
        await loadReportById(targetId, list);
      }
    };
    init();

    return () => {
      if (stepTimerRef.current) clearInterval(stepTimerRef.current);
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    };
  }, []);

  const handleNewReport = () => {
    setReport(null);
    setSelectedDoc('');
    setPeriod('');
    setMineName('');
    setTitleManuallyEdited(false);
    setInstructions('');
    setComparisonPeriod('');
    setSelectedKeyAreas(['Overburden & Excavation', 'Dispatch & Rake Logistics', 'Target Variance & Bottlenecks']);
    setIncludeRecommendations(true);
    setIncludeAppendix(true);
    setError(null);
    localStorage.removeItem('mineintel_active_report_id');
    setSearchParams({}, { replace: true });
  };

  const handleToggleKeyArea = (label) => {
    setSelectedKeyAreas(prev => 
      prev.includes(label) ? prev.filter(k => k !== label) : [...prev, label]
    );
  };

  const handleGenerate = async () => {
    if (isGeneratingRef.current || generating || cooldownSeconds > 0) return;

    isGeneratingRef.current = true;
    setGenerating(true);
    setGenStep(0);
    setError(null);

    const startTime = Date.now();
    stepTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      if (elapsed > 18000) {
        setGenStep(3);
      } else if (elapsed > 11000) {
        setGenStep(2);
      } else if (elapsed > 4000) {
        setGenStep(1);
      } else {
        setGenStep(0);
      }
    }, 1000);

    try {
      const res = await api.post('/reports/generate', {
        type: reportType,
        data: {
          documentId: selectedDoc || null,
          title: reportTitle ? reportTitle.trim() : undefined,
          period: period ? period.trim() : undefined,
          mineName: mineName ? mineName.trim() : undefined,
          subject: subject ? subject.trim() : undefined,
          instructions: instructions ? instructions.trim() : undefined,
          keyAreas: selectedKeyAreas.length > 0 ? selectedKeyAreas : undefined,
          comparisonPeriod: comparisonPeriod ? comparisonPeriod.trim() : undefined,
          includeRecommendations,
          includeAppendix
        }
      });
      const generatedReport = res.data?.data || res.data;

      setReport(generatedReport);
      localStorage.setItem('mineintel_active_report_id', generatedReport._id);
      setSearchParams({ id: generatedReport._id }, { replace: true });
      fetchRecentReports();
      setError(null);
    } catch (err) {
      console.error('Report generation error:', err);
      const errData = err.response?.data;
      const status = err.response?.status;
      const is503 = errData?.errorCode === 'AI_SERVICE_UNAVAILABLE' || status === 503;
      const isRateLimit = errData?.errorCode === 'AI_RATE_LIMIT' || errData?.errorCode === 'DUPLICATE_REQUEST_IN_FLIGHT' || status === 429;
      const isCooldown = is503 || isRateLimit;
      const waitTime = errData?.retryAfterSeconds || 30;

      if (isCooldown) {
        setCooldownSeconds(waitTime);
        if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
        cooldownTimerRef.current = setInterval(() => {
          setCooldownSeconds((prev) => {
            if (prev <= 1) {
              clearInterval(cooldownTimerRef.current);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      }

      setError({
        title: is503 ? 'AI Service Temporarily Unavailable' : (isRateLimit ? 'Report Generation Rate Limit' : 'Report Generation Failed'),
        reason: is503
          ? 'AI service is temporarily experiencing high load. Please retry in a few moments.'
          : (isRateLimit ? `AI service capacity limit reached. Please wait ${waitTime} seconds.` : (errData?.message || err.formattedMessage || 'Unable to generate report.')),
        suggestedAction: isCooldown
          ? 'Please wait for the cooldown timer before retrying.'
          : 'Narrow the scope parameters (e.g. choose a specific document or specific period) and retry.',
        errorCode: errData?.errorCode || (is503 ? 'AI_SERVICE_UNAVAILABLE' : (isRateLimit ? 'AI_RATE_LIMIT' : 'REPORT_FAILED')),
        retryable: true,
        isRateLimit: isRateLimit || is503
      });
    } finally {
      if (stepTimerRef.current) clearInterval(stepTimerRef.current);
      setGenerating(false);
      isGeneratingRef.current = false;
    }
  };

  const handleExport = async (format) => {
    if (!report) return;
    try {
      const res = await api.get(`/reports/${report._id}/export?format=${format}`, {
        responseType: 'blob'
      });

      const contentDisposition = res.headers['content-disposition'];
      let filename = `${(report.title || 'Mining_Report').replace(/[^a-zA-Z0-9_-]/g, '_')}.${format}`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) filename = match[1];
      }

      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed', err);
      alert('Failed to export report. Please try again.');
    }
  };

  const copyToClipboard = () => {
    if (report?.content?.markdown) {
      navigator.clipboard.writeText(report.content.markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const downloadJson = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(report.title || 'report').replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Workflow Handlers
  const handleSubmitForReview = async () => {
    if (!report) return;
    setActionLoading(true);
    try {
      const res = await api.put(`/reports/${report._id}/submit`);
      const updated = res.data?.data || res.data;
      setReport(updated);
      fetchRecentReports();
    } catch (e) {
      alert(e.message || 'Submission failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleApproveReport = async () => {
    if (!report) return;
    if (!confirm('Approve this official mining report for executive distribution?')) return;
    setActionLoading(true);
    try {
      const res = await api.put(`/reports/${report._id}/approve`, { comments: 'Approved by Administrator' });
      const updated = res.data?.data || res.data;
      setReport(updated);
      fetchRecentReports();
    } catch (e) {
      alert(e.message || 'Approval failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectReport = async () => {
    if (!report || !rejectReason.trim()) return;
    setActionLoading(true);
    try {
      const res = await api.put(`/reports/${report._id}/reject`, { reason: rejectReason.trim() });
      const updated = res.data?.data || res.data;
      setReport(updated);
      fetchRecentReports();
      setShowRejectModal(false);
      setRejectReason('');
    } catch (e) {
      alert(e.message || 'Rejection failed');
    } finally {
      setActionLoading(false);
    }
  };

  // Break report into main content and evidence appendix
  const getMarkdownParts = (rawMd) => {
    if (!rawMd) return { main: '', evidence: '' };
    const clean = cleanMarkdownForPreview(rawMd);
    const pattern = /^(#+\s*(?:Evidence\s+Appendix|Appendix|Evidence\s+Sources|Source\s+Evidence|Citations?))\b/im;
    const match = clean.match(pattern);
    if (match) {
      const idx = clean.indexOf(match[0]);
      return {
        main: clean.substring(0, idx).trim(),
        evidence: clean.substring(idx).trim()
      };
    }
    return { main: clean, evidence: '' };
  };

  const rawMarkdown = report?.content?.markdown || '';
  const markdownParts = getMarkdownParts(rawMarkdown);

  // Filter documents by search
  const filteredDocs = documents.filter(d => {
    if (!docSearchQuery) return true;
    const q = docSearchQuery.toLowerCase();
    return (
      (d.originalName || '').toLowerCase().includes(q) ||
      (d.filename || '').toLowerCase().includes(q) ||
      (d.title || '').toLowerCase().includes(q)
    );
  });

  // Selected document info
  const activeDocObj = documents.find(d => d._id === selectedDoc);

  // Form style classes
  const inputClass = "w-full bg-white dark:bg-[#161922] border border-slate-200 dark:border-[#2a2f3b] rounded-lg px-3 py-2 text-xs text-slate-800 dark:text-[#f1f5f9] placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 transition-all disabled:opacity-60 disabled:cursor-not-allowed";
  const labelClass = "block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5";

  // Enterprise Markdown Component Styling with ZERO raw markdown artifacts
  const mdComponents = {
    h1: ({ node, children, ...props }) => {
      const text = String(children || '');
      const clean = stripRawArtifacts(text);
      return (
        <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white mt-6 mb-3 pb-2 border-b-2 border-amber-500/30 flex items-center gap-2" {...props}>
          <span className="w-2 h-5 bg-amber-500 rounded-xs shrink-0" />
          <span>{clean}</span>
        </h1>
      );
    },
    h2: ({ node, children, ...props }) => {
      const text = String(children || '');
      const clean = stripRawArtifacts(text);
      return (
        <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 mt-5 mb-2.5 pb-1 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2" {...props}>
          <span className="text-amber-500 text-xs">■</span>
          <span>{clean}</span>
        </h2>
      );
    },
    h3: ({ node, children, ...props }) => {
      const text = String(children || '');
      const clean = stripRawArtifacts(text);
      return (
        <h3 className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 mt-4 mb-1.5" {...props}>
          {clean}
        </h3>
      );
    },
    h4: ({ node, children, ...props }) => {
      const text = String(children || '');
      const clean = stripRawArtifacts(text);
      return (
        <h4 className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mt-3 mb-1" {...props}>
          {clean}
        </h4>
      );
    },
    p: ({ node, children, ...props }) => {
      return (
        <p className="text-xs sm:text-[13px] text-slate-700 dark:text-slate-300 leading-relaxed mb-3 break-words" {...props}>
          {children}
        </p>
      );
    },
    ul: ({ node, ...props }) => (
      <ul className="list-disc pl-5 my-2.5 space-y-1 text-xs sm:text-[13px] text-slate-700 dark:text-slate-300" {...props} />
    ),
    ol: ({ node, ...props }) => (
      <ol className="list-decimal pl-5 my-2.5 space-y-1 text-xs sm:text-[13px] text-slate-700 dark:text-slate-300" {...props} />
    ),
    li: ({ node, children, ...props }) => (
      <li className="leading-relaxed break-words pl-0.5" {...props}>
        {children}
      </li>
    ),
    table: ({ node, ...props }) => (
      <div className="w-full overflow-x-auto my-4 border border-slate-200 dark:border-slate-800 rounded-lg shadow-2xs">
        <table className="w-full text-left border-collapse text-xs" {...props} />
      </div>
    ),
    thead: ({ node, ...props }) => (
      <thead className="bg-slate-100 dark:bg-[#1a1d26] text-slate-800 dark:text-slate-200 font-bold border-b border-slate-200 dark:border-slate-700" {...props} />
    ),
    th: ({ node, children, ...props }) => {
      const clean = stripRawArtifacts(String(children || ''));
      return (
        <th className="px-3 py-2.5 font-bold text-[11px] uppercase tracking-wider text-slate-800 dark:text-slate-200" {...props}>
          {clean}
        </th>
      );
    },
    td: ({ node, children, ...props }) => {
      return (
        <td className="px-3 py-2 align-top border-b border-slate-100 dark:border-slate-800/60 text-xs text-slate-700 dark:text-slate-300" {...props}>
          {typeof children === 'string' ? stripRawArtifacts(children) : children}
        </td>
      );
    },
    blockquote: ({ node, children, ...props }) => (
      <blockquote className="p-3 my-3 bg-amber-500/5 dark:bg-amber-500/10 border-l-4 border-amber-500 rounded-r-lg text-xs italic text-slate-800 dark:text-slate-300" {...props}>
        {children}
      </blockquote>
    ),
    strong: ({ node, children, ...props }) => (
      <strong className="font-bold text-slate-900 dark:text-white" {...props}>
        {typeof children === 'string' ? stripRawArtifacts(children) : children}
      </strong>
    )
  };

  return (
    <div className="w-full max-w-[1536px] mx-auto px-3 sm:px-4 py-3 text-slate-800 dark:text-slate-300">
      {/* Workspace Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/30 rounded-xl shadow-2xs">
            <FileText className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white tracking-tight">
                Enterprise Report Authoring Workspace
              </h1>
              <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 font-mono text-[10px] font-bold">
                v2.0 Verified
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Generate publication-grade, evidence-grounded mining intelligence documents with deterministic variance audit.
            </p>
          </div>
        </div>

        {/* Quick Report Actions / Switcher */}
        <div className="flex items-center gap-2 flex-wrap">
          {recentReports.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Loaded:</span>
              <select
                value={report?._id || ''}
                onChange={(e) => {
                  if (e.target.value) {
                    loadReportById(e.target.value, recentReports);
                  }
                }}
                disabled={generating || loadingReport}
                className="bg-white dark:bg-[#161922] border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-white focus:outline-none focus:border-amber-500 max-w-[240px] truncate shadow-2xs"
              >
                <option value="" disabled>Select saved document...</option>
                {recentReports.map(r => (
                  <option key={r._id} value={r._id}>
                    {r.title || 'Untitled Report'} ({r.status || 'draft'})
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={handleNewReport}
            disabled={generating}
            className="px-3 py-1.5 bg-white dark:bg-[#161922] hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5 text-amber-500" />
            <span>New Report</span>
          </button>
        </div>
      </div>

      {/* Main Two-Pane Workspace Layout (35% Left Form / 65% Right Document Canvas) */}
      <div className="flex flex-col lg:flex-row items-start gap-4 w-full">
        {/* LEFT PANEL: STRUCTURED REPORT AUTHORING & SCOPE (35%) */}
        <div className="w-full lg:w-[35%] shrink-0 space-y-3.5">
          {/* Section 1: REPORT CONFIGURATION */}
          <div className="bg-white dark:bg-[#161922] border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800/80">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                <Sliders className="w-3.5 h-3.5 text-amber-500" />
                <span>1. Report Configuration</span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">Parameters</span>
            </div>

            {/* Source Document(s) Selector */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className={labelClass + " mb-0"}>Source Document(s)</label>
                <div className="flex items-center gap-1.5">
                  {loadingDocs && (
                    <span className="flex items-center gap-1 text-[10px] text-amber-500 font-medium">
                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                      <span>Loading...</span>
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={fetchDocs}
                    disabled={generating || loadingDocs}
                    title="Refresh document catalogue"
                    className="text-slate-400 hover:text-amber-500 disabled:opacity-40 p-0.5 rounded transition-colors"
                  >
                    <RefreshCw className={`w-3 h-3 ${loadingDocs ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              <select
                id="source-document-select"
                value={selectedDoc}
                onChange={e => setSelectedDoc(e.target.value)}
                disabled={generating || loadingDocs}
                className={inputClass}
              >
                <option value="">All Indexed Mining Documents (Global Scoping)</option>
                {loadingDocs && documents.length === 0 && (
                  <option value="" disabled>Loading document catalogue...</option>
                )}
                {!loadingDocs && documents.length === 0 && !docsError && (
                  <option value="" disabled>No indexed documents found in database</option>
                )}
                {documents.map(d => (
                  <option key={d._id} value={d._id}>
                    {d.originalName || d.filename || d.title} ({d.status || 'indexed'})
                  </option>
                ))}
              </select>

              {activeDocObj ? (
                <div className="mt-1.5 p-2 bg-slate-50 dark:bg-[#12141a] border border-slate-200/80 dark:border-slate-800 rounded text-[10px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
                  <span className="truncate font-medium text-slate-700 dark:text-slate-300">
                    Active: {activeDocObj.originalName || activeDocObj.filename}
                  </span>
                  <span className="shrink-0 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold uppercase">
                    {activeDocObj.status || 'Indexed'}
                  </span>
                </div>
              ) : (
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                  Scopes deterministic calculations &amp; RAG retrieval ({documents.length} verified documents available).
                </p>
              )}
            </div>

            {/* Report Type / Template */}
            <div>
              <label className={labelClass}>Report Type / Template</label>
              <select
                value={reportType}
                onChange={e => setReportType(e.target.value)}
                disabled={generating}
                className={inputClass}
              >
                {REPORT_TEMPLATES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* Reporting Period & Mine / Subsidiary */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className={labelClass}>Reporting Period</label>
                <input
                  type="text"
                  value={period}
                  onChange={e => setPeriod(e.target.value)}
                  disabled={generating}
                  placeholder="e.g. Q3 FY2023, FY 2023-24"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Mine / Sub-Unit</label>
                <input
                  type="text"
                  value={mineName}
                  onChange={e => setMineName(e.target.value)}
                  disabled={generating}
                  placeholder="e.g. Gevra OCP / SECL"
                  className={inputClass}
                />
              </div>
            </div>

            {/* Quick Period Suggestions */}
            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
              <span className="text-[10px] text-slate-400 font-semibold">Presets:</span>
              {['Q3 FY2023', 'FY 2023-24', 'Q2 FY2023', 'November 2023'].map(preset => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setPeriod(preset)}
                  disabled={generating}
                  className="px-1.5 py-0.5 text-[10px] rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
                >
                  {preset}
                </button>
              ))}
            </div>

            {/* Report Title */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className={labelClass + " mb-0"}>Report Title</label>
                {titleManuallyEdited && (
                  <button
                    type="button"
                    onClick={() => setTitleManuallyEdited(false)}
                    className="text-[10px] text-amber-500 hover:underline cursor-pointer"
                  >
                    Reset Auto-Title
                  </button>
                )}
              </div>
              <input
                type="text"
                value={reportTitle}
                onChange={e => {
                  setReportTitle(e.target.value);
                  setTitleManuallyEdited(true);
                }}
                disabled={generating}
                placeholder="Customizable Official Document Title"
                className={inputClass}
              />
            </div>

            {/* Subject / Department */}
            <div>
              <label className={labelClass}>Subject / Department</label>
              <select
                value={subject}
                onChange={e => setSubject(e.target.value)}
                disabled={generating}
                className={inputClass}
              >
                {DEPARTMENTS.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Section 2: REPORT SCOPE */}
          <div className="bg-white dark:bg-[#161922] border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800/80">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                <Compass className="w-3.5 h-3.5 text-amber-500" />
                <span>2. Report Scope &amp; Focus</span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">Boundaries</span>
            </div>

            {/* Key Areas to Analyze (Interactive Multi-Select Pills) */}
            <div>
              <label className={labelClass}>Key Areas to Analyze</label>
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {KEY_AREAS_OPTIONS.map(area => {
                  const isSelected = selectedKeyAreas.includes(area.label);
                  return (
                    <button
                      key={area.id}
                      type="button"
                      onClick={() => handleToggleKeyArea(area.label)}
                      disabled={generating}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-amber-500 text-white font-semibold shadow-xs shadow-amber-500/20'
                          : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/70 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {isSelected ? <Check className="w-3 h-3 shrink-0" /> : <Plus className="w-3 h-3 opacity-40 shrink-0" />}
                      <span>{area.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Focus / Instructions */}
            <div>
              <label className={labelClass}>Focus / Authoring Instructions</label>
              <textarea
                value={instructions}
                onChange={e => setInstructions(e.target.value)}
                disabled={generating}
                placeholder="e.g. Focus on dispatch bottlenecks, actual vs target variance, and overburden ratio..."
                className={`${inputClass} h-20 resize-none`}
              />
              {/* Prompt Suggestion Chips */}
              <div className="flex items-center gap-1 flex-wrap mt-1.5">
                {[
                  'Highlight dispatch bottlenecks',
                  'Analyze target vs actual variance',
                  'Examine overburden stripping ratio'
                ].map(chip => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => setInstructions(prev => prev ? `${prev}. ${chip}.` : `${chip}.`)}
                    disabled={generating}
                    className="px-2 py-0.5 text-[10px] rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
                  >
                    + {chip}
                  </button>
                ))}
              </div>
            </div>

            {/* Optional Comparison Period */}
            <div>
              <label className={labelClass}>Optional Comparison Period</label>
              <input
                type="text"
                value={comparisonPeriod}
                onChange={e => setComparisonPeriod(e.target.value)}
                disabled={generating}
                placeholder="e.g. Q2 FY2023, FY 2022-23, Target Baseline"
                className={inputClass}
              />
            </div>

            {/* Scope Toggles */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 space-y-2.5">
              <label className="flex items-center justify-between cursor-pointer group">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 group-hover:text-amber-500 transition-colors">
                  Include Strategic Recommendations
                </span>
                <input
                  type="checkbox"
                  checked={includeRecommendations}
                  onChange={e => setIncludeRecommendations(e.target.checked)}
                  disabled={generating}
                  className="w-4 h-4 text-amber-500 rounded border-slate-300 focus:ring-amber-500 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer group">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 group-hover:text-amber-500 transition-colors">
                  Include Evidence Appendix &amp; Citations
                </span>
                <input
                  type="checkbox"
                  checked={includeAppendix}
                  onChange={e => setIncludeAppendix(e.target.checked)}
                  disabled={generating}
                  className="w-4 h-4 text-amber-500 rounded border-slate-300 focus:ring-amber-500 cursor-pointer"
                />
              </label>
            </div>
          </div>

          {/* Professional 4-Step Pipeline Loading Progress */}
          {generating && (
            <div className="p-3.5 bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/30 rounded-xl space-y-2.5 animate-pulse">
              <div className="flex items-center justify-between text-xs font-bold text-amber-700 dark:text-amber-400">
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                  Generating Enterprise Report Pipeline
                </span>
                <span className="text-[10px] font-mono bg-amber-500/20 px-2 py-0.5 rounded-full font-bold">
                  Stage {genStep + 1}/4
                </span>
              </div>

              {/* Step Sequence Indicators */}
              <div className="grid grid-cols-2 gap-1.5 text-[10px] font-medium pt-1">
                <div className={`p-1.5 rounded text-center transition-all ${
                  genStep === 0
                    ? 'bg-amber-500 text-white font-bold shadow-xs'
                    : genStep > 0
                      ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-semibold'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                }`}>
                  1. Scoping Evidence
                </div>
                <div className={`p-1.5 rounded text-center transition-all ${
                  genStep === 1
                    ? 'bg-amber-500 text-white font-bold shadow-xs'
                    : genStep > 1
                      ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-semibold'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                }`}>
                  2. Computing Variances
                </div>
                <div className={`p-1.5 rounded text-center transition-all ${
                  genStep === 2
                    ? 'bg-amber-500 text-white font-bold shadow-xs'
                    : genStep > 2
                      ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-semibold'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                }`}>
                  3. Synthesizing Sections
                </div>
                <div className={`p-1.5 rounded text-center transition-all ${
                  genStep === 3
                    ? 'bg-amber-500 text-white font-bold shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                }`}>
                  4. Verifying Compliance
                </div>
              </div>
            </div>
          )}

          {/* Generate Report Primary Action Button */}
          <button
            onClick={handleGenerate}
            disabled={generating || cooldownSeconds > 0}
            className="w-full py-3 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 shadow-sm shadow-amber-500/25 active:scale-[0.99]"
          >
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Processing Enterprise Pipeline...</span>
              </>
            ) : cooldownSeconds > 0 ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Cooldown Active ({cooldownSeconds}s)</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Generate Official Report</span>
              </>
            )}
          </button>

          {/* Structured Error Card */}
          {error && (
            <div className={`p-3.5 border rounded-xl space-y-2 text-xs ${
              error.isRateLimit
                ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800/50 text-amber-800 dark:text-amber-300'
                : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300'
            }`}>
              <div className="flex items-center justify-between font-bold">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{error.title}</span>
                </div>
                {cooldownSeconds > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-200 dark:bg-amber-900/60 font-mono text-[10px] font-bold">
                    {cooldownSeconds}s
                  </span>
                )}
              </div>
              <p className="text-[11px] leading-relaxed">{error.reason}</p>
              <div className="text-[11px] p-2 rounded bg-black/5 dark:bg-white/5 leading-relaxed">
                <span className="font-bold">Suggested action: </span>
                <span>{error.suggestedAction}</span>
              </div>
              {error.retryable && (
                <button
                  onClick={handleGenerate}
                  disabled={generating || cooldownSeconds > 0}
                  className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-[11px] flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Retry Generation</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* RIGHT PANEL: OFFICIAL ENTERPRISE REPORT PREVIEW (65%) */}
        <div className="w-full lg:w-[65%] grow min-w-0">
          {report ? (
            <div className="bg-white dark:bg-[#161922] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col min-h-[600px] shadow-sm">
              {/* Official Enterprise Header & Action Toolbar */}
              <div className="border-b border-slate-200 dark:border-slate-800 px-4 py-3 bg-slate-50/90 dark:bg-[#13151b] shrink-0 space-y-2.5">
                {/* Row 1: Title, Classification & Review Status */}
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <FileText className="w-5 h-5 text-amber-500 shrink-0" />
                    <div className="min-w-0">
                      <h2 className="font-extrabold text-slate-900 dark:text-white text-sm sm:text-base truncate" title={report.title}>
                        {report.title}
                      </h2>
                      <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400">
                        <span className="font-mono">ID: {report._id?.substring(0, 10)}...</span>
                        <span>•</span>
                        <span>Version {report.version || 1}</span>
                      </div>
                    </div>
                  </div>

                  {/* Status Badges & Quick Review Workflow Buttons */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                      report.status === 'approved' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-500/30' :
                      report.status === 'review' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400 border border-amber-500/30' :
                      report.status === 'rejected' ? 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300 border border-red-500/30' :
                      'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700'
                    }`}>
                      {report.status}
                    </span>

                    {/* Review Workflow Action Buttons */}
                    {(report.status === 'draft' || report.status === 'rejected') && (
                      <button
                        onClick={handleSubmitForReview}
                        disabled={actionLoading}
                        className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold rounded-lg transition-colors flex items-center gap-1 shadow-2xs"
                      >
                        <Send className="w-3 h-3" />
                        <span>Submit for Review</span>
                      </button>
                    )}

                    {report.status === 'review' && user?.role === 'admin' && (
                      <button
                        onClick={handleApproveReport}
                        disabled={actionLoading}
                        className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-lg transition-colors flex items-center gap-1 shadow-2xs"
                      >
                        <ThumbsUp className="w-3 h-3" />
                        <span>Approve Report</span>
                      </button>
                    )}

                    {report.status === 'review' && (user?.role === 'admin' || user?.role === 'reviewer') && (
                      <button
                        onClick={() => setShowRejectModal(true)}
                        disabled={actionLoading}
                        className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold rounded-lg transition-colors flex items-center gap-1 shadow-2xs"
                      >
                        <ThumbsDown className="w-3 h-3" />
                        <span>Reject...</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Status Detail Callouts */}
                {report.status === 'approved' && (
                  <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 rounded-lg flex items-start gap-2 text-xs text-emerald-800 dark:text-emerald-300">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Official Document Approved by Administration</span>
                      {report.approvedAt && (
                        <span className="ml-2 font-mono text-[11px] opacity-80">
                          ({new Date(report.approvedAt).toLocaleDateString()})
                        </span>
                      )}
                      {report.reviewerComments && (
                        <p className="mt-0.5 text-[11px]">Approval Notes: {report.reviewerComments}</p>
                      )}
                    </div>
                  </div>
                )}

                {report.status === 'rejected' && (
                  <div className="p-2.5 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 rounded-lg flex items-start gap-2 text-xs text-red-800 dark:text-red-300">
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Report Rejected by Reviewer</span>
                      {report.reviewerComments && (
                        <p className="mt-0.5 text-[11px] font-medium">Rejection Reason: {report.reviewerComments}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Row 2: View Modes, Confidence Badges & Export Suite */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
                  {/* View Modes */}
                  <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#101217] p-0.5 rounded-lg border border-slate-200 dark:border-slate-800">
                    <button
                      onClick={() => setPreviewTab('document')}
                      className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                        previewTab === 'document'
                          ? 'bg-white dark:bg-[#1f232d] text-amber-600 dark:text-amber-400 shadow-2xs'
                          : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                      }`}
                    >
                      Official Document
                    </button>
                    <button
                      onClick={() => setPreviewTab('sources')}
                      className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                        previewTab === 'sources'
                          ? 'bg-white dark:bg-[#1f232d] text-amber-600 dark:text-amber-400 shadow-2xs'
                          : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                      }`}
                    >
                      Evidence Audit ({report.content?.sources?.length || 0})
                    </button>
                  </div>

                  {/* Confidence & Coverage Metrics */}
                  <div className="flex items-center gap-2">
                    {(report.confidenceScore !== undefined || report.evidenceCoverage) && (
                      <div className="flex items-center gap-2 text-[11px] bg-white dark:bg-[#101217] border border-slate-200 dark:border-slate-800 px-2.5 py-1 rounded-lg">
                        <span className="text-amber-600 dark:text-amber-400 font-bold whitespace-nowrap">
                          Confidence {Math.round((report.confidenceScore || 0) * 100)}%
                        </span>
                        <span className="text-slate-300 dark:text-slate-700">|</span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold whitespace-nowrap">
                          Coverage {report.evidenceCoverage?.percentage || 0}%
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Export Controls (PDF, DOCX, CSV, JSON, Print) */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      onClick={() => handleExport('docx')}
                      className="px-2.5 py-1 bg-white dark:bg-[#1c1f26] border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1 shadow-2xs"
                      title="Export publication-ready DOCX"
                    >
                      <Download className="w-3.5 h-3.5 text-amber-500" />
                      <span>DOCX</span>
                    </button>

                    <button
                      onClick={() => handleExport('pdf')}
                      className="px-2.5 py-1 bg-white dark:bg-[#1c1f26] border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1 shadow-2xs"
                      title="Export publication-ready PDF"
                    >
                      <Download className="w-3.5 h-3.5 text-amber-500" />
                      <span>PDF</span>
                    </button>

                    <button
                      onClick={() => handleExport('csv')}
                      className="px-2.5 py-1 bg-white dark:bg-[#1c1f26] border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1 shadow-2xs"
                      title="Export Citations CSV"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-slate-400" />
                      <span>CSV</span>
                    </button>

                    <button
                      onClick={downloadJson}
                      className="px-2 py-1 bg-white dark:bg-[#1c1f26] border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg transition-colors"
                      title="Export Raw JSON"
                    >
                      JSON
                    </button>

                    <button
                      onClick={() => window.print()}
                      className="p-1.5 bg-white dark:bg-[#1c1f26] border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg transition-colors"
                      title="Print Document"
                    >
                      <Printer className="w-3.5 h-3.5 text-slate-400" />
                    </button>

                    <button
                      onClick={copyToClipboard}
                      className="p-1.5 bg-white dark:bg-[#1c1f26] border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg transition-colors"
                      title="Copy Markdown"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Scrollable Document Canvas */}
              <div className="p-4 sm:p-6 overflow-y-auto grow custom-scrollbar bg-white dark:bg-[#161922]">
                {previewTab === 'document' && (
                  <div className="max-w-4xl mx-auto space-y-6">
                    {/* Official Document Masthead & Metadata Banner */}
                    <div className="p-4 sm:p-5 bg-slate-50 dark:bg-[#12141a] border border-slate-200 dark:border-slate-800 rounded-xl space-y-4 shadow-2xs">
                      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-md bg-amber-500 flex items-center justify-center text-white font-extrabold text-xs">
                            M
                          </div>
                          <span className="font-extrabold text-xs uppercase tracking-widest text-slate-800 dark:text-slate-200">
                            MineIntel AI • Intelligence Directorate
                          </span>
                        </div>
                        <span className="px-2 py-0.5 rounded bg-slate-200/80 dark:bg-slate-800 text-[10px] font-mono uppercase font-bold text-slate-600 dark:text-slate-400">
                          CONFIDENTIAL AUDIT
                        </span>
                      </div>

                      {/* Main Document Title */}
                      <div>
                        <h1 className="text-lg sm:text-2xl font-black text-slate-900 dark:text-white leading-tight">
                          {stripRawArtifacts(report.title)}
                        </h1>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          Official Operations Intelligence Report • Generated on {new Date(report.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </p>
                      </div>

                      {/* Structured Metadata Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-200 dark:border-slate-800/80 text-xs">
                        <div>
                          <span className="block text-[10px] font-bold text-slate-400 uppercase">Reporting Period</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {report.content?.parameters?.period || 'FY 2023-24'}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px] font-bold text-slate-400 uppercase">Department / Subject</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200 truncate block">
                            {report.content?.parameters?.subject || 'Operations & Mining'}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px] font-bold text-slate-400 uppercase">Mine / Unit</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {report.content?.parameters?.mineName || 'All Units'}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px] font-bold text-slate-400 uppercase">Evidence Grounding</span>
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                            {report.evidenceCoverage?.total || 0} Sources Verified
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Formatted Report Markdown Content */}
                    <div className="prose dark:prose-invert max-w-none text-slate-800 dark:text-slate-200">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkMath]}
                        rehypePlugins={[rehypeKatex]}
                        components={mdComponents}
                      >
                        {markdownParts.main || 'No content generated.'}
                      </ReactMarkdown>
                    </div>

                    {/* Integrated Evidence Appendix Accordion */}
                    {markdownParts.evidence && (
                      <div className="mt-8 border-t-2 border-slate-200 dark:border-slate-800 pt-5">
                        <button
                          onClick={() => setEvidenceOpen(!evidenceOpen)}
                          className="flex items-center justify-between w-full p-3 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-[#12141a] dark:hover:bg-[#1a1d26] border border-slate-200 dark:border-slate-800 transition-colors mb-4"
                        >
                          <div className="flex items-center gap-2 font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                            <Shield className="w-4 h-4 text-amber-500" />
                            <span>Evidence Appendix &amp; Ground Truth Citations</span>
                          </div>
                          {evidenceOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                        </button>

                        {evidenceOpen && (
                          <div className="prose dark:prose-invert max-w-none text-xs">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm, remarkMath]}
                              rehypePlugins={[rehypeKatex]}
                              components={mdComponents}
                            >
                              {markdownParts.evidence}
                            </ReactMarkdown>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Evidence Sources Tab */}
                {previewTab === 'sources' && (
                  <div className="max-w-4xl mx-auto space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                      <div>
                        <h3 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white">
                          Verified Document Evidence Citations
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Every fact in this report is anchored to actual extracted document records in the database.
                        </p>
                      </div>
                      <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full font-bold text-xs">
                        {report.content?.sources?.length || 0} Citations
                      </span>
                    </div>

                    {report.content?.sources && report.content.sources.length > 0 ? (
                      <div className="space-y-3">
                        {report.content.sources.map((src, sIdx) => (
                          <div
                            key={sIdx}
                            className="p-3.5 bg-slate-50 dark:bg-[#12141a] border border-slate-200 dark:border-slate-800 rounded-xl space-y-2 shadow-2xs"
                          >
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="w-5 h-5 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 font-bold font-mono text-[11px] flex items-center justify-center shrink-0">
                                  {sIdx + 1}
                                </span>
                                <span className="font-bold text-slate-900 dark:text-white truncate">
                                  {src.documentName || 'Mining Record'}
                                </span>
                                {src.pageNumber != null && (
                                  <span className="px-2 py-0.5 bg-slate-200 dark:bg-slate-800 rounded text-[10px] font-mono shrink-0">
                                    Page {src.pageNumber}
                                  </span>
                                )}
                              </div>
                              {src.similarity && (
                                <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                                  {Math.round(src.similarity * 100)}% Match
                                </span>
                              )}
                            </div>
                            {src.excerpt && (
                              <blockquote className="p-2.5 bg-white dark:bg-[#161922] border border-slate-200/60 dark:border-slate-800 rounded-lg text-xs italic text-slate-600 dark:text-slate-300 leading-relaxed">
                                "{stripRawArtifacts(src.excerpt)}"
                              </blockquote>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-8 text-center text-slate-400 text-xs">
                        No individual source snippets recorded for this generation.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Empty State: Welcoming Authoring Workspace Canvas */
            <div className="bg-white dark:bg-[#161922] border border-dashed border-slate-200 dark:border-slate-800 rounded-xl flex items-center justify-center flex-col gap-3 text-center min-h-[550px] p-8">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shadow-xs">
                <FileText className="w-7 h-7 text-amber-500" />
              </div>
              <div className="max-w-md space-y-1.5">
                <h3 className="text-sm sm:text-base font-extrabold text-slate-800 dark:text-slate-200">
                  Ready to Author Enterprise Report
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Select your source document(s), report template, period, and scope filters on the left, then click <strong className="text-amber-500 font-semibold">Generate Official Report</strong> to create a publication-ready document.
                </p>
              </div>

              {/* Quick Template Recommendation Pills */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center gap-2 flex-wrap justify-center max-w-md">
                <span className="text-[11px] font-bold text-slate-400">Recommended Templates:</span>
                {REPORT_TEMPLATES.slice(0, 3).map(tmpl => (
                  <button
                    key={tmpl}
                    type="button"
                    onClick={() => {
                      setReportType(tmpl);
                      handleGenerate();
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 transition-colors"
                  >
                    {tmpl}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Admin Review Rejection Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#161922] border border-slate-200 dark:border-slate-800 rounded-xl p-5 max-w-md w-full space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-red-600 font-bold text-sm">
                <AlertCircle className="w-4 h-4" />
                <span>Reject Report &amp; Return to Draft</span>
              </div>
              <button onClick={() => setShowRejectModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Please specify the reason for rejecting this report. The reason will be permanently recorded in the audit log and version history.
            </p>

            <div>
              <label className={labelClass}>Rejection Reason / Comments</label>
              <textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="e.g. Reconciliation discrepancy in Q3 production tonnage. Please re-check seam excavation figures..."
                className={`${inputClass} h-24 resize-none`}
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRejectReport}
                disabled={!rejectReason.trim() || actionLoading}
                className="px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors disabled:opacity-50"
              >
                {actionLoading ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportGenerator;
