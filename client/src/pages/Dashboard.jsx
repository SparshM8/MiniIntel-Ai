import React, { useContext, useState } from 'react';
import {
  Activity, FileUp, ChevronRight,
  Upload, Database, MessageSquare, ArrowRight
} from 'lucide-react';
import useDocuments from '../hooks/useDocuments';
import { uploadDocument, getDocumentById, deleteDocument, retryDocument } from '../services/api';
import DropZone from '../components/upload/DropZone';
import UploadProgress from '../components/upload/UploadProgress';
import DocumentFilters from '../components/documents/DocumentFilters';
import DocumentList from '../components/documents/DocumentList';
import DocumentPreview from '../components/documents/DocumentPreview';
import ReviewerAssignmentDialog from '../components/documents/ReviewerAssignmentDialog';
import { AuthContext } from '../context/AuthContext';
import { Link } from 'react-router-dom';

import { DocumentWorkspaceSummary, DocumentNextSteps } from '../components/documents/DocumentWorkspaceSummary';

const Dashboard = () => {
  const { user } = useContext(AuthContext);
  const [assignmentDocument, setAssignmentDocument] = useState(null);
  const [filters, setFilters] = useState({ search: '', type: '', status: '' });
  const { documents, loading, error, fetchDocuments } = useDocuments(filters);
  const [uploads, setUploads] = useState([]);
  const [previewDoc, setPreviewDoc] = useState(null);
    const [previewOpen, setPreviewOpen] = useState(false);

  const handleUpload = async (file) => {
    const uploadId = Date.now().toString();
    setUploads((prev) => [
      ...prev,
      { id: uploadId, name: file.name, progress: 0, status: 'uploading' }
    ]);

    try {
      await uploadDocument(file, (progress) => {
        setUploads((prev) =>
          prev.map((u) => (u.id === uploadId ? { ...u, progress } : u))
        );
      });
      
      setUploads((prev) =>
        prev.map((u) => (u.id === uploadId ? { ...u, status: 'success', progress: 100 } : u))
      );
      fetchDocuments(filters);
      
      setTimeout(() => {
        setUploads((prev) => prev.filter((u) => u.id !== uploadId));
      }, 3000);
    } catch (error) {
      setUploads((prev) =>
        prev.map((u) =>
          u.id === uploadId
            ? { ...u, status: 'error', error: error.response?.data?.message || 'Upload failed' }
            : u
        )
      );
    }
  };

  const handleDismissUpload = (id) => {
    setUploads((prev) => prev.filter((u) => u.id !== id));
  };

  const handlePreview = async (id) => {
    try {
      const response = await getDocumentById(id);
      setPreviewDoc(response.data);
      setPreviewOpen(true);
    } catch (error) {
      console.error('Failed to preview document', error);
      alert('Failed to load document preview');
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteDocument(id);
      fetchDocuments(filters);
    } catch (error) {
      console.error('Failed to delete document', error);
      alert('Failed to delete document');
    }
  };

  const handleRetry = async (id) => {
    try {
      await retryDocument(id);
      setPreviewOpen(false);
      fetchDocuments(filters);
    } catch (error) {
      console.error('Failed to retry document', error);
      alert('Failed to retry processing');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-700 dark:text-amber-400 mb-2">Document workspace</p>
          <h1 className="text-2xl sm:text-3xl font-semibold text-neutral-900 dark:text-white tracking-tight">
            My Dashboard
          </h1>
          <p className="text-gray-500 dark:text-slate-400 text-sm mt-2 leading-relaxed">Upload sources, check processing status, and review extracted information.</p>
        </div>
            </div>

      <DocumentWorkspaceSummary
        documents={documents}
        loading={loading}
        error={error}
        onReload={() => fetchDocuments(filters)}
      />

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-10 gap-4">
        
        {/* Left Column (Main Content) */}
        <div className="lg:col-span-7 min-w-0 space-y-5">
          {/* Quick Access Grid */}
          <div className="grid grid-cols-1 2xl:grid-cols-3 gap-4">
            <Link to="/extraction" className="hover-lift flex items-center p-4 bg-white dark:bg-dark-card border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-dark-card/50 transition-colors group">
              <div className="p-3 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded-lg mr-4">
                <Upload className="w-5 h-5 group-hover:scale-110 transition-transform" />
              </div>
              <div>
                <h3 className="font-semibold text-neutral-900 dark:text-white group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">Review extraction</h3>
                <p className="text-sm text-gray-500 dark:text-slate-400">Inspect extracted values and sources</p>
              </div>
              <ArrowRight className="hover-lift-arrow w-5 h-5 ml-auto text-gray-600 dark:text-slate-400 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors" />
            </Link>

            <Link to="/knowledge-base" className="hover-lift flex items-center p-4 bg-white dark:bg-dark-card border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-dark-card/50 transition-colors group">
              <div className="p-3 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded-lg mr-4">
                <Database className="w-5 h-5 group-hover:scale-110 transition-transform" />
              </div>
              <div>
                <h3 className="font-semibold text-neutral-900 dark:text-white group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">Knowledge Base</h3>
                <p className="text-sm text-gray-500 dark:text-slate-400">Search indexed records</p>
              </div>
              <ArrowRight className="hover-lift-arrow w-5 h-5 ml-auto text-gray-600 dark:text-slate-400 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors" />
            </Link>

            <Link to="/ai-assistant" className="hover-lift flex items-center p-4 bg-white dark:bg-dark-card border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-dark-card/50 transition-colors group">
              <div className="p-3 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded-lg mr-4">
                <MessageSquare className="w-5 h-5 group-hover:scale-110 transition-transform" />
              </div>
              <div>
                <h3 className="font-semibold text-neutral-900 dark:text-white group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">AI Assistant</h3>
                <p className="text-sm text-gray-500 dark:text-slate-400">Ask questions about data</p>
              </div>
              <ArrowRight className="hover-lift-arrow w-5 h-5 ml-auto text-gray-600 dark:text-slate-400 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors" />
            </Link>
          </div>

          {/* Upload Section */}
          <div className="bg-white dark:bg-dark-card border border-slate-200 dark:border-slate-700 rounded-lg p-5 shadow-sm hover:border-amber-500/30 transition-colors">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
                <FileUp className="w-4 h-4 text-amber-600 dark:text-amber-500" /> Add source documents
              </h2>
            </div>
            <DropZone onUpload={handleUpload} />
            <div className="mt-2">
              <UploadProgress uploads={uploads} onDismiss={handleDismissUpload} />
            </div>
          </div>

          {/* Document Management */}
          <div className="bg-white dark:bg-dark-card border border-slate-200 dark:border-slate-700 rounded-lg p-5 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-neutral-900 dark:text-white">Your documents</h2>
              <Link to="/command-center" className="text-xs text-amber-600 dark:text-amber-400 font-medium hover:underline flex items-center gap-1">
                Command Center <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            
            <DocumentFilters
              search={filters.search}
              type={filters.type}
              status={filters.status}
              onSearchChange={(val) => setFilters(prev => ({ ...prev, search: val }))}
              onTypeChange={(val) => setFilters(prev => ({ ...prev, type: val }))}
              onStatusChange={(val) => setFilters(prev => ({ ...prev, status: val }))}
            />
            
                        <div className="mt-4">
              {!error && (
                <DocumentList
                  documents={documents}
                  loading={loading}
                  onPreview={handlePreview}
                  onDelete={handleDelete}
                  onAssignReviewers={user?.role === 'admin' ? setAssignmentDocument : undefined}
                />
              )}
            </div>
          </div>
        </div>

        {/* Right Column (Side Panels) */}
                <div className="lg:col-span-3 min-w-0 space-y-5">
          <DocumentNextSteps />

          {/* Processing Activity */}
          <div className="bg-white dark:bg-dark-card border border-slate-200 dark:border-slate-700 rounded-lg p-5 shadow-sm">
            <h2 className="text-base font-semibold text-neutral-900 dark:text-white mb-4 flex items-center gap-2">
              <Activity className="w-4 h-4 text-gray-500 dark:text-slate-400" /> Document status
            </h2>
            <div className="space-y-4 relative before:absolute before:inset-0 before:ml-[9px] before:-translate-x-px before:h-full before:w-[2px] before:bg-neutral-100 dark:before:bg-dark-card">
              {!loading && !error && documents?.slice(0, 5).map((doc, idx) => (
                <div key={idx} className="relative flex items-start gap-3">
                  <div className="flex items-center justify-center w-[18px] h-[18px] rounded-full border-[3px] border-white dark:border-dark-card bg-amber-500 shrink-0 z-10 mt-0.5"></div>
                  <div className="flex-1 bg-neutral-50 dark:bg-dark-card p-3 rounded-lg border border-neutral-100 dark:border-slate-700">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-[13px] text-neutral-900 dark:text-white truncate max-w-[150px]" title={doc.originalName}>{doc.originalName}</span>
                      <span className="text-[11px] font-medium text-gray-500 dark:text-slate-400">{new Date(doc.uploadedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    </div>
                    <p className="text-[11px] text-gray-500 dark:text-slate-400 leading-relaxed">
                      {['completed', 'extracted'].includes(doc.status) ? 'Processing complete. Review extracted information before use.' : doc.status === 'failed' ? 'Failed to process document.' : doc.status === 'pending' ? 'Queued for processing.' : doc.status === 'processing' ? 'Processing in progress.' : 'Status unavailable.'}
                    </p>
                  </div>
                </div>
                            ))}
              {(loading || error || !documents?.length) && (
                <div className="text-[13px] text-gray-500 dark:text-slate-400 text-center py-4 relative z-10">{loading ? 'Loading document status…' : error ? 'Document status unavailable' : 'No documents in this view'}</div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {user?.role === 'admin' && assignmentDocument && (
        <ReviewerAssignmentDialog
          key={assignmentDocument._id || assignmentDocument.id}
          document={assignmentDocument}
          onClose={() => setAssignmentDocument(null)}
        />
      )}
      <DocumentPreview
        document={previewDoc}
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        onRetry={handleRetry}
      />
    </div>
  );
};

export default Dashboard;
