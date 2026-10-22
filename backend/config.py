import os
from pathlib import Path
from pydantic_settings import BaseSettings

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)


class Settings(BaseSettings):
    BOT_TOKEN: str = ""
    GEMINI_API_KEY: str = ""
    GROQ_API_KEY: str = ""
    DEFAULT_AI_PROVIDER: str = "groq"
    DATABASE_URL: str = f"sqlite+aiosqlite:///{DATA_DIR}/taskerbot.db"
    WEBAPP_URL: str = ""  # If running behind https domain/tunnel, e.g. https://xyz.ngrok-free.app
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    DEBUG: bool = False

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()
