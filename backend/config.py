import os
from pathlib import Path
from pydantic import field_validator
from pydantic_settings import BaseSettings

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)


class Settings(BaseSettings):
    BOT_TOKEN: str = ""
    GEMINI_API_KEY: str = ""
    GROQ_API_KEY: str = ""
    OPENROUTER_API_KEY: str = ""
    DEFAULT_AI_PROVIDER: str = "auto"
    WHISPER_CPP_URL: str = "http://127.0.0.1:8080"
    WHISPER_CPP_ENABLED: bool = True
    DATABASE_URL: str = f"sqlite+aiosqlite:///{DATA_DIR}/taskerbot.db"
    WEBAPP_URL: str = "https://taskerbot-plp5.onrender.com"  # Telegram WebApp HTTPS URL
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    DEBUG: bool = False

    @field_validator("WEBAPP_URL", mode="before")
    @classmethod
    def assemble_webapp_url(cls, v: str) -> str:
        if v and v.strip():
            return v.strip().rstrip("/")
        render_url = os.getenv("RENDER_EXTERNAL_URL", "").strip().rstrip("/")
        if render_url:
            return render_url
        return "https://taskerbot-plp5.onrender.com"

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def assemble_db_url(cls, v: str) -> str:
        if not v or not v.strip():
            return f"sqlite+aiosqlite:///{DATA_DIR}/taskerbot.db"
        v = v.strip()
        # Normalize PostgreSQL URI to asyncpg driver required by SQLAlchemy async
        if v.startswith("postgres://"):
            return "postgresql+asyncpg://" + v[len("postgres://") :]
        if v.startswith("postgresql://") and not v.startswith("postgresql+"):
            return "postgresql+asyncpg://" + v[len("postgresql://") :]
        return v

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()
