import { useState, useEffect, useCallback, useRef } from 'react';
import { getDocuments } from '../services/api';

const useDocuments = (filters = {}) => {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const requestId = useRef(0);

  const fetchDocuments = useCallback(async (params = {}) => {
        const currentRequest = ++requestId.current;
    try {
      setLoading(true);
      const response = await getDocuments(params);
      const docs = Array.isArray(response.data)
        ? response.data
        : (Array.isArray(response.data?.data) ? response.data.data : null);
              if (!docs) throw new Error('Unexpected document list response');
              if (currentRequest !== requestId.current) return;
              setDocuments(docs);
      setError(null);
    } catch (err) {
      if (currentRequest !== requestId.current) return;
      setDocuments([]);
      setError(err.message || 'Failed to fetch documents');
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
        fetchDocuments(filters);
    return () => { requestId.current++; };
  }, [filters.search, filters.type, filters.status, fetchDocuments]);

  useEffect(() => {
    const hasPending = Array.isArray(documents) && documents.some(
      (doc) => doc.status === 'pending' || doc.status === 'processing'
    );
    let interval;
    if (hasPending) {
      interval = setInterval(() => {
        fetchDocuments(filters);
      }, 5000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [documents, filters, fetchDocuments]);

  return { documents, loading, error, fetchDocuments };
};

export default useDocuments;
