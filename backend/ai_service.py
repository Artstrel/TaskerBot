import io
import json
import logging
import re
from datetime import date, timedelta
from typing import Optional, List, Dict, Any

from backend.config import settings
from backend.schemas import ExtractedTaskList, ExtractedTask, AIProviderInfo, AIProvidersResponse

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """Ты — интеллектуальный ассистент по планированию задач TaskerBot.
Твоя задача — внимательно проанализировать текст или аудиосообщение пользователя и извлечь ВСЕ упомянутые задачи.

Правила классификации категорий:
1. "routine": регулярные ежедневные привычки и действия (маркеры: "каждый день", "ежедневно", "по утрам", "каждый вечер", "пить витамины", "делать зарядку").
2. "one_time": разовые задачи на конкретный день (маркеры: "сегодня", "завтра", "купить хлеб", "позвонить врачу", "заехать в автосервис").
3. "goal": глобальные крупные цели, проекты или майлстоуны (маркеры: "цель", "хочу запустить проект", "сделать ремонт", "выучить английский", "похудеть").
4. "subtask": конкретный шаг для достижения цели (если пользователь говорит "к цели X сделать Y", "для ремонта заказать краску").

Текущая дата пользователя: {current_date}.
Если указано "завтра", рассчитай точную дату YYYY-MM-DD. Если дата не указана для разовой задачи, установи null (что означает "сегодня").
Если в сообщении несколько задач (например: "Каждый день бегать и завтра купить билеты"), ОБЯЗАТЕЛЬНО разбей их на отдельные элементы списка.

Формат ответа: строго JSON с полем "tasks".
Каждый элемент в "tasks" должен содержать:
- "category": "routine" | "one_time" | "goal" | "subtask"
- "title": краткое и четкое название задачи
- "description": подробности или null
- "scheduled_date": "YYYY-MM-DD" или null
- "goal_title": название цели (если это subtask) или null
- "target_date": дедлайн цели "YYYY-MM-DD" (если это goal) или null
"""


def _fallback_parse(text: str, current_date: date) -> ExtractedTaskList:
    """Fallback keyword-based parser when AI keys are missing or offline."""
    lines = [l.strip() for l in re.split(r"[\n;,]+|\s+и\s+", text) if l.strip()]
    tasks: List[ExtractedTask] = []

    for line in lines:
        lower = line.lower()
        # Routine check
        if any(w in lower for w in ["каждый день", "ежедневно", "утром", "вечером", "привычк"]):
            title = re.sub(
                r"\b(каждый день|ежедневно|утром|вечером|надо|нужно|привычка)\b",
                "",
                line,
                flags=re.IGNORECASE,
            ).strip()
            tasks.append(
                ExtractedTask(
                    category="routine",
                    title=title or line,
                )
            )
        # Goal check
        elif any(w in lower for w in ["цель:", "цель ", "проект:", "проект "]):
            title = re.sub(r"\b(цель|проект)\b:?", "", line, flags=re.IGNORECASE).strip()
            tasks.append(
                ExtractedTask(
                    category="goal",
                    title=title or line,
                )
            )
        # One time task check
        else:
            sched_date = None
            if "послезавтра" in lower:
                sched_date = (current_date + timedelta(days=2)).isoformat()
            elif "завтра" in lower:
                sched_date = (current_date + timedelta(days=1)).isoformat()

            clean_title = re.sub(
                r"\b(завтра|послезавтра|сегодня|надо|нужно|задача)\b",
                "",
                line,
                flags=re.IGNORECASE,
            ).strip()

            tasks.append(
                ExtractedTask(
                    category="one_time",
                    title=clean_title or line,
                    scheduled_date=sched_date,
                )
            )

    if not tasks and text.strip():
        tasks.append(ExtractedTask(category="one_time", title=text.strip()))

    return ExtractedTaskList(tasks=tasks)


def detect_audio_mime_and_filename(audio_bytes: bytes) -> tuple[str, str]:
    if audio_bytes.startswith(b"OggS"):
        return "audio/ogg", "audio.ogg"
    if audio_bytes.startswith(b"RIFF"):
        return "audio/wav", "audio.wav"
    if audio_bytes.startswith(b"ID3") or audio_bytes[:2] in [b"\xff\xfb", b"\xff\xf3", b"\xff\xf2"]:
        return "audio/mp3", "audio.mp3"
    if audio_bytes[:4] == b"\x1a\x45\xdf\xa3":
        return "audio/webm", "audio.webm"
    if b"ftyp" in audio_bytes[:20]:
        return "audio/mp4", "audio.m4a"
    return "audio/ogg", "audio.ogg"


class AIService:
    def __init__(self):
        self._groq_client = None
        self._gemini_client = None

    def get_providers_status(self, user_active: Optional[str] = None) -> AIProvidersResponse:
        groq_ready = bool(settings.GROQ_API_KEY and settings.GROQ_API_KEY.strip())
        gemini_ready = bool(settings.GEMINI_API_KEY and settings.GEMINI_API_KEY.strip())

        providers = [
            AIProviderInfo(
                id="groq",
                name="Groq (Whisper + Gemini)",
                description="Сверхбыстрая транскрипция речи Groq Whisper (~300 мс) + интеллектуальный разбор задач через Gemini",
                is_configured=groq_ready,
            ),
            AIProviderInfo(
                id="gemini",
                name="Google Gemini (3.8 Flash / 3.5 Flash-Lite)",
                description="Мультимодальные модели Google Gemini 3.8 Flash и 3.5 Flash-Lite",
                is_configured=gemini_ready,
            ),
        ]

        active = user_active or settings.DEFAULT_AI_PROVIDER
        # If user active is not configured, fall back to configured one if available
        if active == "groq" and not groq_ready and gemini_ready:
            active = "gemini"
        elif active == "gemini" and not gemini_ready and groq_ready:
            active = "groq"

        return AIProvidersResponse(active_provider=active, providers=providers)

    def _get_groq_client(self):
        if not self._groq_client and settings.GROQ_API_KEY and settings.GROQ_API_KEY.strip():
            try:
                from groq import AsyncGroq
                self._groq_client = AsyncGroq(api_key=settings.GROQ_API_KEY.strip())
            except Exception as e:
                logger.error(f"Failed to initialize Groq client: {e}")
        return self._groq_client

    def _get_gemini_client(self):
        if not self._gemini_client and settings.GEMINI_API_KEY and settings.GEMINI_API_KEY.strip():
            try:
                from google import genai
                self._gemini_client = genai.Client(api_key=settings.GEMINI_API_KEY.strip())
            except Exception as e:
                logger.error(f"Failed to initialize Gemini client: {e}")
        return self._gemini_client

    def resolve_provider(self, requested: Optional[str]) -> str:
        prov = (requested or settings.DEFAULT_AI_PROVIDER or "groq").lower()
        # Fallback if selected provider has no key configured
        if prov == "groq" and not (settings.GROQ_API_KEY and settings.GROQ_API_KEY.strip()):
            if settings.GEMINI_API_KEY and settings.GEMINI_API_KEY.strip():
                return "gemini"
        elif prov == "gemini" and not (settings.GEMINI_API_KEY and settings.GEMINI_API_KEY.strip()):
            if settings.GROQ_API_KEY and settings.GROQ_API_KEY.strip():
                return "groq"
        return prov

    async def parse_text_tasks(
        self, text: str, current_date: date, provider: Optional[str] = None
    ) -> ExtractedTaskList:
        chosen = self.resolve_provider(provider)
        logger.info(f"Parsing text tasks with provider: {chosen}")

        if chosen == "groq":
            res = await self._parse_text_groq(text, current_date)
            if res is not None:
                return res
            # Try Gemini fallback if Groq failed
            if self._get_gemini_client():
                res = await self._parse_text_gemini(text, current_date)
                if res is not None:
                    return res
        else:
            res = await self._parse_text_gemini(text, current_date)
            if res is not None:
                return res
            # Try Groq fallback if Gemini failed
            if self._get_groq_client():
                res = await self._parse_text_groq(text, current_date)
                if res is not None:
                    return res

        return _fallback_parse(text, current_date)

    async def _parse_text_groq(self, text: str, current_date: date) -> Optional[ExtractedTaskList]:
        client = self._get_groq_client()
        if not client:
            return None

        prompt = (
            SYSTEM_PROMPT.format(current_date=current_date.isoformat())
            + f"\n\nТекст сообщения пользователя:\n{text}"
        )

        for model_name in [
            "openai/gpt-oss-120b",
            "openai/gpt-oss-20b",
            "llama-3.3-70b-versatile",
            "llama-3.1-8b-instant",
        ]:
            try:
                response = await client.chat.completions.create(
                    model=model_name,
                    messages=[
                        {
                            "role": "system",
                            "content": (
                                SYSTEM_PROMPT.format(current_date=current_date.isoformat())
                                + "\nОтвет должен быть строго в формате JSON с ключом 'tasks'."
                            ),
                        },
                        {"role": "user", "content": f"Текст сообщения пользователя:\n{text}"},
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.1,
                )
                raw = response.choices[0].message.content
                if raw:
                    parsed_dict = json.loads(raw)
                    raw_tasks = []
                    if isinstance(parsed_dict, dict) and "tasks" in parsed_dict:
                        raw_tasks = parsed_dict["tasks"]
                    elif isinstance(parsed_dict, list):
                        raw_tasks = parsed_dict
                    elif isinstance(parsed_dict, dict) and "title" in parsed_dict:
                        raw_tasks = [parsed_dict]

                    normalized_tasks = []
                    for t in raw_tasks:
                        if isinstance(t, str):
                            title = t.strip()
                            if title:
                                normalized_tasks.append(ExtractedTask(category="one_time", title=title))
                        elif isinstance(t, dict):
                            cat = t.get("category", "one_time")
                            if cat not in ["routine", "one_time", "goal", "subtask"]:
                                cat = "one_time"
                            title = t.get("title") or t.get("name") or "Новая задача"
                            normalized_tasks.append(
                                ExtractedTask(
                                    category=cat,
                                    title=title,
                                    scheduled_date=t.get("scheduled_date"),
                                    description=t.get("description"),
                                    goal_title=t.get("goal_title"),
                                    target_date=t.get("target_date"),
                                )
                            )
                    if normalized_tasks:
                        return ExtractedTaskList(tasks=normalized_tasks)
            except Exception as e:
                logger.warning(f"Groq text model {model_name} failed: {e}")
                continue
        return None

    async def _parse_text_gemini(self, text: str, current_date: date) -> Optional[ExtractedTaskList]:
        client = self._get_gemini_client()
        if not client:
            return None

        prompt = (
            SYSTEM_PROMPT.format(current_date=current_date.isoformat())
            + f"\n\nТекст сообщения пользователя:\n{text}"
        )

        from google.genai import types

        for model_name in [
            "gemini-3.8-flash",
            "gemini-3.5-flash-lite",
            "gemini-3.6-flash",
            "gemini-3.1-flash-lite",
            "gemini-2.5-flash",
        ]:
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        response_schema=ExtractedTaskList,
                        temperature=0.2,
                    ),
                )
                if response.text:
                    cleaned = response.text.strip()
                    if cleaned.startswith("```"):
                        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
                        cleaned = re.sub(r"\s*```$", "", cleaned)
                    return ExtractedTaskList.model_validate_json(cleaned)
            except Exception as e:
                logger.warning(f"Gemini model {model_name} failed: {e}")
                continue
        return None

    async def parse_audio_voice(
        self,
        audio_bytes: bytes,
        current_date: date,
        provider: Optional[str] = None,
        filename: Optional[str] = None,
    ) -> ExtractedTaskList:
        chosen = self.resolve_provider(provider)
        logger.info(f"Parsing audio voice with provider: {chosen}")

        mime_type, detected_fn = detect_audio_mime_and_filename(audio_bytes)
        fn = filename or detected_fn

        # 1. Groq Whisper (lightning fast ~300ms transcription)
        groq_client = self._get_groq_client()
        if groq_client:
            transcription = None
            for whisper_model in ["whisper-large-v3-turbo", "whisper-large-v3"]:
                try:
                    transcription = await groq_client.audio.transcriptions.create(
                        file=(fn, audio_bytes),
                        model=whisper_model,
                        response_format="text",
                        temperature=0.0,
                    )
                    if transcription:
                        break
                except Exception as we:
                    logger.warning(f"Groq Whisper {whisper_model} error: {we}")

            if transcription and str(transcription).strip():
                text = str(transcription).strip()
                logger.info(f"Audio transcribed successfully via Whisper: {text[:100]}")
                # Parse with Gemini (preferred for structured parsing) or fallback to Groq
                if self._get_gemini_client():
                    res = await self._parse_text_gemini(text, current_date)
                    if res and res.tasks:
                        return res
                res = await self.parse_text_tasks(text, current_date, provider=chosen)
                if res and res.tasks:
                    return res
                return _fallback_parse(text, current_date)

        # 2. Fallback to Gemini multimodal audio if Groq client not available
        if self._get_gemini_client():
            res = await self._parse_audio_gemini(audio_bytes, current_date, mime_type)
            if res and res.tasks:
                return res

        return ExtractedTaskList(
            tasks=[
                ExtractedTask(
                    category="one_time",
                    title="Голосовая заметка (не удалось расшифровать, проверьте микрофон или ключи)",
                )
            ]
        )

    async def _parse_audio_gemini(
        self, audio_bytes: bytes, current_date: date, mime_type: str
    ) -> Optional[ExtractedTaskList]:
        client = self._get_gemini_client()
        if not client:
            return None

        prompt = (
            SYSTEM_PROMPT.format(current_date=current_date.isoformat())
            + "\n\nРасшифруй это аудиосообщение и извлеки задачи строго в формате JSON."
        )

        from google.genai import types

        for model_name in [
            "gemini-3.8-flash",
            "gemini-3.5-flash-lite",
            "gemini-3.6-flash",
            "gemini-3.1-flash-lite",
            "gemini-2.5-flash",
        ]:
            try:
                audio_part = types.Part.from_bytes(data=audio_bytes, mime_type=mime_type)
                response = client.models.generate_content(
                    model=model_name,
                    contents=[audio_part, prompt],
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        response_schema=ExtractedTaskList,
                        temperature=0.2,
                    ),
                )
                if response.text:
                    cleaned = response.text.strip()
                    if cleaned.startswith("```"):
                        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
                        cleaned = re.sub(r"\s*```$", "", cleaned)
                    return ExtractedTaskList.model_validate_json(cleaned)
            except Exception as e:
                logger.warning(f"Gemini audio model {model_name} failed: {e}")
                continue
        return None


ai_service = AIService()
