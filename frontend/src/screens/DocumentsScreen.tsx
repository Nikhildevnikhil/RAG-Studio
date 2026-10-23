import React, { useState, useEffect, useRef } from "react";
import {
  Upload,
  FileText,
  Trash2,
  Eye,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Search,
  FileCode,
  Layers,
  X,
  AlertTriangle,
  FileCheck2,
  FileSpreadsheet
} from "lucide-react";
import { api } from "../services/api";
import { DocumentItem } from "../types";

export const DocumentsScreen: React.FC = () => {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedDocPreview, setSelectedDocPreview] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [documentToDelete, setDocumentToDelete] = useState<DocumentItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [notification, setNotification] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [reindexingId, setReindexingId] = useState<string | null>(null);

  useEffect(() => {
    loadDocuments();
  }, []);

  const showNotification = (type: "success" | "error", text: string) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 4000);
  };

  const loadDocuments = async () => {
    try {
      setLoading(true);
      const res = await api.getDocuments();
      setDocuments(res);
    } catch (e) {
      console.error(e);
      showNotification("error", "Failed to load document vault.");
    } finally {
      setLoading(false);
    }
  };

  const handleReindex = async (doc: DocumentItem) => {
    try {
      setReindexingId(doc.id);
      const res = await api.reindexDocument(doc.id);
      showNotification(
        "success",
        `Successfully re-indexed "${doc.file_name}" (${res.reindexed_chunks} chunks) into the vector store!`
      );
      await loadDocuments();
    } catch (e: any) {
      console.error(e);
      showNotification("error", e.message || `Failed to re-index ${doc.file_name}`);
    } finally {
      setReindexingId(null);
    }
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    try {
      setUploading(true);
      const fileArray = Array.from(files);
      await api.uploadDocuments(fileArray);
      await loadDocuments();
      showNotification("success", `Successfully uploaded ${fileArray.length} document(s).`);
    } catch (e) {
      console.error(e);
      showNotification("error", "Failed to upload documents. Please check file format and size.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleOpenPreview = async (docId: string) => {
    try {
      setPreviewLoading(true);
      const preview = await api.getDocumentPreview(docId);
      setSelectedDocPreview(preview);
    } catch (e) {
      console.error(e);
      showNotification("error", "Failed to load document preview.");
    } finally {
      setPreviewLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!documentToDelete) return;
    try {
      setDeleting(true);
      await api.deleteDocument(documentToDelete.id);
      showNotification(
        "success",
        `Successfully deleted "${documentToDelete.file_name}" and purged all associated vectors from Chroma DB.`
      );
      if (selectedDocPreview?.document_id === documentToDelete.id) {
        setSelectedDocPreview(null);
      }
      setDocumentToDelete(null);
      await loadDocuments();
    } catch (e: any) {
      console.error(e);
      showNotification("error", e.message || "Failed to delete document.");
    } finally {
      setDeleting(false);
    }
  };

  const filteredDocs = documents.filter((d) =>
    d.file_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Toast Notification Banner */}
      {notification && (
        <div
          className={`p-3.5 sm:p-4 rounded-xl border flex items-center justify-between text-xs font-semibold shadow-md transition-all ${
            notification.type === "success"
              ? "bg-emerald-50 dark:bg-emerald-950/80 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300"
              : "bg-rose-50 dark:bg-rose-950/80 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-300"
          }`}
        >
          <div className="flex items-center gap-2.5">
            {notification.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
            )}
            <span>{notification.text}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800/80">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            Document Vault & Parser
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-3xl">
            Ingest PDFs, Word docs, Markdown, CSV, and text. Automatic parsing preserves page numbers, sections, and vector embeddings in Chroma DB.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="file"
            ref={fileInputRef}
            multiple
            accept=".pdf,.docx,.doc,.txt,.md,.markdown,.csv,.xlsx"
            className="hidden"
            onChange={(e) => handleFileUpload(e.target.files)}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs sm:text-sm font-bold shadow-md shadow-cyan-500/20 transition-all flex items-center gap-2 disabled:opacity-50 active:scale-95"
          >
            <Upload className="w-4 h-4" />
            {uploading ? "Ingesting & Indexing..." : "Upload Files"}
          </button>
        </div>
      </div>

      {/* Drag & Drop Hero Box */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleFileUpload(e.dataTransfer.files);
        }}
        onClick={() => fileInputRef.current?.click()}
        className="double-bezel cursor-pointer group transition-all"
      >
        <div className="double-bezel-inner p-5 sm:p-8 text-center border-dashed border-2 border-slate-200 dark:border-slate-800 group-hover:border-cyan-500/50 transition-colors">
          <div className="w-12 h-12 rounded-2xl bg-cyan-50 dark:bg-slate-900 border border-cyan-200 dark:border-slate-800 flex items-center justify-center mx-auto mb-3 group-hover:scale-105 transition-transform text-cyan-600 dark:text-cyan-400">
            <Upload className="w-6 h-6" />
          </div>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            Drag and drop files here, or <span className="text-cyan-600 dark:text-cyan-400 underline">browse your disk</span>
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
            Supported formats: PDF (with page detection), DOCX, Markdown, TXT, CSV, XLSX
          </p>
        </div>
      </div>

      {/* Search & Stats Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search documents by filename..."
            className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 transition-all shadow-sm"
          />
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
          Total Vault Corpus: <span className="text-slate-900 dark:text-white font-bold">{documents.length}</span> documents
        </div>
      </div>

      {/* Documents List Table */}
      <div className="double-bezel">
        <div className="double-bezel-inner overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100/90 dark:bg-slate-900/90 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 uppercase font-mono tracking-wider">
                <tr>
                  <th className="py-3.5 px-4 font-semibold">Document Name</th>
                  <th className="py-3.5 px-4 font-semibold">Format</th>
                  <th className="py-3.5 px-4 font-semibold">Pages / Sections</th>
                  <th className="py-3.5 px-4 font-semibold">File Size</th>
                  <th className="py-3.5 px-4 font-semibold">Status</th>
                  <th className="py-3.5 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/60 text-slate-700 dark:text-slate-300">
                {filteredDocs.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-white flex items-center gap-2.5">
                      <FileText className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
                      <span className="truncate max-w-xs">{doc.file_name}</span>
                    </td>
                    <td className="py-3.5 px-4 font-mono uppercase text-slate-500 dark:text-slate-400 font-medium">
                      {doc.file_type}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-600 dark:text-slate-400">
                      {doc.page_count} {doc.page_count === 1 ? "page" : "pages"}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-600 dark:text-slate-400">
                      {Math.round(doc.file_size / 1024)} KB
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                          doc.processing_status === "Ready"
                            ? "bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800/40"
                            : doc.processing_status === "Failed"
                            ? "bg-rose-50 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-400 dark:border-rose-800/40"
                            : "bg-cyan-50 text-cyan-800 border-cyan-300 dark:bg-cyan-950/60 dark:text-cyan-400 dark:border-cyan-800/40"
                        }`}
                      >
                        {doc.processing_status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-1.5">
                      <button
                        onClick={() => handleReindex(doc)}
                        disabled={reindexingId === doc.id}
                        className="p-1.5 rounded-lg bg-slate-100 hover:bg-cyan-50 text-slate-600 hover:text-cyan-700 dark:bg-slate-800 dark:hover:bg-cyan-950 dark:text-slate-300 dark:hover:text-cyan-400 border border-slate-200 dark:border-slate-700 transition-colors disabled:opacity-50"
                        title="Re-index document into Vector Store"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${reindexingId === doc.id ? "animate-spin text-cyan-500" : ""}`} />
                      </button>
                      <button
                        onClick={() => handleOpenPreview(doc.id)}
                        className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 dark:hover:text-white border border-slate-200 dark:border-slate-700 transition-colors"
                        title="Inspect Parsed Content & Chunks"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDocumentToDelete(doc)}
                        className="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-700 dark:bg-slate-800 dark:hover:bg-rose-950/60 dark:text-slate-400 dark:hover:text-rose-400 border border-slate-200 dark:border-slate-700 transition-colors"
                        title="Delete document"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredDocs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400 dark:text-slate-500">
                      No documents found matching search criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {documentToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Delete Document</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
                Are you sure you want to permanently delete{" "}
                <span className="font-mono text-slate-900 dark:text-white font-semibold">{documentToDelete.file_name}</span>?
                This will purge all parsed text, <span className="text-cyan-600 dark:text-cyan-400 font-mono font-medium">{documentToDelete.page_count} page(s)</span>, and all associated vector embeddings from the Chroma DB index.
              </p>
            </div>
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800/80">
              <button
                onClick={() => setDocumentToDelete(null)}
                disabled={deleting}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold border border-slate-200 dark:border-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-rose-600/20 disabled:opacity-50 transition-all active:scale-95"
              >
                {deleting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Deleting & Purging...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete Permanently
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Preview Drawer Modal */}
      {selectedDocPreview && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-3xl max-h-[85vh] bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <FileCode className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                <h3 className="font-bold text-slate-900 dark:text-white text-sm truncate max-w-md">
                  {selectedDocPreview.file_name} — Parsed Chunks Inspection
                </h3>
              </div>
              <button
                onClick={() => setSelectedDocPreview(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Sample indexed chunks with page metadata and token lengths:
              </div>
              <div className="space-y-3">
                {selectedDocPreview.sample_chunks?.map((c: any) => (
                  <div
                    key={c.chunk_id}
                    className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 text-xs space-y-2"
                  >
                    <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 dark:text-slate-400">
                      <span className="text-cyan-600 dark:text-cyan-400 font-bold">
                        Chunk #{c.chunk_index + 1}
                      </span>
                      <span>
                        Page {c.page_number} • {c.section_path || "Main"} • {c.token_count} tokens
                      </span>
                    </div>
                    <p className="text-slate-800 dark:text-slate-200 leading-relaxed font-mono whitespace-pre-wrap bg-white dark:bg-slate-950/60 p-3 rounded-lg border border-slate-200/60 dark:border-slate-800/60">
                      {c.content}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <button
                onClick={() => {
                  const doc = documents.find((d) => d.id === selectedDocPreview.document_id);
                  if (doc) setDocumentToDelete(doc);
                }}
                className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:hover:bg-rose-900/80 dark:text-rose-300 text-xs font-semibold border border-rose-200 dark:border-rose-800/50 flex items-center gap-1.5 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Document
              </button>
              <button
                onClick={() => setSelectedDocPreview(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold border border-slate-200 dark:border-slate-800"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
