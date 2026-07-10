import os
import logging
from langchain_groq import ChatGroq
from langchain_google_genai import ChatGoogleGenerativeAI
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

logger = logging.getLogger(__name__)

# Cache LLM instances to avoid creating new ones per request
_llm_cache = {}


def get_llm(temperature: float = 0.0):
    """
    Returns a configured LangChain LLM instance.
    Prioritizes Groq (Llama 3) and falls back to Gemini if GROQ_API_KEY is missing.
    Caches instances to avoid reloading models repeatedly.
    """
    cache_key = f"{temperature}"
    if cache_key in _llm_cache:
        return _llm_cache[cache_key]

    groq_api_key = os.getenv("GROQ_API_KEY", "")
    google_api_key = os.getenv("GOOGLE_API_KEY", "")

    llm = None
    if groq_api_key:
        model_name = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
        logger.info("Initializing Groq Chat Model (%s)", model_name)
        llm = ChatGroq(
            model=model_name,
            api_key=groq_api_key,
            temperature=temperature
        )
    elif google_api_key:
        model_name = os.getenv("GOOGLE_MODEL", "gemini-1.5-flash")
        logger.info("Initializing Google Gemini Chat Model (%s)", model_name)
        llm = ChatGoogleGenerativeAI(
            model=model_name,
            api_key=google_api_key,
            temperature=temperature
        )
    else:
        logger.error("No API keys found for either GROQ_API_KEY or GOOGLE_API_KEY.")
        raise ValueError("Missing LLM API keys. Please configure GROQ_API_KEY or GOOGLE_API_KEY in your .env file.")

    _llm_cache[cache_key] = llm
    return llm
