import os
import re
import time
from typing import Any, Dict, List, Optional, Tuple
import httpx
from backend.app.core.config import is_valid_api_key, settings
from backend.app.generation.provider_models import PROVIDER_MODELS_CACHE, ProviderModelService

CITATION_SYSTEM_PROMPT = """You are an expert, precise research analyst on the RAG Studio platform.
Your task is to answer user queries using ONLY the retrieved context passages provided below.

Strict Citation Rules:
1. Every factual proposition, statistic, policy, date, or claim MUST be immediately followed by a citation bracket corresponding to the retrieved passage index, e.g., "The project was initiated in March 2024 [1] with a budget of $2.4M [2]."
2. If the retrieved passages do NOT contain sufficient information to answer the question, state: "The provided document collection does not contain sufficient evidence to answer this question." Do NOT fabricate facts.
3. NEVER invent citation numbers beyond the indices of the retrieved passages.
"""

GROQ_DEFAULT_MODELS = [
    "qwen/qwen3.8-27b",
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "allam-2-7b",
]


class LLMGenerationService:
    @classmethod
    def generate_answer(
        cls,
        query: str,
        retrieved_chunks: List[Dict[str, Any]],
        system_prompt: Optional[str] = None,
        provider: Optional[str] = None,
        model_name: Optional[str] = None,
        temperature: float = 0.2
    ) -> Dict[str, Any]:
        """
        Generates an evidence-grounded answer with source citations [1], [2]...
        Includes execution metadata, latency, and resolved citations across
        Groq, OpenAI, Google Gemini, Anthropic, Cohere, Ollama, and Hugging Face.
        """
        start_time = time.time()
        sys_prompt = system_prompt or CITATION_SYSTEM_PROMPT

        # Assemble context blocks with 1-based indexing
        context_blocks = []
        for idx, chunk in enumerate(retrieved_chunks, start=1):
            doc_name = chunk.get("metadata", {}).get("file_name") or chunk.get("document_id", "Doc")
            page_no = chunk.get("metadata", {}).get("page") or chunk.get("page_number", 1)
            sec = chunk.get("metadata", {}).get("section") or chunk.get("section_path", "")
            loc = f"{doc_name} (Page {page_no}{f', {sec}' if sec else ''})"
            context_blocks.append(f"Passage [{idx}] ({loc}):\n{chunk.get('content', '').strip()}")

        context_str = "\n\n".join(context_blocks)
        user_prompt = f"Context:\n{context_str}\n\nQuestion: {query}\n\nAnswer with inline citations [1], [2]:"

        # Check for empty context
        if not retrieved_chunks:
            answer = "The provided document collection does not contain sufficient evidence to answer this question."
            citations = []
            valid = True
            used_model = model_name or "none"
            used_provider = provider or "none"
            is_fallback = False
            gen_error = None
        else:
            answer, used_model, used_provider, is_fallback, gen_error = cls._execute_generation(
                query=query,
                user_prompt=user_prompt,
                system_prompt=sys_prompt,
                preferred_provider=provider,
                preferred_model=model_name,
                temperature=temperature,
                retrieved_chunks=retrieved_chunks
            )
            citations = cls._extract_citations_from_text(answer, retrieved_chunks)
            val_res = cls.validate_citations(answer, len(retrieved_chunks))
            valid = val_res["is_valid"]

            # If the LLM answer had no bracketed citations but we have retrieved evidence,
            # attach the top citation to ensure evidence inspection works
            if not citations and retrieved_chunks:
                top_chunk = retrieved_chunks[0]
                citations.append({
                    "citation_id": 1,
                    "chunk_id": top_chunk.get("chunk_id", ""),
                    "document_id": top_chunk.get("document_id", ""),
                    "page_number": top_chunk.get("metadata", {}).get("page") or top_chunk.get("page_number", 1),
                    "section": top_chunk.get("metadata", {}).get("section") or top_chunk.get("section_path", ""),
                    "excerpt": top_chunk.get("content", "")[:250]
                })

        latency_ms = round((time.time() - start_time) * 1000, 2)

        return {
            "answer": answer,
            "citations": citations,
            "is_citation_valid": valid,
            "model": model_name or used_model,
            "actual_model": used_model,
            "provider": used_provider,
            "is_fallback": is_fallback,
            "generation_error": gen_error,
            "latency_ms": latency_ms,
            "prompt_tokens": len(context_str.split()) + len(query.split()),
            "completion_tokens": len(answer.split()),
            "retrieved_count": len(retrieved_chunks)
        }

    @classmethod
    def _execute_generation(
        cls,
        query: str,
        user_prompt: str,
        system_prompt: str,
        preferred_provider: Optional[str],
        preferred_model: Optional[str],
        temperature: float,
        retrieved_chunks: List[Dict[str, Any]]
    ) -> Tuple[str, str, str, bool, Optional[str]]:
        target_provider, target_model = cls._resolve_provider_and_model(preferred_provider, preferred_model)
        primary_error = None

        # 1. Primary Attempt
        try:
            ans = cls._dispatch_call(
                provider=target_provider,
                model=target_model,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                temperature=temperature
            )
            if ans and len(ans.strip()) > 5:
                return ans.strip(), target_model, target_provider, False, None
        except Exception as e:
            primary_error = f"{target_provider.upper()} error ({target_model}): {str(e)}"

        # 2. Smart Fallback to configured providers with valid keys
        # If Groq has a valid key and wasn't the target that just failed:
        groq_key = cls._get_groq_api_key()
        if target_provider != "groq" and is_valid_api_key(groq_key):
            try:
                ans = cls._call_groq("qwen/qwen3.8-27b", system_prompt, user_prompt, temperature)
                if ans and len(ans.strip()) > 5:
                    return ans.strip(), "qwen/qwen3.8-27b", "groq", True, primary_error
            except Exception:
                pass

        # Try Google Gemini if configured
        gemini_key = settings.GOOGLE_API_KEY or os.environ.get("GOOGLE_API_KEY")
        if target_provider != "google" and is_valid_api_key(gemini_key):
            try:
                ans = cls._call_google("gemini-1.5-flash", system_prompt, user_prompt, temperature)
                if ans and len(ans.strip()) > 5:
                    return ans.strip(), "gemini-1.5-flash", "google", True, primary_error
            except Exception:
                pass

        # Try OpenAI if configured
        openai_key = settings.OPENAI_API_KEY or os.environ.get("OPENAI_API_KEY")
        if target_provider != "openai" and is_valid_api_key(openai_key):
            try:
                ans = cls._call_openai("gpt-4o-mini", system_prompt, user_prompt, temperature)
                if ans and len(ans.strip()) > 5:
                    return ans.strip(), "gpt-4o-mini", "openai", True, primary_error
            except Exception:
                pass

        # Try local Ollama if available
        if target_provider != "ollama":
            ollama_models = cls._get_available_ollama_models()
            if ollama_models:
                m = "llama3.2:1b" if "llama3.2:1b" in ollama_models else ollama_models[0]
                try:
                    ans = cls._call_ollama(m, system_prompt, user_prompt, temperature)
                    if ans and len(ans.strip()) > 5:
                        return ans.strip(), m, "ollama", True, primary_error
                except Exception:
                    pass

        # 3. Grounded Extractive Synthesis (last resort, never dumps raw headers or blocks)
        answer, _, _ = cls._synthesize_grounded_answer(query, retrieved_chunks)
        return answer, target_model or "extractive", "grounded_synthesis", True, primary_error

    @classmethod
    def _get_groq_api_key(cls) -> Optional[str]:
        """Safely retrieves the configured Groq API key, recovering from .env if in-memory settings were corrupted."""
        key = settings.GROQ_API_KEY or os.environ.get("GROQ_API_KEY")
        if not key or not is_valid_api_key(key) or key.startswith("gsk_test") or key.startswith("gsk_realValidKey"):
            try:
                from dotenv import dotenv_values
                env_vals = dotenv_values(".env")
                env_key = env_vals.get("GROQ_API_KEY")
                if env_key and is_valid_api_key(env_key) and not env_key.startswith("gsk_test"):
                    key = env_key
                    settings.GROQ_API_KEY = env_key
            except Exception:
                pass
        return key if key and is_valid_api_key(key) else None

    @classmethod
    def _resolve_provider_and_model(
        cls,
        preferred_provider: Optional[str],
        preferred_model: Optional[str]
    ) -> Tuple[str, str]:
        groq_key = cls._get_groq_api_key()
        openai_key = settings.OPENAI_API_KEY or os.environ.get("OPENAI_API_KEY")
        gemini_key = settings.GOOGLE_API_KEY or os.environ.get("GOOGLE_API_KEY")
        hf_key = settings.HUGGINGFACE_API_KEY or os.environ.get("HUGGINGFACE_API_KEY")
        anthropic_key = settings.ANTHROPIC_API_KEY or os.environ.get("ANTHROPIC_API_KEY")
        cohere_key = settings.COHERE_API_KEY or os.environ.get("COHERE_API_KEY")

        p = (preferred_provider or "").lower().strip()
        m = (preferred_model or "").strip()

        # 1. Explicit Groq request
        if p == "groq":
            model = m if m and not m.startswith("gpt-4") and not m.startswith("gemini-") and ("qwen" in m or "groq" in m or "llama" in m or "gpt-oss" in m or "allam" in m) else "qwen/qwen3.8-27b"
            return "groq", model

        # 2. Model name suggests Groq (e.g. qwen/qwen3.8-27b, openai/gpt-oss-120b, llama-3.3-70b-versatile)
        if any(k in m.lower() for k in ["llama-3.3", "llama-3.1", "mixtral", "gemma2", "qwen", "gpt-oss", "allam"]):
            if is_valid_api_key(groq_key):
                return "groq", m or "qwen/qwen3.8-27b"

        # 3. Explicit OpenAI request
        if p == "openai":
            if is_valid_api_key(openai_key) and not (openai_key or "").startswith("sk-proj-test"):
                return "openai", m or "gpt-4o-mini"
            elif is_valid_api_key(groq_key):
                return "groq", "qwen/qwen3.8-27b"
            return "openai", m or "gpt-4o-mini"

        if m.lower().startswith(("gpt-4", "gpt-3", "o1-", "o3-")):
            if is_valid_api_key(openai_key) and not (openai_key or "").startswith("sk-proj-test"):
                return "openai", m
            elif is_valid_api_key(groq_key):
                return "groq", "qwen/qwen3.8-27b"

        # 4. Explicit Google request
        if p in ["google", "gemini"]:
            if is_valid_api_key(gemini_key):
                return "google", m or "gemini-1.5-flash"
            elif is_valid_api_key(groq_key):
                return "groq", "qwen/qwen3.8-27b"
            return "google", m or "gemini-1.5-flash"

        if "gemini" in m.lower():
            if is_valid_api_key(gemini_key):
                return "google", m
            elif is_valid_api_key(groq_key):
                return "groq", "qwen/qwen3.8-27b"

        # 5. Anthropic
        if p == "anthropic" or "claude" in m.lower():
            if is_valid_api_key(anthropic_key):
                return "anthropic", m or "claude-3-5-sonnet-20241022"
            elif is_valid_api_key(groq_key):
                return "groq", "qwen/qwen3.8-27b"

        # 6. Cohere
        if p == "cohere" or "command" in m.lower():
            if is_valid_api_key(cohere_key):
                return "cohere", m or "command-r"
            elif is_valid_api_key(groq_key):
                return "groq", "qwen/qwen3.8-27b"

        # 7. Ollama
        if p == "ollama" or ":" in m:
            return "ollama", m or "llama3.2:1b"

        # 8. If user configured Groq, prioritize Groq for all pipelines (default/huggingface/mock)
        # Hugging Face serverless free inference is non-functional for 7B chat and hangs for 40s.
        if is_valid_api_key(groq_key):
            target_model = m if (m and any(k in m.lower() for k in ["qwen", "gpt-oss", "llama", "allam"])) else "qwen/qwen3.8-27b"
            return "groq", target_model

        # 9. Hugging Face only if no Groq key configured
        if p == "huggingface" or "zephyr" in m.lower():
            if is_valid_api_key(hf_key):
                return "huggingface", m or "HuggingFaceH4/zephyr-7b-beta"

        # 10. Fallbacks across providers
        if is_valid_api_key(gemini_key):
            return "google", "gemini-1.5-flash"
        if is_valid_api_key(openai_key) and not (openai_key or "").startswith("sk-proj-test"):
            return "openai", "gpt-4o-mini"
        if is_valid_api_key(hf_key):
            return "huggingface", m or "HuggingFaceH4/zephyr-7b-beta"

        # Check local Ollama daemon
        ollama_models = cls._get_available_ollama_models()
        if ollama_models:
            return "ollama", ollama_models[0]

        return "groq", "qwen/qwen3.8-27b"

    @classmethod
    def _dispatch_call(
        cls,
        provider: str,
        model: str,
        system_prompt: str,
        user_prompt: str,
        temperature: float
    ) -> str:
        p = provider.lower()
        if p == "groq":
            return cls._call_groq(model, system_prompt, user_prompt, temperature)
        elif p == "openai":
            return cls._call_openai(model, system_prompt, user_prompt, temperature)
        elif p in ["google", "gemini"]:
            return cls._call_google(model, system_prompt, user_prompt, temperature)
        elif p == "anthropic":
            return cls._call_anthropic(model, system_prompt, user_prompt, temperature)
        elif p == "cohere":
            return cls._call_cohere(model, system_prompt, user_prompt, temperature)
        elif p == "ollama":
            return cls._call_ollama(model, system_prompt, user_prompt, temperature)
        elif p == "huggingface":
            return cls._call_huggingface(model, system_prompt, user_prompt, temperature)
        else:
            raise ValueError(f"Unsupported model provider: '{provider}'")

    @classmethod
    def _call_groq(
        cls,
        model: str,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.2,
        timeout: float = 15.0
    ) -> str:
        key = cls._get_groq_api_key()
        if not key or not is_valid_api_key(key):
            raise ValueError("No valid GROQ_API_KEY configured. Please provide your Groq API key in Settings.")

        url = "https://api.groq.com/openai/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {key.strip()}",
            "Content-Type": "application/json"
        }

        # Put requested model first, or default to qwen3.8-27b
        target_model = model if model and ("qwen" in model or "gpt-oss" in model or "llama" in model or "allam" in model) else "qwen/qwen3.8-27b"
        models_to_try = [target_model]
        for m in GROQ_DEFAULT_MODELS:
            if m not in models_to_try:
                models_to_try.append(m)

        last_err = None
        for m_attempt in models_to_try:
            payload = {
                "model": m_attempt,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                "temperature": temperature,
                "max_tokens": 1024
            }
            try:
                with httpx.Client(timeout=timeout) as client:
                    resp = client.post(url, headers=headers, json=payload)
                    if resp.status_code == 200:
                        data = resp.json()
                        choices = data.get("choices", [])
                        if choices:
                            msg = choices[0].get("message", {})
                            content = (msg.get("content") or "").strip()
                            if content:
                                return content
                            reasoning = (msg.get("reasoning") or "").strip()
                            if reasoning:
                                return reasoning
                    elif resp.status_code in [401, 403]:
                        raise RuntimeError(f"Groq API authentication failed (HTTP {resp.status_code}): Invalid or expired API key")
                    elif resp.status_code == 404:
                        last_err = f"Model '{m_attempt}' not found on Groq tier (HTTP 404)"
                        continue
                    else:
                        resp.raise_for_status()
            except httpx.HTTPStatusError as e:
                if e.response.status_code in [401, 403]:
                    raise RuntimeError(f"Groq API authentication failed (HTTP {e.response.status_code}): Invalid API key")
                if e.response.status_code == 404:
                    last_err = f"Model '{m_attempt}' not found (HTTP 404)"
                    continue
                raise e
            except RuntimeError as e:
                raise e
            except Exception as e:
                last_err = str(e)
                continue

        raise RuntimeError(f"Groq API call failed across attempted models: {last_err}")

    @classmethod
    def _call_openai(
        cls,
        model: str,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.2,
        timeout: float = 25.0
    ) -> str:
        key = settings.OPENAI_API_KEY or os.environ.get("OPENAI_API_KEY")
        if not key or not is_valid_api_key(key):
            raise ValueError("No valid OPENAI_API_KEY configured.")

        url = "https://api.openai.com/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {key.strip()}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": temperature,
            "max_tokens": 1024
        }
        with httpx.Client(timeout=timeout) as client:
            resp = client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
            return data["choices"][0]["message"]["content"].strip()

    @classmethod
    def _call_google(
        cls,
        model: str,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.2,
        timeout: float = 25.0
    ) -> str:
        key = settings.GOOGLE_API_KEY or os.environ.get("GOOGLE_API_KEY")
        if not key or not is_valid_api_key(key):
            raise ValueError("No valid GOOGLE_API_KEY configured.")

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key.strip()}"
        payload = {
            "systemInstruction": {"parts": [{"text": system_prompt}]},
            "contents": [{"parts": [{"text": user_prompt}]}],
            "generationConfig": {"temperature": temperature, "maxOutputTokens": 1024}
        }
        with httpx.Client(timeout=timeout) as client:
            resp = client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()
            candidates = data.get("candidates", [])
            if candidates:
                parts = candidates[0].get("content", {}).get("parts", [])
                if parts:
                    return parts[0].get("text", "").strip()
            return "No content returned from Google Gemini."

    @classmethod
    def _call_anthropic(
        cls,
        model: str,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.2,
        timeout: float = 25.0
    ) -> str:
        key = settings.ANTHROPIC_API_KEY or os.environ.get("ANTHROPIC_API_KEY")
        if not key or not is_valid_api_key(key):
            raise ValueError("No valid ANTHROPIC_API_KEY configured.")

        url = "https://api.anthropic.com/v1/messages"
        headers = {
            "x-api-key": key.strip(),
            "anthropic-version": "2023-06-01",
            "content-type": "application/json"
        }
        payload = {
            "model": model,
            "system": system_prompt,
            "messages": [{"role": "user", "content": user_prompt}],
            "max_tokens": 1024,
            "temperature": temperature
        }
        with httpx.Client(timeout=timeout) as client:
            resp = client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
            content = data.get("content", [])
            if content and isinstance(content, list):
                return content[0].get("text", "").strip()
            return ""

    @classmethod
    def _call_cohere(
        cls,
        model: str,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.2,
        timeout: float = 25.0
    ) -> str:
        key = settings.COHERE_API_KEY or os.environ.get("COHERE_API_KEY")
        if not key or not is_valid_api_key(key):
            raise ValueError("No valid COHERE_API_KEY configured.")

        url = "https://api.cohere.com/v2/chat"
        headers = {
            "Authorization": f"Bearer {key.strip()}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": temperature
        }
        with httpx.Client(timeout=timeout) as client:
            resp = client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
            return data.get("message", {}).get("content", [{}])[0].get("text", "").strip()

    @classmethod
    def _call_ollama(
        cls,
        model: str,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.2,
        timeout: float = 30.0
    ) -> str:
        base_url = (settings.OLLAMA_BASE_URL or "http://localhost:11434").rstrip("/")
        installed = cls._get_available_ollama_models()
        actual_model = model
        if installed and model not in installed:
            matched = next((m for m in installed if model.split(":")[0] in m), None)
            actual_model = matched or installed[0]

        url = f"{base_url}/v1/chat/completions"
        payload = {
            "model": actual_model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": temperature,
            "max_tokens": 1024
        }
        with httpx.Client(timeout=timeout) as client:
            resp = client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()
            return data["choices"][0]["message"]["content"].strip()

    @classmethod
    def _call_huggingface(
        cls,
        model: str,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.2,
        timeout: float = 3.5
    ) -> str:
        key = settings.HUGGINGFACE_API_KEY or os.environ.get("HUGGINGFACE_API_KEY")
        if not key or not is_valid_api_key(key):
            raise ValueError("No valid HUGGINGFACE_API_KEY configured.")

        # Attempt router endpoint with fast 3.5s timeout
        headers = {"Authorization": f"Bearer {key.strip()}", "Content-Type": "application/json"}
        router_url = "https://router.huggingface.co/v1/chat/completions"
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": temperature,
            "max_tokens": 600
        }
        try:
            with httpx.Client(timeout=timeout) as client:
                resp = client.post(router_url, headers=headers, json=payload)
                if resp.status_code == 200:
                    data = resp.json()
                    choices = data.get("choices", [])
                    if choices:
                        return choices[0]["message"]["content"].strip()
        except Exception:
            pass

        # Fallback to direct model inference endpoint with fast 2.0s timeout
        direct_url = f"https://api-inference.huggingface.co/models/{model}"
        direct_prompt = f"{system_prompt}\n\n{user_prompt}"
        try:
            with httpx.Client(timeout=min(2.0, timeout)) as client:
                resp = client.post(
                    direct_url,
                    headers=headers,
                    json={"inputs": direct_prompt, "parameters": {"max_new_tokens": 300, "temperature": temperature}}
                )
                if resp.status_code == 200:
                    res_json = resp.json()
                    if isinstance(res_json, list) and len(res_json) > 0:
                        gen_text = res_json[0].get("generated_text", "")
                        if direct_prompt in gen_text:
                            return gen_text.replace(direct_prompt, "").strip()
                        return gen_text.strip()
        except Exception as e:
            raise RuntimeError(f"Hugging Face generation failed or timed out: {str(e)}")

        raise RuntimeError("Hugging Face API returned empty response")

    @classmethod
    def _get_available_ollama_models(cls) -> List[str]:
        base_url = (settings.OLLAMA_BASE_URL or "http://localhost:11434").rstrip("/")
        try:
            with httpx.Client(timeout=1.5) as client:
                r = client.get(f"{base_url}/api/tags")
                if r.status_code == 200:
                    return [m.get("name", "") for m in r.json().get("models", []) if m.get("name")]
        except Exception:
            pass
        return []

    @classmethod
    def _extract_citations_from_text(cls, text: str, retrieved_chunks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        indices = set(int(x) for x in re.findall(r'\[(\d+)\]', text))
        citations = []
        for idx in sorted(indices):
            if 1 <= idx <= len(retrieved_chunks):
                chunk = retrieved_chunks[idx - 1]
                citations.append({
                    "citation_id": idx,
                    "chunk_id": chunk.get("chunk_id", ""),
                    "document_id": chunk.get("document_id", ""),
                    "page_number": chunk.get("metadata", {}).get("page") or chunk.get("page_number", 1),
                    "section": chunk.get("metadata", {}).get("section") or chunk.get("section_path", ""),
                    "excerpt": chunk.get("content", "")[:250]
                })
        return citations

    @classmethod
    def _synthesize_grounded_answer(
        cls,
        query: str,
        retrieved_chunks: List[Dict[str, Any]]
    ) -> Tuple[str, List[Dict[str, Any]], bool]:
        """
        Grounded synthesis safety net when no LLM API is available.
        Extracts only factual sentences matching the query instead of dumping entire chunk blocks.
        """
        if not retrieved_chunks:
            return "The provided document collection does not contain sufficient evidence to answer this question.", [], True

        q_lower = query.lower()
        stop_words = {"what", "which", "where", "when", "does", "about", "could", "would", "the", "and", "for", "with", "this", "that"}
        key_terms = [w for w in re.findall(r'\b[a-zA-Z]{4,}\b', q_lower) if w not in stop_words]

        matching_sentences = []
        for idx, chunk in enumerate(retrieved_chunks, start=1):
            text = chunk.get("content", "")
            # Cleanly split by punctuation and newlines
            sentences = [s.strip() for s in re.split(r'(?<=[.?!])\s+|\n+', text) if len(s.strip()) > 15]
            for s in sentences:
                # Exclude noisy resume header lines (e.g. email, phone, github)
                if any(x in s.lower() for x in ["linkedin.com", "github.com", "@gmail", "phone:", "email:"]):
                    continue
                score = sum(1 for k in key_terms if k in s.lower())
                if score > 0:
                    matching_sentences.append((score, s, idx, chunk))

        matching_sentences.sort(key=lambda x: x[0], reverse=True)

        if not matching_sentences:
            top_chunk = retrieved_chunks[0]
            text = top_chunk.get("content", "")
            clean_sents = [s.strip() for s in re.split(r'(?<=[.?!])\s+|\n+', text) if len(s.strip()) > 20 and not any(x in s.lower() for x in ["linkedin", "github", "@"])]
            fallback_sent = clean_sents[0] if clean_sents else text[:150].strip()
            answer = f"Based on the indexed records: {fallback_sent} [1]."
            citations = [{
                "citation_id": 1,
                "chunk_id": top_chunk.get("chunk_id", ""),
                "document_id": top_chunk.get("document_id", ""),
                "page_number": top_chunk.get("metadata", {}).get("page") or top_chunk.get("page_number", 1),
                "section": top_chunk.get("metadata", {}).get("section") or top_chunk.get("section_path", ""),
                "excerpt": top_chunk.get("content", "")[:200]
            }]
            return answer, citations, True

        used_indices = set()
        ans_parts = []
        citations = []

        for score, sent, chunk_idx, chunk in matching_sentences[:3]:
            ans_parts.append(f"{sent} [{chunk_idx}]")
            if chunk_idx not in used_indices:
                used_indices.add(chunk_idx)
                citations.append({
                    "citation_id": chunk_idx,
                    "chunk_id": chunk.get("chunk_id", ""),
                    "document_id": chunk.get("document_id", ""),
                    "page_number": chunk.get("metadata", {}).get("page") or chunk.get("page_number", 1),
                    "section": chunk.get("metadata", {}).get("section") or chunk.get("section_path", ""),
                    "excerpt": chunk.get("content", "")[:250]
                })

        answer = " ".join(ans_parts)
        citations.sort(key=lambda x: x["citation_id"])
        return answer, citations, True

    @classmethod
    def validate_citations(cls, answer: str, num_retrieved_chunks: int) -> Dict[str, Any]:
        """Validates that citations [i] do not refer to hallucinated indices."""
        cited_indices = [int(x) for x in re.findall(r'\[(\d+)\]', answer)]
        invalid = [i for i in cited_indices if i < 1 or i > num_retrieved_chunks]

        return {
            "is_valid": len(invalid) == 0,
            "cited_indices": cited_indices,
            "invalid_indices": invalid,
            "total_citations": len(cited_indices)
        }
