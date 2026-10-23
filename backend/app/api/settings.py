import os
from typing import Dict, Any, Optional, List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from backend.app.core.config import settings, is_valid_api_key
from backend.app.generation.provider_models import ProviderModelService, PROVIDER_MODELS_CACHE

router = APIRouter(tags=["settings"])

class SettingsUpdateSchema(BaseModel):
    hf_key: Optional[str] = None
    openai_key: Optional[str] = None
    gemini_key: Optional[str] = None
    groq_key: Optional[str] = None
    anthropic_key: Optional[str] = None
    cohere_key: Optional[str] = None
    ollama_url: Optional[str] = None
    chroma_directory: Optional[str] = None

class FetchModelsRequest(BaseModel):
    provider: str
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    save_key: Optional[bool] = True

def mask_key(val: Optional[str]) -> str:
    if not is_valid_api_key(val):
        return ""
    val = str(val).strip()
    prefix = val[:4]
    suffix = val[-4:] if len(val) >= 12 else ""
    masked_len = max(8, len(val) - len(prefix) - len(suffix))
    return f"{prefix}{'•' * masked_len}{suffix}"

def update_env_file(key_map: Dict[str, str]):
    env_path = os.path.join(os.getcwd(), ".env")
    existing_lines = []
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            existing_lines = f.readlines()

    lines_dict = {}
    for line in existing_lines:
        s = line.strip()
        if s and not s.startswith("#") and "=" in s:
            k, v = s.split("=", 1)
            lines_dict[k.strip()] = v.strip()

    # Merge updates
    for k, v in key_map.items():
        if v is not None and v != "":
            # Only persist valid ASCII keys or path/url config to .env
            if is_valid_api_key(v) or k in ["OLLAMA_BASE_URL", "CHROMA_PERSIST_DIRECTORY"]:
                lines_dict[k] = v
        elif v == "":
            lines_dict.pop(k, None)

    # Write back
    with open(env_path, "w", encoding="utf-8") as f:
        for k, v in lines_dict.items():
            f.write(f"{k}={v}\n")

@router.get("/settings")
async def get_settings():
    hf_configured = is_valid_api_key(settings.HUGGINGFACE_API_KEY or os.environ.get("HUGGINGFACE_API_KEY"))
    openai_configured = is_valid_api_key(settings.OPENAI_API_KEY or os.environ.get("OPENAI_API_KEY"))
    gemini_configured = is_valid_api_key(settings.GOOGLE_API_KEY or os.environ.get("GOOGLE_API_KEY"))
    groq_configured = is_valid_api_key(settings.GROQ_API_KEY or os.environ.get("GROQ_API_KEY"))
    anthropic_configured = is_valid_api_key(settings.ANTHROPIC_API_KEY or os.environ.get("ANTHROPIC_API_KEY"))
    cohere_configured = is_valid_api_key(settings.COHERE_API_KEY or os.environ.get("COHERE_API_KEY"))

    providers_status = {
        "huggingface": {
            "is_set": hf_configured,
            "masked_key": mask_key(settings.HUGGINGFACE_API_KEY or os.environ.get("HUGGINGFACE_API_KEY")),
            "cached_models_count": len(ProviderModelService.get_cached_for_provider("huggingface"))
        },
        "openai": {
            "is_set": openai_configured,
            "masked_key": mask_key(settings.OPENAI_API_KEY or os.environ.get("OPENAI_API_KEY")),
            "cached_models_count": len(ProviderModelService.get_cached_for_provider("openai"))
        },
        "gemini": {
            "is_set": gemini_configured,
            "masked_key": mask_key(settings.GOOGLE_API_KEY or os.environ.get("GOOGLE_API_KEY")),
            "cached_models_count": len(ProviderModelService.get_cached_for_provider("google"))
        },
        "groq": {
            "is_set": groq_configured,
            "masked_key": mask_key(settings.GROQ_API_KEY or os.environ.get("GROQ_API_KEY")),
            "cached_models_count": len(ProviderModelService.get_cached_for_provider("groq"))
        },
        "anthropic": {
            "is_set": anthropic_configured,
            "masked_key": mask_key(settings.ANTHROPIC_API_KEY or os.environ.get("ANTHROPIC_API_KEY")),
            "cached_models_count": len(ProviderModelService.get_cached_for_provider("anthropic"))
        },
        "cohere": {
            "is_set": cohere_configured,
            "masked_key": mask_key(settings.COHERE_API_KEY or os.environ.get("COHERE_API_KEY")),
            "cached_models_count": len(ProviderModelService.get_cached_for_provider("cohere"))
        },
        "ollama": {
            "is_set": True,
            "url": settings.OLLAMA_BASE_URL,
            "cached_models_count": len(ProviderModelService.get_cached_for_provider("ollama"))
        }
    }

    cached_models_dict = dict(PROVIDER_MODELS_CACHE)
    if "google" in cached_models_dict and "gemini" not in cached_models_dict:
        cached_models_dict["gemini"] = cached_models_dict["google"]
    elif "gemini" in cached_models_dict and "google" not in cached_models_dict:
        cached_models_dict["google"] = cached_models_dict["gemini"]

    hosted_llm_ready = any([
        hf_configured, openai_configured, gemini_configured, groq_configured, anthropic_configured, cohere_configured
    ])
    active_demo_provider = "groq" if groq_configured else ("gemini" if gemini_configured else ("openai" if openai_configured else None))

    return {
        "providers": providers_status,
        "ollama_base_url": settings.OLLAMA_BASE_URL,
        "chroma_persist_directory": settings.CHROMA_PERSIST_DIRECTORY,
        "cached_models": cached_models_dict,
        "demo_mode": settings.DEMO_MODE,
        "hosted_llm_ready": hosted_llm_ready,
        "active_demo_provider": active_demo_provider,
        "demo_message": "Platform Demo Key active on server. Viewers can query pipelines immediately without supplying an API key."
    }

@router.post("/settings")
async def update_settings(payload: SettingsUpdateSchema):
    provider_fields = [
        ("hf_key", "HUGGINGFACE_API_KEY"),
        ("openai_key", "OPENAI_API_KEY"),
        ("gemini_key", "GOOGLE_API_KEY"),
        ("groq_key", "GROQ_API_KEY"),
        ("anthropic_key", "ANTHROPIC_API_KEY"),
        ("cohere_key", "COHERE_API_KEY"),
    ]

    if settings.DEMO_MODE:
        has_key_change = any(getattr(payload, attr, None) is not None for attr, _ in provider_fields)
        if has_key_change:
            raise HTTPException(
                status_code=403,
                detail="Platform is running in Hosted Demo Mode. Server-provided API keys are managed by the host and cannot be modified or cleared by viewers. You can test all RAG features directly!"
            )

    env_updates = {}

    for payload_attr, setting_attr in provider_fields:
        val = getattr(payload, payload_attr, None)
        if val is not None:
            s_val = val.strip()
            if s_val == "":
                # User intentionally cleared key
                setattr(settings, setting_attr, None)
                os.environ.pop(setting_attr, None)
                env_updates[setting_attr] = ""
            elif is_valid_api_key(s_val):
                # Valid new API key supplied
                setattr(settings, setting_attr, s_val)
                os.environ[setting_attr] = s_val
                env_updates[setting_attr] = s_val
            else:
                # Masked placeholder (contains bullets) or invalid key - do NOT overwrite
                pass

    if payload.ollama_url:
        settings.OLLAMA_BASE_URL = payload.ollama_url.strip()
        env_updates["OLLAMA_BASE_URL"] = payload.ollama_url.strip()

    if payload.chroma_directory:
        settings.CHROMA_PERSIST_DIRECTORY = payload.chroma_directory.strip()
        env_updates["CHROMA_PERSIST_DIRECTORY"] = payload.chroma_directory.strip()

    if env_updates:
        try:
            update_env_file(env_updates)
        except Exception:
            pass

    return {
        "status": "success",
        "message": "Settings and credentials successfully saved.",
        "settings": await get_settings()
    }

@router.post("/providers/fetch-models")
async def fetch_provider_models(payload: FetchModelsRequest):
    provider = payload.provider.lower().strip()
    raw_key = payload.api_key.strip() if payload.api_key else None

    # Ignore placeholder masked strings or invalid keys
    if raw_key and not is_valid_api_key(raw_key):
        raw_key = None

    # If save_key is True and a real key is provided, persist it immediately (unless in DEMO_MODE)
    if raw_key and payload.save_key and not settings.DEMO_MODE:
        p_norm = ProviderModelService.normalize_provider_name(provider)
        key_map = {
            "groq": "GROQ_API_KEY",
            "openai": "OPENAI_API_KEY",
            "google": "GOOGLE_API_KEY",
            "huggingface": "HUGGINGFACE_API_KEY",
            "anthropic": "ANTHROPIC_API_KEY",
            "cohere": "COHERE_API_KEY"
        }
        if p_norm in key_map:
            env_var = key_map[p_norm]
            setattr(settings, env_var, raw_key)
            os.environ[env_var] = raw_key
            update_env_file({env_var: raw_key})

    result = await ProviderModelService.fetch_models(
        provider=provider,
        api_key=raw_key,
        base_url=payload.base_url
    )
    return result

@router.get("/providers/{provider}/models")
async def get_provider_models(provider: str):
    p_norm = ProviderModelService.normalize_provider_name(provider)
    cached = ProviderModelService.get_cached_for_provider(p_norm)
    if cached:
        return {
            "status": "success",
            "provider": p_norm,
            "count": len(cached),
            "models": cached
        }

    # If key is set, attempt live fetch
    key = ProviderModelService.get_configured_key(p_norm)
    if key or p_norm == "ollama":
        res = await ProviderModelService.fetch_models(provider=p_norm, api_key=key)
        return res

    return {
        "status": "warning",
        "provider": p_norm,
        "count": 0,
        "models": [],
        "message": f"No API key configured for {p_norm.upper()}. Provide an API key to fetch available models."
    }
