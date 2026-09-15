import apiClient from './client';
import { reviewRequest } from '../utils/reviewRequest';

/**
 * Data Extraction REST API Module
 * Consumes /api/v1/extraction endpoints
 */
export const extractionApi = {
  /**
   * Run extraction for a document
   * @param {string|object} documentIdOrPayload
   */
  runExtraction: async (documentIdOrPayload) => {
    const payload =
      typeof documentIdOrPayload === 'string'
        ? { documentId: documentIdOrPayload }
        : documentIdOrPayload;
    const response = await apiClient.post('/extraction/run', payload);
    return response.data;
  },

  /**
   * Get extraction overview/metadata for a document
   * @param {string} documentId
   */
  getExtraction: async (documentId) => {
    const response = await reviewRequest(config => apiClient.get(`/extraction/${documentId}`, config));
    return response.data;
  },

  /**
   * Get extracted records for a document
   * @param {string} documentId
   * @param {object} [params]
   */
  getRecords: async (documentId, params = {}) => {
    const response = await reviewRequest(config => apiClient.get(`/extraction/${documentId}/records`, { ...config, params }));
    return response.data;
  },

  /**
   * Legacy alias for getting extracted records
   * @param {string} documentId
   */
  getExtractedRecords: async (documentId) => {
    const response = await reviewRequest(config => apiClient.get(`/extraction/${documentId}`, config));
    // Return array of records if present in .data or .data.records
    const data = response.data?.data || response.data;
    if (Array.isArray(data)) return data;
    if (data?.records && Array.isArray(data.records)) return data.records;
    return data || [];
  },

  /**
   * Update an extracted record
   * Supports both (documentId, recordId, data) and (recordId, data)
   */
  updateRecord: async (arg1, arg2, arg3) => {
    if (arg3 !== undefined) {
      // (documentId, recordId, data)
      const response = await reviewRequest(config => apiClient.put(`/extraction/${arg1}/records/${arg2}`, arg3, config));
      return response.data;
    }
    // (recordId, data)
    const response = await reviewRequest(config => apiClient.put(`/extraction/records/${arg1}`, arg2, config));
    return response.data;
  },

  /**
   * Reprocess extraction for document
   * @param {string} documentId
   */
  reprocess: async (documentId) => {
    const response = await apiClient.post(`/extraction/${documentId}/reprocess`);
    return response.data;
  },

  /**
   * Alias to reprocess / extract data
   * @param {string} documentId
   */
  extractData: async (documentId) => {
    const response = await apiClient.post(`/extraction/${documentId}/reprocess`);
    return response.data;
  },

  /**
   * Approve a single record
   * @param {string} recordId
   */
  approveRecord: async (recordId) => {
    const response = await reviewRequest(config => apiClient.post(`/extraction/records/${recordId}/approve`, undefined, config));
    return response.data;
  },

  /**
   * Reject a single record
   * @param {string} recordId
   */
  rejectRecord: async (recordId) => {
    const response = await reviewRequest(config => apiClient.post(`/extraction/records/${recordId}/reject`, undefined, config));
    return response.data;
  },

  /**
   * Bulk approve multiple records
   * @param {string[]} ids
   */
  bulkApprove: async (ids) => {
    const response = await reviewRequest(config => apiClient.post('/extraction/records/bulk-approve', { ids }, config));
    return response.data;
  },
};

export default extractionApi;
