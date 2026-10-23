# RAG Studio — A Configurable Retrieval-Augmented Generation Platform

**RAG Studio** is an enterprise-grade AI workbench that enables developers, ML engineers, and researchers to upload documents, configure and experiment with RAG pipelines, inspect retrieved evidence with inline citations, and evaluate retrieval and answer-generation quality through automated metrics and an LLM-as-a-Judge interface.

---

## 🚀 Key Capabilities

### 1. Multi-Format Document Ingestion & Provenance
- Ingests **PDF, DOCX, TXT, Markdown, CSV, and XLSX**.
- Preserves document hierarchy, page numbers, and tabular structures.
- Real-time processing state machine: `Uploaded` $\rightarrow$ `Parsing` $\rightarrow$ `Parsed` $\rightarrow$ `Chunking` $\rightarrow$ `Embedding` $\rightarrow$ `Indexing` $\rightarrow$ `Ready`.
- SHA-256 content hashing for duplicate file detection.

### 2. Configurable Chunking Engine (6 Strategies)
1. **Recursive Character Chunking** (hierarchical separators `\n\n`, `\n`, ` `, `""`)
2. **Fixed-Size Character Chunking** (strict window length with customizable overlap)
3. **Token-Based Chunking** (tokenizer approximations to prevent context window overflow)
4. **Sentence-Based Chunking** (groups logical sentence windows)
5. **Paragraph-Based Chunking** (preserves prose paragraph structure)
6. **Markdown / Header-Aware Chunking** (splits on `#`, `##`, `###` headings with breadcrumb preservation)
- Real-time chunk preview with statistical telemetry (min/max/average length, estimated tokens, indexing duration).

### 3. Model Registry & Vector Database Abstraction
- **Embedding Catalog:** OpenAI (`text-embedding-3-small`, `large`), Google Gemini (`text-embedding-004`), Cohere (`embed-english-v3.0`), Hugging Face (`BGE Small`), Ollama local.
- **Vector Database:** Fast embedded local vector engine + PostgreSQL pgvector connector.
- **Retrieval Modes:** Dense Cosine Similarity, Maximum Marginal Relevance (MMR with $\lambda$ diversity slider), and Hybrid weighting.

### 4. 3-Panel Chat Playground with Evidence Inspector
- Interactive chat streaming with verified bracketed inline citations `[1]`, `[2]`.
- **Evidence Inspector:** Clicking any citation focuses the exact retrieved chunk, displaying similarity score, document name, page number, and section path.
- **Execution Tracing:** Latency breakdown across embedding, retrieval, and generation stages + token consumption telemetry.
- **Graceful Abstention:** Detects when evidence is missing and cleanly abstains without hallucinating.

### 5. Synthetic Evaluation Dataset Studio
- Automatically synthesizes Q&A test datasets from uploaded documents across **10 Question Archetypes**:
  - *Factual, Conceptual, Procedural, Comparative, Multi-hop, Table-based, Summarization, Unanswerable, Ambiguous, Citation-focused.*
- Human review, editing, and version approval workflow.
- One-click JSON and CSV dataset export.

### 6. Top 10 Retrieval Quality Metrics (FR-07)
Calculates exact mathematical retrieval scores against gold-standard passage labels:
1. **Precision@K:** $\frac{|\text{TopK}_q \cap R_q|}{K}$
2. **Recall@K:** $\frac{|\text{TopK}_q \cap R_q|}{|R_q|}$
3. **F1@K:** Harmonic mean of $P@K$ and $R@K$
4. **Hit Rate@K:** Indicator whether at least one relevant passage was retrieved
5. **Mean Reciprocal Rank (MRR):** Reciprocal rank of the first relevant passage
6. **Mean Average Precision (MAP@K):** Ranking quality across all relevant passages
7. **nDCG@K:** Discounted Cumulative Gain with graded relevance
8. **R-Precision:** Precision at cutoff $R = |R_q|$
9. **Context Precision:** Position-weighted relevance of retrieved passages
10. **Context Recall:** Fact attribution ratio against reference ground truth

### 7. LLM-as-a-Judge Evaluation Engine (FR-08)
Evaluates generated answers against **11 Rigorous Criteria**:
- *Correctness / Accuracy, Completeness, Faithfulness, Groundedness, Answer Relevance, Citation Correctness, Citation Coverage, Coherence, Conciseness, Abstention Quality, Safety & Instruction Compliance.*
- Standardized 5-point discrete rubric normalized to 0-100: $\text{Score}_{100} = \frac{\text{Score}_{1\text{--}5} - 1}{4} \times 100$.
- Query-level failure root cause tagging (`low_retrieval_recall`, `noisy_retrieval`, `hallucination_unfaithful`, `invalid_citation_hallucination`, `failed_abstention`).

### 8. Experiment Comparison & Regression Matrix
- Side-by-side comparison of 2+ pipeline architectures evaluated on the same benchmark dataset.
- Real-time delta diff calculation ($+8.4\%$ Recall, $-120\text{ms}$ Latency).

---

## 🛠️ Architecture & Tech Stack

```
rag-studio/
├── backend/
│   ├── app/
│   │   ├── api/             # REST Routers (documents, pipelines, chat, datasets, evaluations, analytics)
│   │   ├── core/            # Config, SQLAlchemy ORM models, async database
│   │   ├── documents/       # PDF, DOCX, TXT, MD, CSV, XLSX parsers
│   │   ├── chunking/        # 6 chunking algorithms + statistical calculator
│   │   ├── embeddings/      # Embedding model catalog & unit vector engine
│   │   ├── vectorstores/    # Local NumPy cosine & MMR vector store + pgvector interface
│   │   ├── generation/      # LLM generation with citation enforcement & validation
│   │   ├── evaluation/      # Top 10 retrieval metrics + 11-criteria judge engine
│   │   └── main.py          # FastAPI application entrypoint & startup seeder
│   └── tests/               # Automated smoke & evaluation pipeline tests
├── frontend/
│   ├── src/
│   │   ├── components/      # Sidebar, double-bezel cards, hardware enclosures
│   │   ├── screens/         # 8 primary screens
│   │   ├── services/        # API client
│   │   └── types/           # Complete TypeScript interfaces
│   └── package.json
└── start.bat                # One-click launcher for backend & frontend
```

---

## ⚡ Quick Start

### 1. Launch the Application
Simply double-click `start.bat` or run:

```bash
# Terminal 1: Backend
.\venv\Scripts\activate
$env:PYTHONPATH="."
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2: Frontend
cd frontend
npm run dev
```

### 2. Access the Web Interfaces
- **Web App (Workbench):** [http://localhost:5173](http://localhost:5173)
- **FastAPI Interactive Docs:** [http://localhost:8000/docs](http://localhost:8000/docs)
- **API Health Check:** [http://localhost:8000/health](http://localhost:8000/health)

---

## 🧪 Automated Testing

To run the automated smoke test and evaluation suite:

```bash
# Verify API endpoints and bracketed citation generation
$env:PYTHONPATH="."
.\venv\Scripts\python.exe backend\tests\test_api_smoke.py

# Verify synthetic dataset generation, Top 10 retrieval metrics, and LLM-as-a-judge
.\venv\Scripts\python.exe backend\tests\test_evaluation_flow.py
```
