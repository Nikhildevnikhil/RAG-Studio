import os
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from backend.app.main import app, lifespan
from backend.app.generation.provider_models import ProviderModelService, PROVIDER_MODELS_CACHE

@pytest.fixture(autouse=True)
def preserve_env_and_settings():
    from backend.app.core.config import settings
    env_path = os.path.join(os.getcwd(), ".env")
    env_backup = None
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            env_backup = f.read()

    orig_groq = settings.GROQ_API_KEY
    orig_hf = settings.HUGGINGFACE_API_KEY
    orig_openai = settings.OPENAI_API_KEY
    orig_gemini = settings.GOOGLE_API_KEY
    orig_anthropic = settings.ANTHROPIC_API_KEY
    orig_cohere = settings.COHERE_API_KEY

    yield

    settings.GROQ_API_KEY = orig_groq
    settings.HUGGINGFACE_API_KEY = orig_hf
    settings.OPENAI_API_KEY = orig_openai
    settings.GOOGLE_API_KEY = orig_gemini
    settings.ANTHROPIC_API_KEY = orig_anthropic
    settings.COHERE_API_KEY = orig_cohere

    if env_backup is not None:
        with open(env_path, "w", encoding="utf-8") as f:
            f.write(env_backup)

@pytest.mark.asyncio
async def test_settings_endpoints():
    from backend.app.core.config import settings
    orig_groq = settings.GROQ_API_KEY
    orig_openai = settings.OPENAI_API_KEY
    try:
        async with lifespan(app):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                # 1. Test get settings
                resp = await client.get("/api/v1/settings")
                assert resp.status_code == 200
                data = resp.json()
                assert "providers" in data
                assert "groq" in data["providers"]
                assert "openai" in data["providers"]
                assert "gemini" in data["providers"]
                assert "huggingface" in data["providers"]

                # 2. Test update settings with dummy key
                update_resp = await client.post("/api/v1/settings", json={
                    "groq_key": "gsk_test1234567890abcdef",
                    "openai_key": "sk-proj-test1234567890"
                })
                assert update_resp.status_code == 200
                up_data = update_resp.json()
                assert up_data["status"] == "success"
                assert up_data["settings"]["providers"]["groq"]["is_set"] is True
                assert "gsk_" in up_data["settings"]["providers"]["groq"]["masked_key"]

                # 3. Test fetch models endpoint without valid key (should return clean error)
                fetch_resp = await client.post("/api/v1/providers/fetch-models", json={
                    "provider": "groq",
                    "api_key": "invalid_groq_key_for_testing"
                })
                assert fetch_resp.status_code == 200
                f_data = fetch_resp.json()
                assert f_data["status"] == "error"
                assert "Authentication failed" in f_data["message"] or "failed" in f_data["message"].lower()
    finally:
        settings.GROQ_API_KEY = orig_groq
        settings.OPENAI_API_KEY = orig_openai

@pytest.mark.asyncio
async def test_dynamic_model_cache_and_pipeline_listing():
    async with lifespan(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Pre-populate cache to simulate verified models
            PROVIDER_MODELS_CACHE["groq"] = [
                {
                    "provider": "groq",
                    "model_id": "llama-3.3-70b-versatile",
                    "name": "Groq LLaMA 3.3 70B",
                    "type": "generation",
                    "context_window": 128000,
                    "description": "LPU accelerated",
                    "is_available": True,
                    "availability_reason": "API Key Verified"
                }
            ]

            gen_resp = await client.get("/api/v1/models/generation?available_only=true")
            assert gen_resp.status_code == 200
            models = gen_resp.json()
            model_ids = [m["model_id"] for m in models]
            assert "llama-3.3-70b-versatile" in model_ids

@pytest.mark.asyncio
async def test_masked_key_safety_and_unicode_handling():
    from backend.app.core.config import settings
    orig_groq = settings.GROQ_API_KEY
    orig_hf = settings.HUGGINGFACE_API_KEY
    orig_openai = settings.OPENAI_API_KEY
    try:
        async with lifespan(app):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                # 1. First set a valid groq key
                up1 = await client.post("/api/v1/settings", json={
                    "groq_key": "gsk_realValidKey123456789",
                    "hf_key": ""
                })
                assert up1.status_code == 200
                data1 = up1.json()
                assert data1["settings"]["providers"]["groq"]["is_set"] is True
                masked = data1["settings"]["providers"]["groq"]["masked_key"]
                assert "•" in masked

                # 2. Simulate SettingsScreen sending back the masked key with bullets
                up2 = await client.post("/api/v1/settings", json={
                    "groq_key": masked,
                    "hf_key": "hf_y••••••••••••••••••••HAEY"
                })
                assert up2.status_code == 200
                data2 = up2.json()
                # The real groq key must NOT have been overwritten by the masked bullets
                assert settings.GROQ_API_KEY == "gsk_realValidKey123456789"
                assert "•" not in (settings.GROQ_API_KEY or "")

                # Hugging Face key with bullets must NOT be accepted as configured
                assert data2["settings"]["providers"]["huggingface"]["is_set"] is False

                # 3. Test fetch-models with a masked key containing bullets
                # Should NOT crash with UnicodeEncodeError or ascii codec error
                fetch_resp = await client.post("/api/v1/providers/fetch-models", json={
                    "provider": "huggingface",
                    "api_key": "hf_y••••••••••••••••••••HAEY"
                })
                assert fetch_resp.status_code == 200
                f_data = fetch_resp.json()
                assert f_data["status"] == "error"
                assert "ascii" not in f_data["message"].lower()
                assert "No valid API key" in f_data["message"]
    finally:
        settings.GROQ_API_KEY = orig_groq
        settings.HUGGINGFACE_API_KEY = orig_hf
        settings.OPENAI_API_KEY = orig_openai
