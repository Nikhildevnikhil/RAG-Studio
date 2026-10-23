export interface DocumentItem {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  processing_status: 'Uploaded' | 'Parsing' | 'Parsed' | 'Chunking' | 'Embedding' | 'Indexing' | 'Ready' | 'Failed';
  page_count: number;
  character_count: number;
  preview_text?: string;
  error_details?: string;
  created_at?: string;
}

export interface DocumentChunk {
  chunk_id: string;
  chunk_index: number;
  page_number: number;
  section_path: string;
  content: string;
  token_count: number;
}

export interface PipelineConfig {
  id: string;
  name: string;
  description?: string;
  chunking_strategy: string;
  chunk_size: number;
  chunk_overlap: number;
  separators?: string;
  embedding_provider: string;
  embedding_model: string;
  embedding_dimension: number;
  vector_store: string;
  retrieval_mode: string;
  top_k: number;
  similarity_threshold: number;
  mmr_diversity: number;
  generation_provider: string;
  generation_model: string;
  system_prompt?: string;
  temperature: number;
  created_at?: string;
}

export interface ChunkStats {
  total_chunks: number;
  min_length: number;
  max_length: number;
  avg_length: number;
  estimated_tokens: number;
  estimated_indexing_seconds: number;
  sample_chunks: Array<{
    chunk_index: number;
    content: string;
    page_number: number;
    section_path: string;
    token_count: number;
  }>;
}

export interface Citation {
  citation_id: number;
  chunk_id: string;
  document_id: string;
  page_number: number;
  section: string;
  excerpt: string;
}

export interface RetrievedChunk {
  chunk_id: string;
  document_id: string;
  content: string;
  score: number;
  metadata: {
    page?: number;
    section?: string;
    file_name?: string;
  };
}

export interface ChatMessage {
  id: string;
  conversation_id?: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  retrieved_chunks?: RetrievedChunk[];
  run_metadata?: {
    total_latency_ms?: number;
    embedding_latency_ms?: number;
    retrieval_latency_ms?: number;
    generation_latency_ms?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
    top_k?: number;
    retrieval_mode?: string;
    model?: string;
    provider?: string;
    is_fallback?: boolean;
    generation_error?: string;
  };
  created_at?: string;
}

export interface ChatConversation {
  conversation_id: string;
  first_query: string;
  message_count: number;
  last_active?: string;
  pipeline_id?: string;
}

export interface EvaluationDataset {
  id: string;
  name: string;
  description: string;
  version: string;
  source_type: string;
  example_count: number;
  is_approved: boolean;
  created_at?: string;
  examples?: EvaluationExample[];
}

export interface EvaluationExample {
  id: string;
  question: string;
  reference_answer: string;
  reference_facts: string[];
  relevant_chunk_ids: string[];
  relevant_document_ids: string[];
  supporting_locations: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  question_type: string;
  answerable: boolean;
  review_status: 'draft' | 'approved' | 'rejected';
}

export interface EvaluationRun {
  id: string;
  pipeline_id: string;
  dataset_id: string;
  name: string;
  status: 'running' | 'completed' | 'failed';
  total_queries: number;
  retrieval_k: number;
  duration_ms: number;
  created_at?: string;
  completed_at?: string;
  aggregate_scores: {
    retrieval?: {
      precision_at_k?: number;
      recall_at_k?: number;
      f1_at_k?: number;
      hit_rate_at_k?: number;
      mrr?: number;
      map_at_k?: number;
      ndcg_at_k?: number;
      r_precision?: number;
      context_precision?: number;
      context_recall?: number;
      evaluated_queries?: number;
      excluded_queries?: number;
    };
    judge?: Record<string, number>;
    overall_judge_score?: number;
    duration_ms?: number;
    avg_query_latency_ms?: number;
  };
}

export interface QueryEvaluationResult {
  id: string;
  example_id: string;
  query: string;
  generated_answer: string;
  retrieved_chunks: RetrievedChunk[];
  ranking_metrics: {
    precision_at_k: number;
    recall_at_k: number;
    f1_at_k: number;
    hit_rate_at_k: number;
    mrr: number;
    map_at_k: number;
    ndcg_at_k: number;
    r_precision: number;
    context_precision: number;
    context_recall: number;
  };
  judge_scores: {
    aggregate_score_100: number;
    criteria_scores: Record<string, {
      score_1_5: number;
      score_100: number;
      rationale: string;
      supported_claims?: string[];
      unsupported_claims?: string[];
      missing_facts?: string[];
      citation_issues?: string[];
    }>;
  };
  failure_tags: string[];
  latency_ms: number;
}
