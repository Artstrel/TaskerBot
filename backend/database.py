from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from backend.config import settings

from sqlalchemy import text

engine_kwargs = {
    "echo": settings.DEBUG,
    "future": True,
}

if "postgresql" in settings.DATABASE_URL:
    engine_kwargs["connect_args"] = {
        "statement_cache_size": 0,  # Required for Supabase PgBouncer transaction pooler (port 6543)
    }
    engine_kwargs["pool_pre_ping"] = True

engine = create_async_engine(
    settings.DATABASE_URL,
    **engine_kwargs,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

        # Check and migrate columns across supported database dialects
        if conn.dialect.name == "sqlite":
            result = await conn.execute(text("PRAGMA table_info(users)"))
            columns = [row[1] for row in result.fetchall()]
            if columns and "ai_provider" not in columns:
                await conn.execute(
                    text("ALTER TABLE users ADD COLUMN ai_provider VARCHAR(32) DEFAULT 'groq'")
                )
        elif conn.dialect.name == "postgresql":
            await conn.execute(
                text("ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_provider VARCHAR(32) DEFAULT 'groq'")
            )

