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
    from backend import models  # ensure models are registered in Base.metadata
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

        # Check and migrate columns across supported database dialects
        migrations = [
            ("users", "ai_provider", "VARCHAR(32) DEFAULT 'groq'"),
            ("users", "morning_digest_time", "VARCHAR(5) DEFAULT '09:00'"),
            ("users", "evening_digest_enabled", "BOOLEAN DEFAULT TRUE"),
            ("users", "praise_notifications_enabled", "BOOLEAN DEFAULT TRUE"),
            ("users", "goal_cleanup_days", "INTEGER DEFAULT 3"),
            ("users", "theme_mode", "VARCHAR(16) DEFAULT 'auto'"),
            ("users", "theme_schedule_enabled", "BOOLEAN DEFAULT FALSE"),
            ("users", "theme_schedule_start", "VARCHAR(5) DEFAULT '07:00'"),
            ("users", "theme_schedule_end", "VARCHAR(5) DEFAULT '20:00'"),
            ("users", "photo_url", "VARCHAR(1024)"),
            ("routine_tasks", "target_value", "FLOAT"),
            ("routine_tasks", "step", "FLOAT DEFAULT 1.0"),
            ("routine_tasks", "unit", "VARCHAR(32)"),
            ("routine_tasks", "frequency_type", "VARCHAR(32) DEFAULT 'daily'"),
            ("routine_tasks", "interval_days", "INTEGER DEFAULT 1"),
            ("routine_tasks", "days_of_week", "VARCHAR(64)"),
            ("routine_tasks", "start_date", "DATE"),
            ("routine_logs", "current_value", "FLOAT DEFAULT 0.0"),
            ("one_time_tasks", "target_value", "FLOAT"),
            ("one_time_tasks", "current_value", "FLOAT DEFAULT 0.0"),
            ("one_time_tasks", "step", "FLOAT DEFAULT 1.0"),
            ("one_time_tasks", "unit", "VARCHAR(32)"),
        ]

        if conn.dialect.name == "sqlite":
            # Cache tables info
            for table, col, col_def in migrations:
                res = await conn.execute(text(f"PRAGMA table_info({table})"))
                existing_cols = [row[1] for row in res.fetchall()]
                if existing_cols and col not in existing_cols:
                    await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {col_def}"))
        elif conn.dialect.name == "postgresql":
            for table, col, col_def in migrations:
                await conn.execute(
                    text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {col} {col_def}")
                )

