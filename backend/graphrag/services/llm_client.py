import os
import logging
from langchain_openai import ChatOpenAI
from langchain_groq import ChatGroq
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.runnables import Runnable

logger = logging.getLogger(__name__)

# Cache LLM instances to avoid creating new ones per request
_llm_cache = {}



class FallbackLLMWrapper(Runnable):
    """
    A wrapper around multiple LangChain ChatModels to provide dynamic
    fallback when invoking models. Particularly useful for handling
    API rate limits (e.g., HTTP 429) and transient errors.
    """
    def __init__(self, primary: Runnable, fallbacks: list):
        self.primary = primary
        self.fallbacks = fallbacks

    def invoke(self, input, config=None, **kwargs):
        last_exception = None
        
        # Try primary model
        try:
            primary_name = getattr(self.primary, "model", getattr(self.primary, "model_name", "Unknown"))
            logger.info("Attempting primary LLM invocation (%s)...", primary_name)
            return self.primary.invoke(input, config, **kwargs)
        except Exception as e:
            logger.error("Primary LLM invocation failed: %s. Trying fallbacks...", str(e))
            last_exception = e

        # Try fallback models in order
        for i, fallback_llm in enumerate(self.fallbacks, 1):
            try:
                fb_name = getattr(fallback_llm, "model", getattr(fallback_llm, "model_name", "Unknown"))
                logger.info("Attempting fallback LLM invocation #%d (%s)...", i, fb_name)
                return fallback_llm.invoke(input, config, **kwargs)
            except Exception as e:
                logger.error("Fallback LLM invocation #%d failed: %s", i, str(e))
                last_exception = e

        raise last_exception

    def with_structured_output(self, schema, **kwargs):
        """
        Applies structure requirements to both primary and fallback models.
        """
        structured_primary = self.primary.with_structured_output(schema, **kwargs)
        structured_fallbacks = [
            fb.with_structured_output(schema, **kwargs) for fb in self.fallbacks
        ]
        return FallbackLLMWrapper(structured_primary, structured_fallbacks)


def get_llm(temperature: float = 0.0):
    """
    Returns a configured LangChain LLM instance (wrapped in FallbackLLMWrapper if multiple providers are configured).
    Prioritizes OpenAI, falling back to Groq, then Gemini if errors occur or keys are missing.
    Caches instances to avoid reloading models repeatedly.
    """
    cache_key = f"{temperature}"
    if cache_key in _llm_cache:
        return _llm_cache[cache_key]

    openai_api_key = os.getenv("OPENAI_API_KEY", "")
    groq_api_key = os.getenv("GROQ_API_KEY", "")
    google_api_key = os.getenv("GOOGLE_API_KEY", "")
    nvidia_api_key = os.getenv("NVIDIA_API_KEY", "")

    available_models = []

    # 1. Groq (Primary option)
    if groq_api_key:
        try:
            model_name = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
            logger.info("Initializing Groq Chat Model (%s) for fallback list", model_name)
            available_models.append(ChatGroq(
                model=model_name,
                api_key=groq_api_key,
                temperature=temperature
            ))
        except Exception as e:
            logger.error("Failed to initialize Groq client: %s", str(e))

    # 2. OpenAI (Secondary option)
    if openai_api_key:
        try:
            model_name = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
            logger.info("Initializing OpenAI Chat Model (%s) for fallback list", model_name)
            available_models.append(ChatOpenAI(
                model=model_name,
                api_key=openai_api_key,
                temperature=temperature
            ))
        except Exception as e:
            logger.error("Failed to initialize OpenAI client: %s", str(e))

    # 3. NVIDIA (Tertiary option)
    if nvidia_api_key:
        try:
            model_name = os.getenv("NVIDIA_MODEL", "meta/llama-3.1-70b-instruct")
            logger.info("Initializing NVIDIA Chat Model (%s) for fallback list", model_name)
            available_models.append(ChatOpenAI(
                model=model_name,
                api_key=nvidia_api_key,
                base_url="https://integrate.api.nvidia.com/v1",
                temperature=temperature
            ))
        except Exception as e:
            logger.error("Failed to initialize NVIDIA client: %s", str(e))

    # 4. Google Gemini (Quaternary option)
    if google_api_key:
        try:
            model_name = os.getenv("GOOGLE_MODEL", "gemini-1.5-flash")
            logger.info("Initializing Google Gemini Chat Model (%s) for fallback list", model_name)
            available_models.append(ChatGoogleGenerativeAI(
                model=model_name,
                api_key=google_api_key,
                temperature=temperature
            ))
        except Exception as e:
            logger.error("Failed to initialize Google Gemini client: %s", str(e))

    if not available_models:
        logger.error("No API keys found or all LLM provider initializations failed.")
        raise ValueError(
            "Missing or invalid LLM API keys. Please configure OPENAI_API_KEY, GROQ_API_KEY, GOOGLE_API_KEY, or NVIDIA_API_KEY in your .env file."
        )

    # Wrap in FallbackLLMWrapper if more than one model is available
    if len(available_models) == 1:
        llm = available_models[0]
    else:
        llm = FallbackLLMWrapper(available_models[0], available_models[1:])

    _llm_cache[cache_key] = llm
    return llm

