from backend.app.chunking.engine import ChunkingEngine
from backend.app.documents.parser import ExtractedSection

def test_all_strategies():
    sample_text = """# Artificial Intelligence in Medicine
Artificial intelligence (AI) has revolutionized healthcare diagnostics. Machine learning models analyze radiological images with human-level accuracy.

## Diagnostic Algorithms
Convolutional neural networks detect early-stage retinal pathologies. Natural language processing models extract clinical phenotypes from electronic health records. These systems assist physicians by reducing cognitive fatigue.

## Clinical Trials and Regulations
Regulatory agencies require rigorous clinical trial validation before algorithmic deployment. Randomized controlled trials establish clinical efficacy and patient safety. Post-market surveillance monitors algorithmic drift over longitudinal periods."""

    section = ExtractedSection(content=sample_text, page_number=1, section_path="Healthcare AI")
    strategies = [
        "recursive_character",
        "fixed_size",
        "token_based",
        "sentence_based",
        "paragraph_based",
        "markdown_aware",
        "semantic",
        "parent_child"
    ]

    print("Verifying 8 Chunking Strategies:")
    for strat in strategies:
        chunks = ChunkingEngine.chunk_sections([section], strategy=strat, chunk_size=300, chunk_overlap=30)
        stats = ChunkingEngine.calculate_statistics(chunks)
        print(f"  [{strat:<20}]: {stats['total_chunks']} chunks, avg length: {stats['avg_length']} chars, tokens: {stats['estimated_tokens']}")
        assert stats["total_chunks"] > 0
        assert len(chunks[0].content) > 0

    print("\n=== ALL 8 CHUNKING STRATEGIES VERIFIED SUCCESSFULLY! ===")

if __name__ == "__main__":
    test_all_strategies()
