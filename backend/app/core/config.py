import os
from pydantic import model_validator
from pydantic_settings import BaseSettings
from typing import Optional

def is_valid_api_key(val: Optional[str]) -> bool:
    """
    Checks if a string is a real, unmasked, valid API key.
    Rejects None, empty strings, masked/placeholder strings containing bullets (•),
    ellipses (...), asterisks masks (****), and non-ASCII characters.
    """
    if not val:
        return False
    s = str(val).strip()
    if not s:
        return False
    if not s.isascii():
        return False
    if "•" in s or "\u2022" in s or "\u25cf" in s:
        return False
    if "••••" in s or "..." in s or "****" in s:
        return False
    if len(s) < 8:
        return False
    return True

class Settings(BaseSettings):
    PROJECT_NAME: str = "RAG Studio API"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    
    # Storage and Database
    STORAGE_DIR: str = os.path.join(os.getcwd(), "storage", "documents")
    DATABASE_URL: str = "sqlite+aiosqlite:///./rag_studio.db"
    
    # Vector store configuration
    DEFAULT_VECTOR_STORE: str = "chroma"  # chroma, memory, pgvector, qdrant
    PGVECTOR_URL: Optional[str] = None
    CHROMA_PERSIST_DIRECTORY: str = os.path.join(os.getcwd(), "storage", "chromadb")
    
    # Model Provider API Keys
    OPENAI_API_KEY: Optional[str] = None
    ANTHROPIC_API_KEY: Optional[str] = None
    GROQ_API_KEY: Optional[str] = None
    GOOGLE_API_KEY: Optional[str] = None
    COHERE_API_KEY: Optional[str] = None
    HUGGINGFACE_API_KEY: Optional[str] = None
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    
    # Public Demo Mode & Rate Limiting
    DEMO_MODE: bool = False
    RATE_LIMIT_PER_MINUTE: int = 15
    
    @model_validator(mode="after")
    def sanitize_keys(self) -> "Settings":
        for field in [
            "OPENAI_API_KEY",
            "ANTHROPIC_API_KEY",
            "GROQ_API_KEY",
            "GOOGLE_API_KEY",
            "COHERE_API_KEY",
            "HUGGINGFACE_API_KEY"
        ]:
            val = getattr(self, field, None)
            if val and not is_valid_api_key(val):
                setattr(self, field, None)
        return self

    class Config:
        env_file = ".env"
        extra = "allow"

settings = Settings()

# Clean up any invalid keys in os.environ as well
for k in ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GROQ_API_KEY", "GOOGLE_API_KEY", "COHERE_API_KEY", "HUGGINGFACE_API_KEY"]:
    ev = os.environ.get(k)
    if ev and not is_valid_api_key(ev):
        os.environ.pop(k, None)

os.makedirs(settings.STORAGE_DIR, exist_ok=True)
os.makedirs(settings.CHROMA_PERSIST_DIRECTORY, exist_ok=True)

