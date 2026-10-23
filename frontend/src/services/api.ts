const API_BASE = "http://localhost:8000/api/v1";

export const api = {
  // Analytics
  async getDashboard() {
    const res = await fetch(`${API_BASE}/analytics/dashboard`);
    if (!res.ok) throw new Error("Failed to load dashboard metrics");
    return res.json();
  },

  // Documents
  async getDocuments() {
    const res = await fetch(`${API_BASE}/documents`);
    if (!res.ok) throw new Error("Failed to load documents");
    return res.json();
  },

  async uploadDocuments(files: File[]) {
    const formData = new FormData();
    for (const f of files) {
      formData.append("files", f);
    }
    const res = await fetch(`${API_BASE}/documents/upload`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) throw new Error("Failed to upload documents");
    return res.json();
  },

  async getDocumentPreview(id: string) {
    const res = await fetch(`${API_BASE}/documents/${id}/preview`);
    if (!res.ok) throw new Error("Failed to load document preview");
    return res.json();
  },

  async deleteDocument(id: string) {
    const res = await fetch(`${API_BASE}/documents/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete document");
    return res.json();
  },

  async reindexDocument(id: string) {
    const res = await fetch(`${API_BASE}/documents/${id}/reindex`, {
      method: "POST",
    });
    if (!res.ok) throw new Error("Failed to re-index document");
    return res.json();
  },

  // Pipelines
  async getPipelines() {
    const res = await fetch(`${API_BASE}/pipelines`);
    if (!res.ok) throw new Error("Failed to load pipelines");
    return res.json();
  },

  async getPipeline(id: string) {
    const res = await fetch(`${API_BASE}/pipelines/${id}`);
    if (!res.ok) throw new Error("Failed to load pipeline");
    return res.json();
  },

  async createPipeline(data: any) {
    const res = await fetch(`${API_BASE}/pipelines`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to create pipeline");
    }
    return res.json();
  },

  async updatePipeline(id: string, data: any) {
    const res = await fetch(`${API_BASE}/pipelines/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to update pipeline");
    }
    return res.json();
  },

  async deletePipeline(id: string) {
    const res = await fetch(`${API_BASE}/pipelines/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to delete pipeline");
    }
    return res.json();
  },

  async batchDeletePipelines(pipelineIds: string[]) {
    const res = await fetch(`${API_BASE}/pipelines/batch-delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pipeline_ids: pipelineIds }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to batch delete pipelines");
    }
    return res.json();
  },

  async previewChunks(data: any) {
    const res = await fetch(`${API_BASE}/pipelines/preview-chunks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Failed to preview chunks");
    return res.json();
  },

  async reindexPipeline(id: string) {
    const res = await fetch(`${API_BASE}/pipelines/${id}/index`, {
      method: "POST",
    });
    if (!res.ok) throw new Error("Failed to reindex pipeline");
    return res.json();
  },

  async getEmbeddingModels(availableOnly = false) {
    const url = availableOnly
      ? `${API_BASE}/models/embeddings?available_only=true`
      : `${API_BASE}/models/embeddings`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to load embedding catalog");
    return res.json();
  },

  async getGenerationModels(availableOnly = false) {
    const url = availableOnly
      ? `${API_BASE}/models/generation?available_only=true`
      : `${API_BASE}/models/generation`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to load generation catalog");
    return res.json();
  },

  // Chat & Retrieval
  async sendChatMessage(payload: {
    query: string;
    pipeline_id?: string;
    conversation_id?: string;
    top_k?: number;
    retrieval_mode?: string;
    generation_model?: string;
    generation_provider?: string;
    temperature?: number;
    system_prompt?: string;
  }) {
    const res = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Chat query failed (HTTP ${res.status})`);
    }
    return res.json();
  },

  async previewRetrieval(query: string, top_k = 5, retrieval_mode = "dense") {
    const res = await fetch(`${API_BASE}/retrieval/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, top_k, retrieval_mode }),
    });
    if (!res.ok) throw new Error("Failed to preview retrieval");
    return res.json();
  },

  async getChatHistory(conversation_id?: string) {
    const url = conversation_id
      ? `${API_BASE}/chat/history?conversation_id=${conversation_id}`
      : `${API_BASE}/chat/history`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to load chat history");
    return res.json();
  },

  async getConversations() {
    const res = await fetch(`${API_BASE}/chat/conversations`);
    if (!res.ok) throw new Error("Failed to load conversations");
    return res.json();
  },

  async deleteConversation(conversationId: string) {
    const res = await fetch(`${API_BASE}/chat/conversations/${conversationId}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete conversation");
    return res.json();
  },

  async clearAllChatHistory() {
    const res = await fetch(`${API_BASE}/chat/history`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to clear chat history");
    return res.json();
  },

  // Datasets
  async generateSyntheticDataset(payload: {
    name: string;
    description?: string;
    num_questions: number;
    difficulty?: string;
    include_unanswerable?: boolean;
    question_types?: string[];
  }) {
    const res = await fetch(`${API_BASE}/datasets/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to generate dataset");
    }
    return res.json();
  },

  async getDatasets() {
    const res = await fetch(`${API_BASE}/datasets`);
    if (!res.ok) throw new Error("Failed to list datasets");
    return res.json();
  },

  async getDataset(id: string) {
    const res = await fetch(`${API_BASE}/datasets/${id}`);
    if (!res.ok) throw new Error("Failed to load dataset");
    return res.json();
  },

  async approveDataset(id: string) {
    const res = await fetch(`${API_BASE}/datasets/${id}/approve`, {
      method: "POST",
    });
    if (!res.ok) throw new Error("Failed to approve dataset");
    return res.json();
  },

  async deleteDataset(id: string) {
    const res = await fetch(`${API_BASE}/datasets/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to delete dataset");
    }
    return res.json();
  },

  async batchDeleteDatasets(datasetIds: string[]) {
    const res = await fetch(`${API_BASE}/datasets/batch-delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataset_ids: datasetIds }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to batch delete datasets");
    }
    return res.json();
  },

  // Evaluations
  async startEvaluationRun(payload: {
    pipeline_id: string;
    dataset_id: string;
    name?: string;
    retrieval_k?: number;
  }) {
    const res = await fetch(`${API_BASE}/evaluations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to start evaluation run");
    }
    return res.json();
  },

  async getEvaluationRuns() {
    const res = await fetch(`${API_BASE}/evaluations`);
    if (!res.ok) throw new Error("Failed to list evaluation runs");
    return res.json();
  },

  async getEvaluationRun(id: string) {
    const res = await fetch(`${API_BASE}/evaluations/${id}`);
    if (!res.ok) throw new Error("Failed to load evaluation run");
    return res.json();
  },

  async getRunResults(id: string) {
    const res = await fetch(`${API_BASE}/evaluations/${id}/results`);
    if (!res.ok) throw new Error("Failed to load evaluation results");
    return res.json();
  },

  async compareExperiments(runIds: string[]) {
    const params = new URLSearchParams();
    for (const id of runIds) {
      params.append("run_ids", id);
    }
    const res = await fetch(`${API_BASE}/evaluations/compare/experiments?${params.toString()}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to compare experiments");
    }
    return res.json();
  },

  // Settings & Provider Credentials / Models
  async getSettings() {
    const res = await fetch(`${API_BASE}/settings`);
    if (!res.ok) throw new Error("Failed to load platform settings");
    return res.json();
  },

  async updateSettings(payload: {
    hf_key?: string;
    openai_key?: string;
    gemini_key?: string;
    groq_key?: string;
    anthropic_key?: string;
    cohere_key?: string;
    ollama_url?: string;
    chroma_directory?: string;
  }) {
    const res = await fetch(`${API_BASE}/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to update settings");
    }
    return res.json();
  },

  async fetchProviderModels(payload: {
    provider: string;
    api_key?: string;
    base_url?: string;
    save_key?: boolean;
  }) {
    const res = await fetch(`${API_BASE}/providers/fetch-models`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to fetch models for provider");
    }
    return res.json();
  },

  async getProviderModels(provider: string) {
    const res = await fetch(`${API_BASE}/providers/${provider}/models`);
    if (!res.ok) throw new Error(`Failed to load models for ${provider}`);
    return res.json();
  },

  async testProvider(provider: string, apiKey?: string) {
    const res = await fetch(`${API_BASE}/providers/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, api_key: apiKey }),
    });
    if (!res.ok) throw new Error(`Failed to test connection to ${provider}`);
    return res.json();
  },
};
