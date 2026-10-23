import uuid
import re
import random
from typing import List, Dict, Any, Optional

QUESTION_ARCHETYPES = [
    "factual",
    "conceptual",
    "procedural",
    "comparative",
    "multi_hop",
    "table_based",
    "summarization",
    "unanswerable",
    "ambiguous",
    "citation_focused"
]

class SyntheticDatasetGenerator:
    @classmethod
    def generate_synthetic_examples(
        cls,
        chunks: List[Dict[str, Any]],
        num_questions: int = 5,
        target_types: Optional[List[str]] = None,
        difficulty: str = "medium",
        include_unanswerable: bool = True
    ) -> List[Dict[str, Any]]:
        """
        Generates synthetic Q&A evaluation examples grounded directly in provided document chunks.
        Extracts salient entities, facts, and constructs question-answer-facts triples.
        """
        if not chunks:
            return []

        types_pool = target_types or QUESTION_ARCHETYPES
        if not include_unanswerable and "unanswerable" in types_pool:
            types_pool = [t for t in types_pool if t != "unanswerable"]

        examples = []
        num_to_generate = max(1, min(num_questions, 50))
        
        for i in range(num_to_generate):
            q_type = types_pool[i % len(types_pool)]
            # Pick primary chunk
            primary_chunk = chunks[i % len(chunks)]
            content = primary_chunk.get("content", "")
            chunk_id = primary_chunk.get("id") or str(primary_chunk.get("chunk_index", i))
            doc_id = primary_chunk.get("document_id", "doc-1")
            page_no = primary_chunk.get("page_number", 1)
            section = primary_chunk.get("section_path", "Main")
            
            # Sentence extraction
            sentences = [s.strip() for s in re.split(r'(?<=[.?!])\s+', content) if len(s.strip()) > 25]
            if not sentences:
                sentences = [content[:120]]

            q, ans, facts, answerable, relevant_chunks, locs = cls._create_example_by_type(
                q_type=q_type,
                sentences=sentences,
                primary_chunk=primary_chunk,
                all_chunks=chunks,
                difficulty=difficulty
            )

            examples.append({
                "id": str(uuid.uuid4()),
                "question": q,
                "reference_answer": ans,
                "reference_facts": facts,
                "relevant_document_ids": [doc_id] if answerable else [],
                "relevant_chunk_ids": relevant_chunks,
                "supporting_locations": locs,
                "difficulty": difficulty,
                "question_type": q_type,
                "answerable": answerable,
                "review_status": "draft"
            })

        return examples

    @classmethod
    def _create_example_by_type(
        cls,
        q_type: str,
        sentences: List[str],
        primary_chunk: Dict[str, Any],
        all_chunks: List[Dict[str, Any]],
        difficulty: str
    ) -> tuple:
        s1 = sentences[0]
        chunk_id = primary_chunk.get("id") or str(primary_chunk.get("chunk_index", 0))
        doc_id = primary_chunk.get("document_id", "doc-1")
        page = primary_chunk.get("page_number", 1)
        sec = primary_chunk.get("section_path", "Section")
        loc_str = f"Page {page}, {sec}"

        # Extract keywords for question formulation
        words = [w for w in re.findall(r'\b[A-Za-z]{4,}\b', s1) if w.lower() not in ["this", "that", "with", "from", "have", "were", "been"]]
        topic = " ".join(words[:2]) if words else "the specified subject"

        if q_type == "factual":
            q = f"According to the documentation, what is stated regarding {topic}?"
            ans = f"The source documents state that {s1}"
            facts = [s1[:80]]
            return q, ans, facts, True, [chunk_id], [loc_str]

        elif q_type == "conceptual":
            q = f"How does the source describe the concept and significance of {topic}?"
            ans = f"In {sec}, it is explained that {s1}"
            facts = [s1[:80]]
            return q, ans, facts, True, [chunk_id], [loc_str]

        elif q_type == "procedural":
            q = f"What are the outlined steps or requirements pertaining to {topic}?"
            ans = f"The established procedure specifies: {s1}"
            facts = [s1[:80]]
            return q, ans, facts, True, [chunk_id], [loc_str]

        elif q_type == "comparative":
            # Compare with another chunk if available
            second_chunk = all_chunks[(primary_chunk.get("chunk_index", 0) + 1) % len(all_chunks)]
            s2 = second_chunk.get("content", "")[:100]
            cid2 = second_chunk.get("id") or str(second_chunk.get("chunk_index", 1))
            q = f"How do the provisions for {topic} compare across different sections of the document?"
            ans = f"Section {sec} highlights that {s1}, whereas related documentation notes {s2}."
            facts = [s1[:60], s2[:60]]
            return q, ans, facts, True, [chunk_id, cid2], [loc_str, f"Page {second_chunk.get('page_number', 1)}"]

        elif q_type == "multi_hop":
            second_chunk = all_chunks[(primary_chunk.get("chunk_index", 0) + 1) % len(all_chunks)]
            cid2 = second_chunk.get("id") or str(second_chunk.get("chunk_index", 1))
            q = f"Synthesizing the details from {sec} and subsequent passages, what overall conclusion can be drawn regarding {topic}?"
            ans = f"Connecting both passages reveals that {s1} which directly impacts the broader context."
            facts = [s1[:70]]
            return q, ans, facts, True, [chunk_id, cid2], [loc_str]

        elif q_type == "table_based":
            q = f"Based on the tabular records or enumerated properties, what values correspond to {topic}?"
            ans = f"The structured data notes: {s1}"
            facts = [s1[:70]]
            return q, ans, facts, True, [chunk_id], [loc_str]

        elif q_type == "summarization":
            q = f"Provide a concise executive summary of the content in {sec}."
            ans = f"In summary, the passage establishes: {s1}"
            facts = [s1[:80]]
            return q, ans, facts, True, [chunk_id], [loc_str]

        elif q_type == "unanswerable":
            q = f"What was the exact quarterly revenue of the extraterrestrial satellite division in fiscal year 1982?"
            ans = "The provided document collection does not contain any information regarding extraterrestrial satellite division revenues in 1982."
            facts = ["Information is absent from source corpus; system must abstain."]
            return q, ans, facts, False, [], []

        elif q_type == "ambiguous":
            q = f"Could you provide more details about the primary system?"
            ans = f"The system referenced in {sec} pertains to: {s1}"
            facts = [s1[:70]]
            return q, ans, facts, True, [chunk_id], [loc_str]

        else:  # citation_focused
            q = f"What specific factual claim is established regarding {topic}, and which exact page supports it?"
            ans = f"The document specifically establishes that {s1} on {loc_str}."
            facts = [s1[:80], loc_str]
            return q, ans, facts, True, [chunk_id], [loc_str]
