import os
import re
from typing import List, Dict, Any, Optional
import httpx
from backend.app.core.config import settings, is_valid_api_key

# Global in-memory cache for dynamically fetched provider models
PROVIDER_MODELS_CACHE: Dict[str, List[Dict[str, Any]]] = {}

# Curated fallback catalogs in case provider endpoint is unreachable or offline
DEFAULT_PROVIDER_MODELS: Dict[str, List[Dict[str, Any]]] = {
    "groq": [
        {"model_id": "qwen/qwen3.8-27b", "name": "Groq Qwen 2.5/3 27B", "type": "generation", "context_window": 128000, "description": "High-throughput high-precision reasoning on Groq LPUs"},
        {"model_id": "openai/gpt-oss-120b", "name": "Groq GPT-OSS 120B", "type": "generation", "context_window": 128000, "description": "Massive 120B parameter reasoning model running on Groq LPUs"},
        {"model_id": "llama-3.3-70b-versatile", "name": "Groq LLaMA 3.3 70B Versatile", "type": "generation", "context_window": 128000, "description": "Flagship high-throughput reasoning model on Groq LPUs"},
        {"model_id": "llama-3.1-8b-instant", "name": "Groq LLaMA 3.1 8B Instant", "type": "generation", "context_window": 128000, "description": "Ultra fast compact model with 128k context on Groq LPUs"},
        {"model_id": "mixtral-8x7b-32768", "name": "Groq Mixtral 8x7B", "type": "generation", "context_window": 32768, "description": "Sparse mixture of experts model with 32k context on Groq LPUs"},
        {"model_id": "allam-2-7b", "name": "Groq Allam 2 7B", "type": "generation", "context_window": 8192, "description": "High performance instruction model on Groq LPUs"}
    ],
    "openai": [
        {"model_id": "gpt-4o", "name": "OpenAI GPT-4o", "type": "generation", "context_window": 128000, "description": "High intelligence flagship multimodal model"},
        {"model_id": "gpt-4o-mini", "name": "OpenAI GPT-4o Mini", "type": "generation", "context_window": 128000, "description": "Fast, affordable, highly capable reasoning model"},
        {"model_id": "o1-preview", "name": "OpenAI o1-preview", "type": "generation", "context_window": 128000, "description": "Chain-of-thought advanced reasoning model"},
        {"model_id": "o1-mini", "name": "OpenAI o1-mini", "type": "generation", "context_window": 128000, "description": "Fast STEM & coding reasoning model"},
        {"model_id": "text-embedding-3-small", "name": "OpenAI text-embedding-3-small", "type": "embedding", "dimension": 1536, "context_window": 8191, "description": "Standard high-performance dense embeddings"},
        {"model_id": "text-embedding-3-large", "name": "OpenAI text-embedding-3-large", "type": "embedding", "dimension": 3072, "context_window": 8191, "description": "Top-tier accuracy 3072-dim embeddings"}
    ],
    "google": [
        {"model_id": "gemini-1.5-flash", "name": "Google Gemini 1.5 Flash", "type": "generation", "context_window": 1000000, "description": "High throughput 1M context multimodal model"},
        {"model_id": "gemini-1.5-pro", "name": "Google Gemini 1.5 Pro", "type": "generation", "context_window": 2000000, "description": "2M token context window deep reasoning model"},
        {"model_id": "gemini-2.0-flash-exp", "name": "Google Gemini 2.0 Flash Experimental", "type": "generation", "context_window": 1000000, "description": "Next-generation experimental speed and agentic model"},
        {"model_id": "text-embedding-004", "name": "Google Gemini Embedding 004", "type": "embedding", "dimension": 768, "context_window": 2048, "description": "State-of-the-art multilingual retrieval embedding model"}
    ],
    "huggingface": [
        {"model_id": "BAAI/bge-small-en-v1.5", "name": "Hugging Face BGE Small English v1.5", "type": "embedding", "dimension": 384, "context_window": 512, "description": "Compact MTEB benchmark leader for semantic search"},
        {"model_id": "sentence-transformers/all-MiniLM-L6-v2", "name": "Sentence-Transformers all-MiniLM-L6-v2", "type": "embedding", "dimension": 384, "context_window": 512, "description": "Fast sentence embedding model from Hugging Face Hub"},
        {"model_id": "BAAI/bge-large-en-v1.5", "name": "Hugging Face BGE Large English v1.5", "type": "embedding", "dimension": 1024, "context_window": 512, "description": "High-density semantic search and passage ranking"},
        {"model_id": "intfloat/e5-base-v2", "name": "Hugging Face E5 Base v2", "type": "embedding", "dimension": 768, "context_window": 512, "description": "Dense passage retrieval for enterprise QA"},
        {"model_id": "HuggingFaceH4/zephyr-7b-beta", "name": "Hugging Face Zephyr 7B Beta", "type": "generation", "context_window": 8192, "description": "Aligned assistant model from Hugging Face"},
        {"model_id": "meta-llama/Llama-3.2-3B-Instruct", "name": "Hugging Face Llama 3.2 3B Instruct", "type": "generation", "context_window": 128000, "description": "Leading compact open weights instruction model"},
        {"model_id": "mistralai/Mistral-7B-Instruct-v0.3", "name": "Hugging Face Mistral 7B Instruct", "type": "generation", "context_window": 32768, "description": "High reasoning density multilingual instruct model"},
        {"model_id": "Qwen/Qwen2.5-7B-Instruct", "name": "Hugging Face Qwen 2.5 7B Instruct", "type": "generation", "context_window": 128000, "description": "Alibaba Qwen 2.5 instruction model"}
    ],
    "anthropic": [
        {"model_id": "claude-3-5-sonnet-20241022", "name": "Anthropic Claude 3.5 Sonnet", "type": "generation", "context_window": 200000, "description": "State-of-the-art coding and nuanced reasoning"},
        {"model_id": "claude-3-5-haiku-20241022", "name": "Anthropic Claude 3.5 Haiku", "type": "generation", "context_window": 200000, "description": "Fastest Claude model with near-instant responsiveness"},
        {"model_id": "claude-3-opus-20240229", "name": "Anthropic Claude 3 Opus", "type": "generation", "context_window": 200000, "description": "Top-tier intelligence for complex workflows"}
    ],
    "cohere": [
        {"model_id": "command-r-plus", "name": "Cohere Command R+", "type": "generation", "context_window": 128000, "description": "Enterprise optimized conversational model with citation grounded generation"},
        {"model_id": "command-r", "name": "Cohere Command R", "type": "generation", "context_window": 128000, "description": "Fast, high-efficiency enterprise retrieval model"},
        {"model_id": "embed-english-v3.0", "name": "Cohere Embed English v3.0", "type": "embedding", "dimension": 1024, "context_window": 512, "description": "Enterprise passage search and retrieval embeddings"}
    ]
}


class ProviderModelService:
    @staticmethod
    def normalize_provider_name(provider: str) -> str:
        p = provider.lower().strip()
        if p in ["google", "gemini"]:
            return "google"
        return p

    @staticmethod
    def get_configured_key(provider: str) -> Optional[str]:
        p = ProviderModelService.normalize_provider_name(provider)
        val = None
        if p == "groq":
            val = settings.GROQ_API_KEY or os.environ.get("GROQ_API_KEY")
        elif p == "openai":
            val = settings.OPENAI_API_KEY or os.environ.get("OPENAI_API_KEY")
        elif p == "google":
            val = settings.GOOGLE_API_KEY or os.environ.get("GOOGLE_API_KEY")
        elif p == "huggingface":
            val = settings.HUGGINGFACE_API_KEY or os.environ.get("HUGGINGFACE_API_KEY")
        elif p == "anthropic":
            val = settings.ANTHROPIC_API_KEY or os.environ.get("ANTHROPIC_API_KEY")
        elif p == "cohere":
            val = settings.COHERE_API_KEY or os.environ.get("COHERE_API_KEY")

        if val and is_valid_api_key(val):
            return str(val).strip()
        return None

    @classmethod
    async def fetch_models(
        cls,
        provider: str,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Dynamically fetches all available models directly from the provider's API
        using the provided or configured API key.
        """
        normalized = cls.normalize_provider_name(provider)
        key = None
        if api_key and is_valid_api_key(api_key):
            key = str(api_key).strip()
        else:
            key = cls.get_configured_key(normalized)

        if normalized != "ollama" and not key:
            return {
                "status": "error",
                "provider": normalized,
                "count": 0,
                "models": [],
                "message": f"No valid API key provided or configured for {normalized.upper()}. Please enter a valid API key."
            }

        try:
            if normalized == "groq":
                return await cls._fetch_groq_models(key)
            elif normalized == "openai":
                return await cls._fetch_openai_models(key)
            elif normalized == "google":
                return await cls._fetch_google_models(key)
            elif normalized == "huggingface":
                return await cls._fetch_huggingface_models(key)
            elif normalized == "anthropic":
                return await cls._fetch_anthropic_models(key)
            elif normalized == "cohere":
                return await cls._fetch_cohere_models(key)
            elif normalized == "ollama":
                return await cls._fetch_ollama_models(base_url or settings.OLLAMA_BASE_URL)
            else:
                return {
                    "status": "error",
                    "provider": normalized,
                    "count": 0,
                    "models": [],
                    "message": f"Unsupported model provider: '{provider}'."
                }
        except httpx.HTTPStatusError as e:
            status_code = e.response.status_code
            error_detail = ""
            try:
                err_data = e.response.json()
                if "error" in err_data:
                    error_detail = err_data["error"].get("message", str(err_data["error"]))
                elif "detail" in err_data:
                    error_detail = err_data["detail"]
            except Exception:
                error_detail = e.response.text[:120]

            if status_code in [401, 403]:
                msg = f"Authentication failed (HTTP {status_code}): Invalid or expired {normalized.upper()} API key."
            elif status_code == 429:
                msg = f"Rate limit reached (HTTP 429) for {normalized.upper()}."
            else:
                msg = f"{normalized.upper()} API returned HTTP {status_code}: {error_detail or 'Request failed'}"

            # Return explicit failure
            return {
                "status": "error",
                "provider": normalized,
                "count": 0,
                "models": [],
                "message": msg
            }
        except (httpx.ConnectError, httpx.TimeoutException) as e:
            return {
                "status": "error",
                "provider": normalized,
                "count": 0,
                "models": [],
                "message": f"Network error connecting to {normalized.upper()} API gateway: {str(e)[:100]}"
            }
        except UnicodeEncodeError:
            return {
                "status": "error",
                "provider": normalized,
                "count": 0,
                "models": [],
                "message": f"Invalid API key character encoding for {normalized.upper()}. API keys must contain valid ASCII characters only."
            }
        except Exception as e:
            return {
                "status": "error",
                "provider": normalized,
                "count": 0,
                "models": [],
                "message": f"Unexpected error fetching {normalized.upper()} models: {str(e)[:100]}"
            }

    @classmethod
    async def _fetch_groq_models(cls, api_key: str) -> Dict[str, Any]:
        url = "https://api.groq.com/openai/v1/models"
        headers = {
            "Authorization": f"Bearer {api_key.strip()}",
            "Content-Type": "application/json"
        }
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            data = resp.json().get("data", [])

        models = []
        for item in data:
            mid = item.get("id", "")
            if not mid:
                continue

            # Infer context window & properties based on model name
            ctx = 128000
            if "mixtral" in mid:
                ctx = 32768
            elif "gemma" in mid:
                ctx = 8192
            elif "8192" in mid:
                ctx = 8192
            elif "32768" in mid:
                ctx = 32768

            m_type = "audio" if "whisper" in mid else "generation"
            owner = item.get("owned_by", "Meta / Open-Weights")

            models.append({
                "provider": "groq",
                "model_id": mid,
                "name": f"Groq {mid}",
                "type": m_type,
                "context_window": ctx,
                "description": f"Groq LPU accelerated inference ({owner})",
                "is_available": True,
                "availability_reason": "Live Groq API Key Verified"
            })

        # Sort so leading Qwen, GPT-OSS, and LLaMA models are at the top
        models.sort(key=lambda m: (
            0 if "qwen" in m["model_id"].lower() else (
                1 if "gpt-oss" in m["model_id"].lower() else (
                    2 if "llama-3.3" in m["model_id"].lower() else (
                        3 if "llama-3.1" in m["model_id"].lower() else 4
                    )
                )
            ),
            m["model_id"]
        ))
        PROVIDER_MODELS_CACHE["groq"] = models

        return {
            "status": "success",
            "provider": "groq",
            "count": len(models),
            "models": models,
            "message": f"Successfully fetched {len(models)} models from Groq Cloud API."
        }

    @classmethod
    async def _fetch_openai_models(cls, api_key: str) -> Dict[str, Any]:
        url = "https://api.openai.com/v1/models"
        headers = {
            "Authorization": f"Bearer {api_key.strip()}",
            "Content-Type": "application/json"
        }
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            data = resp.json().get("data", [])

        # Filter relevant OpenAI LLMs and embeddings
        models = []
        for item in data:
            mid = item.get("id", "")
            # Filter for GPT, o1, o3, and embedding models
            is_relevant = any(p in mid for p in ["gpt-4", "gpt-3.5", "o1", "o3", "text-embedding", "babbage", "davinci"])
            if not is_relevant:
                continue

            if "text-embedding" in mid:
                m_type = "embedding"
                dim = 3072 if "3-large" in mid else 1536
                ctx = 8191
                desc = "OpenAI dense vector embeddings for semantic retrieval"
            else:
                m_type = "generation"
                dim = None
                ctx = 128000 if ("gpt-4o" in mid or "o1" in mid) else 16384
                desc = "OpenAI generative instruction model"

            entry = {
                "provider": "openai",
                "model_id": mid,
                "name": f"OpenAI {mid}",
                "type": m_type,
                "context_window": ctx,
                "description": desc,
                "is_available": True,
                "availability_reason": "Live OpenAI API Key Verified"
            }
            if dim:
                entry["dimension"] = dim
            models.append(entry)

        # Sort so flagship models appear first
        models.sort(key=lambda m: (0 if "gpt-4o" in m["model_id"] else (1 if "o1" in m["model_id"] else 2), m["model_id"]))
        PROVIDER_MODELS_CACHE["openai"] = models

        return {
            "status": "success",
            "provider": "openai",
            "count": len(models),
            "models": models,
            "message": f"Successfully fetched {len(models)} models from OpenAI API."
        }

    @classmethod
    async def _fetch_google_models(cls, api_key: str) -> Dict[str, Any]:
        url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key.strip()}"
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json().get("models", [])

        models = []
        for item in data:
            raw_name = item.get("name", "")
            mid = raw_name.replace("models/", "")
            disp = item.get("displayName", mid)
            desc = item.get("description", "Google Gemini foundational AI model")
            methods = item.get("supportedGenerationMethods", [])
            in_tokens = item.get("inputTokenLimit", 1000000)

            if "embedContent" in methods:
                m_type = "embedding"
                models.append({
                    "provider": "google",
                    "model_id": mid,
                    "name": f"Google {disp}",
                    "type": m_type,
                    "dimension": 768,
                    "context_window": in_tokens,
                    "description": desc,
                    "is_available": True,
                    "availability_reason": "Live Google Gemini API Key Verified"
                })
            elif "generateContent" in methods:
                models.append({
                    "provider": "google",
                    "model_id": mid,
                    "name": f"Google {disp}",
                    "type": "generation",
                    "context_window": in_tokens,
                    "description": desc,
                    "is_available": True,
                    "availability_reason": "Live Google Gemini API Key Verified"
                })

        PROVIDER_MODELS_CACHE["google"] = models
        PROVIDER_MODELS_CACHE["gemini"] = models
        return {
            "status": "success",
            "provider": "google",
            "count": len(models),
            "models": models,
            "message": f"Successfully fetched {len(models)} models from Google Gemini API."
        }

    @classmethod
    async def _fetch_huggingface_models(cls, api_key: str) -> Dict[str, Any]:
        # Validate token against whoami
        headers = {"Authorization": f"Bearer {api_key.strip()}"}
        async with httpx.AsyncClient(timeout=12.0) as client:
            who_resp = await client.get("https://huggingface.co/api/whoami-v2", headers=headers)
            who_resp.raise_for_status()
            user_data = who_resp.json()
            user_name = user_data.get("name", "Hugging Face User")

            # Also fetch top recommended models from hub
            gen_resp = await client.get(
                "https://huggingface.co/api/models?pipeline_tag=text-generation&sort=downloads&direction=-1&limit=12",
                headers=headers
            )
            hub_models = gen_resp.json() if gen_resp.status_code == 200 else []

        models = list(DEFAULT_PROVIDER_MODELS["huggingface"])
        existing_ids = {m["model_id"] for m in models}

        for hm in hub_models:
            mid = hm.get("id", "")
            if mid and mid not in existing_ids:
                models.append({
                    "provider": "huggingface",
                    "model_id": mid,
                    "name": f"Hugging Face {mid}",
                    "type": "generation",
                    "context_window": 32768,
                    "description": f"Trending open-weights model on Hugging Face Hub (downloads: {hm.get('downloads', 0):,})",
                    "is_available": True,
                    "availability_reason": f"Authenticated via Hugging Face (@{user_name})"
                })

        PROVIDER_MODELS_CACHE["huggingface"] = models
        return {
            "status": "success",
            "provider": "huggingface",
            "count": len(models),
            "models": models,
            "message": f"Verified Hugging Face token for @{user_name}. Loaded {len(models)} open-source models."
        }

    @classmethod
    async def _fetch_anthropic_models(cls, api_key: str) -> Dict[str, Any]:
        url = "https://api.anthropic.com/v1/models"
        headers = {
            "x-api-key": api_key.strip(),
            "anthropic-version": "2023-06-01"
        }
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            data = resp.json().get("data", [])

        models = []
        for item in data:
            mid = item.get("id", "")
            models.append({
                "provider": "anthropic",
                "model_id": mid,
                "name": item.get("display_name", f"Anthropic {mid}"),
                "type": "generation",
                "context_window": 200000,
                "description": "Anthropic Claude model for complex reasoning and coding",
                "is_available": True,
                "availability_reason": "Live Anthropic API Key Verified"
            })

        if not models:
            models = DEFAULT_PROVIDER_MODELS.get("anthropic", [])

        PROVIDER_MODELS_CACHE["anthropic"] = models
        return {
            "status": "success",
            "provider": "anthropic",
            "count": len(models),
            "models": models,
            "message": f"Successfully fetched {len(models)} models from Anthropic API."
        }

    @classmethod
    async def _fetch_cohere_models(cls, api_key: str) -> Dict[str, Any]:
        url = "https://api.cohere.com/v1/models"
        headers = {"Authorization": f"Bearer {api_key.strip()}"}
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            data = resp.json().get("models", [])

        models = []
        for item in data:
            mid = item.get("name", "")
            endpoints = item.get("endpoints", [])
            m_type = "embedding" if "embed" in endpoints else "generation"
            ctx = item.get("context_length", 128000)

            entry = {
                "provider": "cohere",
                "model_id": mid,
                "name": f"Cohere {mid}",
                "type": m_type,
                "context_window": ctx,
                "description": f"Cohere enterprise model (endpoints: {', '.join(endpoints)})",
                "is_available": True,
                "availability_reason": "Live Cohere API Key Verified"
            }
            if m_type == "embedding":
                entry["dimension"] = 1024
            models.append(entry)

        if not models:
            models = DEFAULT_PROVIDER_MODELS.get("cohere", [])

        PROVIDER_MODELS_CACHE["cohere"] = models
        return {
            "status": "success",
            "provider": "cohere",
            "count": len(models),
            "models": models,
            "message": f"Successfully fetched {len(models)} models from Cohere API."
        }

    @classmethod
    async def _fetch_ollama_models(cls, base_url: str) -> Dict[str, Any]:
        clean_url = (base_url or "http://localhost:11434").rstrip("/")
        url = f"{clean_url}/api/tags"
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json().get("models", [])

        models = []
        for item in data:
            name = item.get("name", "")
            is_embed = "embed" in name.lower() or "bge" in name.lower()
            models.append({
                "provider": "ollama",
                "model_id": name,
                "name": f"Ollama {name}",
                "type": "embedding" if is_embed else "generation",
                "context_window": 128000,
                "description": f"Locally hosted model via Ollama ({round(item.get('size', 0) / (1024**3), 1)} GB)",
                "is_available": True,
                "availability_reason": "Ollama Local Daemon Connected"
            })

        PROVIDER_MODELS_CACHE["ollama"] = models
        return {
            "status": "success",
            "provider": "ollama",
            "count": len(models),
            "models": models,
            "message": f"Connected to Ollama daemon. Found {len(models)} locally installed models."
        }

    @classmethod
    def get_all_cached_models(cls) -> List[Dict[str, Any]]:
        """Returns all dynamically fetched models currently in cache."""
        all_models = []
        for provider, m_list in PROVIDER_MODELS_CACHE.items():
            all_models.extend(m_list)
        return all_models

    @classmethod
    def get_cached_for_provider(cls, provider: str) -> List[Dict[str, Any]]:
        p = cls.normalize_provider_name(provider)
        return PROVIDER_MODELS_CACHE.get(p, [])
