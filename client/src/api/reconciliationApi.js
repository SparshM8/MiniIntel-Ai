import apiClient from './client';


const unwrap = response => response.data?.data ?? response.data;

const reconciliationApi = {
  async listByDocument(documentId) {
    return unwrap(await apiClient.get(`/reconciliations/documents/${documentId}`));
  },
  async getById(recordId) {
    return unwrap(await apiClient.get(`/reconciliations/${recordId}`));
  },
  async decide(recordId, decision) {
    return unwrap(await apiClient.post(`/reconciliations/${recordId}/decisions`, decision));
  }
};

export default reconciliationApi;
