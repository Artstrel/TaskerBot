from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode

from backend.config import settings

DEFAULT_PLACEHOLDER_TOKEN = "1234567890:AAH_DummyTokenForDevelopmentOnly123456"


class LazyBot:
    def __init__(self):
        self._instance = None

    def _get(self) -> Bot:
        if self._instance is None:
            token_to_use = (
                settings.BOT_TOKEN.strip()
                if settings.BOT_TOKEN and ":" in settings.BOT_TOKEN
                else DEFAULT_PLACEHOLDER_TOKEN
            )
            self._instance = Bot(
                token=token_to_use,
                default=DefaultBotProperties(parse_mode=ParseMode.HTML),
            )
        return self._instance

    def __getattr__(self, name):
        return getattr(self._get(), name)


class LazyDispatcher:
    def __init__(self):
        self._instance = None

    def _get(self) -> Dispatcher:
        if self._instance is None:
            self._instance = Dispatcher()
        return self._instance

    def __getattr__(self, name):
        return getattr(self._get(), name)


bot = LazyBot()
dp = LazyDispatcher()
