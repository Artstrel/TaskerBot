import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from backend.config import settings, BASE_DIR
from backend.database import init_db
from backend.scheduler import start_scheduler, scheduler
from backend.api.routes import router as api_router
from backend.bot.bot_instance import bot, dp
from backend.bot.handlers import router as bot_router
from aiogram.types import BotCommand, BotCommandScopeDefault, MenuButtonCommands

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

bot_polling_task = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global bot_polling_task
    logger.info("Initializing database...")
    await init_db()

    logger.info("Starting background scheduler...")
    start_scheduler()

    # Check if Telegram Bot Token is configured
    is_configured_token = bool(
        settings.BOT_TOKEN
        and ":" in settings.BOT_TOKEN
        and not settings.BOT_TOKEN.startswith("1234567890:")
    )
    if is_configured_token:
        logger.info("Valid Telegram BOT_TOKEN detected. Starting Aiogram bot polling...")
        dp.include_router(bot_router)

        async def setup_bot_commands(bot_instance):
            try:
                commands = [
                    BotCommand(command="today", description="📋 Задачи на сегодня"),
                    BotCommand(command="groceries", description="🛒 Список продуктов"),
                    BotCommand(command="routines", description="🔄 Ежедневные рутины"),
                    BotCommand(command="goals", description="🎯 Мои цели и проекты"),
                    BotCommand(command="settings", description="⚙️ Настройки и напоминания"),
                    BotCommand(command="test", description="🔔 Тест уведомлений"),
                    BotCommand(command="webapp", description="📱 Открыть WebApp"),
                    BotCommand(command="help", description="💡 Помощь и справка"),
                    BotCommand(command="start", description="👋 Главное меню"),
                ]
                await bot_instance.set_my_commands(commands, scope=BotCommandScopeDefault())
                await bot_instance.set_chat_menu_button(menu_button=MenuButtonCommands())
                logger.info("Telegram Bot commands and commands menu button successfully registered.")
            except Exception as e:
                logger.warning(f"Could not register Telegram bot commands: {e}")

        async def run_bot():
            try:
                await bot.delete_webhook(drop_pending_updates=True)
                await setup_bot_commands(bot)
                await dp.start_polling(bot)
            except Exception as e:
                logger.error(f"Error in bot polling: {e}", exc_info=True)

        bot_polling_task = asyncio.create_task(run_bot())
    else:
        logger.warning(
            "Telegram BOT_TOKEN is not configured in .env. "
            "Bot polling skipped. REST API and WebApp will function normally."
        )

    yield

    logger.info("Shutting down...")
    if bot_polling_task and not bot_polling_task.done():
        bot_polling_task.cancel()
        try:
            await bot_polling_task
        except asyncio.CancelledError:
            pass

    if settings.BOT_TOKEN and settings.BOT_TOKEN != "dummy:token":
        await bot.session.close()

    if scheduler.running:
        scheduler.shutdown(wait=False)


app = FastAPI(
    title="TaskerBot Unified Server",
    description="Backend API and Telegram Mini App for TaskerBot",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS configuration for WebApp
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include REST API
app.include_router(api_router)


@app.get("/health")
@app.get("/api/health")
async def health_check():
    return {
        "status": "ok",
        "service": "TaskerBot",
        "db": "postgresql" if "postgresql" in settings.DATABASE_URL else "sqlite",
    }


# Mount Frontend static files if built
frontend_dist = BASE_DIR / "frontend" / "dist"
if frontend_dist.exists() and (frontend_dist / "index.html").exists():
    app.mount("/assets", StaticFiles(directory=str(frontend_dist / "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Don't intercept API routes
        if full_path.startswith("api"):
            return None
        # Handle cases where nested routes like /auth/assets/... request static assets
        if "assets/" in full_path:
            asset_filename = full_path.split("assets/", 1)[1]
            candidate_asset = frontend_dist / "assets" / asset_filename
            if candidate_asset.is_file():
                return FileResponse(candidate_asset)
        file_path = frontend_dist / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(frontend_dist / "index.html")
else:
    @app.get("/")
    async def index_root():
        return {
            "status": "TaskerBot API is running",
            "docs": "/docs",
            "webapp_built": False,
            "message": "Frontend is building or not compiled to dist yet. Access /docs for API.",
        }


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
    )
