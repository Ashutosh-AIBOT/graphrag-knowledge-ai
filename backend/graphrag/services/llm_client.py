import os
import logging
from langchain_groq import ChatGroq
from langchain_google_genai import ChatGoogleGenerativeAI

logger = logging.getLogger(__name__)

def get_llm(temperature: float = 0.0):
    """
    Returns a configured LangChain LLM instance.
    Prioritizes Groq (Llama 3) and falls back to Gemini if GROQ_API_KEY is missing.
    """
    groq_api_key = os.getenv("GROQ_API_KEY", "")
    google_api_key = os.getenv("GOOGLE_API_KEY", "")

    if groq_api_key:
        model_name = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
        logger.info("Initializing Groq Chat Model (%s)", model_name)
        return ChatGroq(
            model=model_name,
            api_key=groq_api_key,
            temperature=temperature
        )
    elif google_api_key:
        model_name = os.getenv("GOOGLE_MODEL", "gemini-1.5-flash")
        logger.info("Initializing Google Gemini Chat Model (%s)", model_name)
        return ChatGoogleGenerativeAI(
            model=model_name,
            api_key=google_api_key,
            temperature=temperature
        )
    else:
        logger.error("No API keys found for either GROQ_API_KEY or GOOGLE_API_KEY.")
        raise ValueError("Missing LLM API keys. Please configure GROQ_API_KEY or GOOGLE_API_KEY in your .env file.")
