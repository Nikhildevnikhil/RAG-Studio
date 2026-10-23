import re
from typing import List, Dict, Any, Tuple
from backend.app.documents.parser import ExtractedSection

class ChunkResult:
    def __init__(self, content: str, chunk_index: int, page_number: int = 1, section_path: str = "", metadata: Dict[str, Any] = None):
        self.content = content
        self.chunk_index = chunk_index
        self.page_number = page_number
        self.section_path = section_path
        self.metadata = metadata or {}
        self.token_count = max(1, len(content) // 4)  # 4 chars ~ 1 token heuristic

class ChunkingEngine:
    @classmethod
    def chunk_sections(
        cls,
        sections: List[ExtractedSection],
        strategy: str = "recursive_character",
        chunk_size: int = 500,
        chunk_overlap: int = 50,
        separators: List[str] = None
    ) -> List[ChunkResult]:
        """
        Splits extracted document sections into chunks according to chosen strategy.
        """
        if chunk_overlap >= chunk_size:
            chunk_overlap = max(0, chunk_size // 4)
            
        all_chunks: List[ChunkResult] = []
        global_idx = 0
        
        for sec in sections:
            text = sec.content.strip()
            if not text:
                continue
                
            raw_splits: List[str] = []
            if strategy == "fixed_size":
                raw_splits = cls._split_fixed_size(text, chunk_size, chunk_overlap)
            elif strategy == "token_based":
                raw_splits = cls._split_token_based(text, chunk_size, chunk_overlap)
            elif strategy == "sentence_based":
                raw_splits = cls._split_sentence_based(text, max(1, chunk_size // 80), max(0, chunk_overlap // 80))
            elif strategy == "paragraph_based":
                raw_splits = cls._split_paragraph_based(text, chunk_size)
            elif strategy == "markdown_aware":
                raw_splits = cls._split_markdown_aware(text, chunk_size, chunk_overlap)
            elif strategy == "semantic":
                raw_splits = cls._split_semantic(text, chunk_size)
            elif strategy == "parent_child":
                raw_splits = cls._split_parent_child(text, chunk_size)
            else:  # default recursive_character
                sep_list = separators or ["\n\n", "\n", ". ", " ", ""]
                raw_splits = cls._split_recursive(text, chunk_size, chunk_overlap, sep_list)

                
            for chunk_text in raw_splits:
                cleaned = chunk_text.strip()
                if cleaned:
                    all_chunks.append(ChunkResult(
                        content=cleaned,
                        chunk_index=global_idx,
                        page_number=sec.page_number,
                        section_path=sec.section_path,
                        metadata={"page": sec.page_number, "section": sec.section_path, "strategy": strategy}
                    ))
                    global_idx += 1
                    
        return all_chunks

    @classmethod
    def calculate_statistics(cls, chunks: List[ChunkResult]) -> Dict[str, Any]:
        """Calculates statistical summary for preview and telemetry."""
        if not chunks:
            return {
                "total_chunks": 0,
                "min_length": 0,
                "max_length": 0,
                "avg_length": 0,
                "estimated_tokens": 0,
                "estimated_indexing_seconds": 0.0,
                "sample_chunks": []
            }
            
        lengths = [len(c.content) for c in chunks]
        tokens = [c.token_count for c in chunks]
        total_tokens = sum(tokens)
        
        return {
            "total_chunks": len(chunks),
            "min_length": min(lengths),
            "max_length": max(lengths),
            "avg_length": round(sum(lengths) / len(lengths), 1),
            "estimated_tokens": total_tokens,
            "estimated_indexing_seconds": round(max(0.2, len(chunks) * 0.02), 2),
            "sample_chunks": [
                {
                    "chunk_index": c.chunk_index,
                    "content": c.content[:300] + ("..." if len(c.content) > 300 else ""),
                    "page_number": c.page_number,
                    "section_path": c.section_path,
                    "token_count": c.token_count
                }
                for c in chunks[:5]  # first 5 samples
            ]
        }

    # ================= Chunking Strategy Implementations =================

    @staticmethod
    def _split_fixed_size(text: str, chunk_size: int, chunk_overlap: int) -> List[str]:
        step = max(1, chunk_size - chunk_overlap)
        chunks = []
        for i in range(0, len(text), step):
            chunk = text[i:i + chunk_size]
            chunks.append(chunk)
            if i + chunk_size >= len(text):
                break
        return chunks

    @staticmethod
    def _split_token_based(text: str, token_size: int, token_overlap: int) -> List[str]:
        words = text.split()
        # ~0.75 words per token -> approx tokens
        words_per_chunk = max(1, int(token_size * 0.75))
        overlap_words = max(0, int(token_overlap * 0.75))
        step = max(1, words_per_chunk - overlap_words)
        
        chunks = []
        for i in range(0, len(words), step):
            chunk_words = words[i:i + words_per_chunk]
            chunks.append(" ".join(chunk_words))
            if i + words_per_chunk >= len(words):
                break
        return chunks

    @staticmethod
    def _split_sentence_based(text: str, sentences_per_chunk: int = 4, overlap: int = 1) -> List[str]:
        # Split on sentence boundaries
        raw_sentences = re.split(r'(?<=[.?!])\s+', text)
        sentences = [s.strip() for s in raw_sentences if s.strip()]
        if not sentences:
            return [text]
            
        step = max(1, sentences_per_chunk - overlap)
        chunks = []
        for i in range(0, len(sentences), step):
            window = sentences[i:i + sentences_per_chunk]
            chunks.append(" ".join(window))
            if i + sentences_per_chunk >= len(sentences):
                break
        return chunks

    @staticmethod
    def _split_paragraph_based(text: str, max_size: int) -> List[str]:
        paras = text.split("\n\n")
        chunks = []
        current_block = []
        current_len = 0
        
        for p in paras:
            p = p.strip()
            if not p:
                continue
            if current_len + len(p) > max_size and current_block:
                chunks.append("\n\n".join(current_block))
                current_block = [p]
                current_len = len(p)
            else:
                current_block.append(p)
                current_len += len(p) + 2
                
        if current_block:
            chunks.append("\n\n".join(current_block))
        return chunks or [text]

    @staticmethod
    def _split_markdown_aware(text: str, chunk_size: int, chunk_overlap: int) -> List[str]:
        # Break on markdown headers (#, ##, ###)
        header_pattern = re.compile(r'(?=^#{1,4}\s+)', re.MULTILINE)
        sections = header_pattern.split(text)
        chunks = []
        
        for sec in sections:
            sec = sec.strip()
            if not sec:
                continue
            if len(sec) <= chunk_size:
                chunks.append(sec)
            else:
                # Subdivide oversized section recursively
                sub_chunks = ChunkingEngine._split_recursive(
                    sec, chunk_size, chunk_overlap, ["\n\n", "\n", ". ", " "]
                )
                chunks.extend(sub_chunks)
        return chunks or [text]

    @classmethod
    def _split_recursive(cls, text: str, chunk_size: int, chunk_overlap: int, separators: List[str]) -> List[str]:
        final_chunks: List[str] = []
        
        def _recurse(content: str, sep_idx: int):
            if len(content) <= chunk_size:
                final_chunks.append(content)
                return
            if sep_idx >= len(separators):
                # Fallback hard slice
                final_chunks.extend(cls._split_fixed_size(content, chunk_size, chunk_overlap))
                return
                
            separator = separators[sep_idx]
            if separator == "":
                final_chunks.extend(cls._split_fixed_size(content, chunk_size, chunk_overlap))
                return
                
            splits = content.split(separator)
            accumulated: List[str] = []
            accumulated_len = 0
            
            for part in splits:
                part_len = len(part) + len(separator)
                if accumulated_len + part_len > chunk_size and accumulated:
                    merged = separator.join(accumulated).strip()
                    if len(merged) > chunk_size:
                        _recurse(merged, sep_idx + 1)
                    else:
                        final_chunks.append(merged)
                    accumulated = [part]
                    accumulated_len = len(part)
                else:
                    accumulated.append(part)
                    accumulated_len += part_len
                    
            if accumulated:
                merged = separator.join(accumulated).strip()
                if len(merged) > chunk_size:
                    _recurse(merged, sep_idx + 1)
                else:
                    final_chunks.append(merged)

        _recurse(text, 0)
        return final_chunks

    @classmethod
    def _split_semantic(cls, text: str, max_chunk_size: int = 500) -> List[str]:
        """
        Groups semantically continuous sentences based on semantic shift boundaries.
        """
        sentences = [s.strip() for s in re.split(r'(?<=[.?!])\s+', text) if len(s.strip()) > 10]
        if not sentences or len(sentences) <= 1:
            return [text]

        chunks = []
        current_chunk = [sentences[0]]
        current_len = len(sentences[0])

        for i in range(1, len(sentences)):
            s_prev = sentences[i - 1]
            s_curr = sentences[i]
            
            # Semantic lexical similarity proxy
            w_prev = set([w for w in s_prev.lower().split() if len(w) > 3])
            w_curr = set([w for w in s_curr.lower().split() if len(w) > 3])
            union = len(w_prev | w_curr)
            sim = (len(w_prev & w_curr) / union) if union > 0 else 0.0

            if (sim < 0.12 and current_len >= 200) or (current_len + len(s_curr) > max_chunk_size):
                chunks.append(" ".join(current_chunk))
                current_chunk = [s_curr]
                current_len = len(s_curr)
            else:
                current_chunk.append(s_curr)
                current_len += len(s_curr) + 1

        if current_chunk:
            chunks.append(" ".join(current_chunk))

        return chunks

    @classmethod
    def _split_parent_child(cls, text: str, child_size: int = 250, parent_size: int = 750) -> List[str]:
        """
        Subdivides larger parent sections into high-precision child chunks.
        """
        parents = cls._split_fixed_size(text, parent_size, parent_size // 4)
        chunks = []
        for parent in parents:
            children = cls._split_fixed_size(parent, child_size, child_size // 5)
            chunks.extend(children)
        return chunks or [text]

