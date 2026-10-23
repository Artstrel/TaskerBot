import io
import json
import logging
import re
import asyncio
from datetime import date, timedelta
from typing import Optional, List, Dict, Any

import httpx
from backend.config import settings
from backend.schemas import ExtractedTaskList, ExtractedTask, AIProviderInfo, AIProvidersResponse

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """Ты — интеллектуальный ассистент по планированию задач TaskerBot.
Твоя задача — внимательно проанализировать текст или аудиосообщение пользователя и извлечь ВСЕ упомянутые задачи.

Правила классификации категорий:
1. "routine": регулярные ежедневные привычки и действия (маркеры: "каждый день", "ежедневно", "по утрам", "каждый вечер", "пить воду", "делать зарядку", "отжиматься каждый день").
2. "one_time": разовые задачи на конкретный день (маркеры: "сегодня", "завтра", "позвонить врачу", "заехать в автосервис").
3. "goal": глобальные крупные цели, проекты или майлстоуны (маркеры: "цель", "хочу запустить проект", "сделать ремонт", "выучить английский", "похудеть").
4. "subtask": конкретный шаг для достижения цели (если пользователь говорит "к цели X сделать Y", "для ремонта заказать краску", либо если задача логически относится к одной из существующих целей, либо если диктуется новая цель и шаги к ней).
5. "grocery": продукты питания, напитки, еда, бытовая химия и повседневные товары для дома из супермаркета (маркеры: "молоко", "хлеб", "яйца", "помидоры", "сыр", "курица", "стиральный порошок", "мыло", "зубная паста", "купить в магазине", "список продуктов", "список покупок", "в список продуктов").

ВАЖНО по разделению покупок:
- Обычные продукты питания и повседневные бытовые покупки для дома (молоко, бананы, кофе, губки для посуды, стиральный порошок и т.д.) ВСЕГДА классифицируй как "grocery".
- Крупные разовые покупки, дела и услуги (например: "купить ноутбук", "купить билеты на самолет", "заехать в автосервис", "позвонить маме", "забрать посылку") классифицируй как "one_time".
- Если пользователь диктует смесь продуктов и обычных дел (например: "Купить молоко 2 литра, десяток яиц и позвонить стоматологу"), ОБЯЗАТЕЛЬНО разбей их: молоко и яйца отправь в "grocery" (с соответствующими target_value/unit), а звонок стоматологу — в "one_time".

Существующие активные цели пользователя:
{existing_goals_info}

Правила связывания задач с целями:
- Если задача относится к существующей цели из списка выше, укажи "category": "subtask" и "goal_title": "точное название цели из списка".
- Если пользователь диктует новую цель вместе с её шагами/подзадачами (например: "Цель: Запустить MVP. Шаги: дизайн, верстка, деплой"), создай саму цель с "category": "goal" (title="Запустить MVP"), а шаги выдели в отдельные задачи с "category": "subtask" и "goal_title": "Запустить MVP".

Правила для числовых (количественных) задач и привычек со счётчиком:
- Если задача или привычка содержит измеримую количественную цель (например: "выпить 2 литра воды", "отжаться 20 раз", "купить 5 помидоров", "пробежать 5 км", "прочитать 30 страниц", "сделать 10 подтягиваний"):
  - "target_value": числовое значение цели (float, например: 2.0, 20.0, 5.0, 30.0).
  - "unit": единица измерения кратко (строка, например: "л", "мл", "раз", "шт", "кг", "км", "стр").
  - "step": шаг инкремента/декремента. Если в тексте указан шаг (например, "по 250 мл", "по 5 отжиманий"), используй его. Если не указан: для жидкостей и веса ("л", "кг") используй 0.25; для штук, повторений, страниц, километров ("раз", "шт", "стр", "км") используй 1.0.
- Если задача обычная и не содержит числовой счётчик, поля target_value, step, unit должны быть null.

Текущая дата пользователя: {current_date}.
Если указано "завтра", рассчитай точную дату YYYY-MM-DD. Если дата не указана для разовой задачи, установи null (что означает "сегодня").
Если в сообщении несколько задач (например: "Каждый день пить 2 литра воды и завтра купить 5 помидоров"), ОБЯЗАТЕЛЬНО разбей их на отдельные элементы списка.

Формат ответа: строго JSON с полем "tasks".
Каждый элемент в "tasks" должен содержать:
- "category": "routine" | "one_time" | "goal" | "subtask" | "grocery"
- "title": краткое и четкое название задачи или продукта
- "description": подробности или null
- "scheduled_date": "YYYY-MM-DD" или null
- "goal_title": название цели (если это subtask) или null
- "target_date": дедлайн цели "YYYY-MM-DD" (если это goal) или null
- "target_value": число (float) или null
- "step": шаг (float) или null
- "unit": строка единицы измерения ("л", "шт", "раз", "кг" и т.п.) или null
"""


def _format_system_prompt(current_date: date, existing_goals: Optional[List[str]] = None) -> str:
    goals_info = "Список существующих целей пуст."
    if existing_goals:
        cleaned_goals = [g.strip() for g in existing_goals if g and g.strip()]
        if cleaned_goals:
            goals_info = "\n".join(f"- {g}" for g in cleaned_goals)
    return SYSTEM_PROMPT.format(
        current_date=current_date.isoformat(),
        existing_goals_info=goals_info,
    )



def _normalize_extracted_tasks(raw_tasks: list) -> List[ExtractedTask]:
    normalized_tasks = []
    for t in raw_tasks:
        if isinstance(t, str):
            title = t.strip()
            if title:
                normalized_tasks.append(ExtractedTask(category="one_time", title=title))
        elif isinstance(t, dict):
            cat = t.get("category", "one_time")
            if cat not in ["routine", "one_time", "goal", "subtask", "grocery"]:
                cat = "one_time"
            title = t.get("title") or t.get("name") or "Новая задача"

            target_val = t.get("target_value")
            try:
                target_val = float(target_val) if target_val is not None else None
            except (ValueError, TypeError):
                target_val = None

            step_val = t.get("step")
            try:
                step_val = float(step_val) if step_val is not None else (1.0 if target_val else None)
            except (ValueError, TypeError):
                step_val = 1.0 if target_val else None

            unit_val = t.get("unit")
            unit_val = str(unit_val).strip() if unit_val else None

            normalized_tasks.append(
                ExtractedTask(
                    category=cat,
                    title=str(title).strip(),
                    scheduled_date=t.get("scheduled_date"),
                    description=t.get("description"),
                    goal_title=t.get("goal_title"),
                    target_date=t.get("target_date"),
                    target_value=target_val,
                    step=step_val,
                    unit=unit_val,
                )
            )
    return normalized_tasks


def _parse_json_tasks(raw: str) -> Optional[ExtractedTaskList]:
    """Extract and validate tasks from JSON response, handling markdown blocks if present."""
    if not raw or not raw.strip():
        return None
    cleaned = raw.strip()
    if "```" in cleaned:
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.MULTILINE)
        cleaned = re.sub(r"\s*```$", "", cleaned, flags=re.MULTILINE)
        cleaned = cleaned.strip()

    try:
        parsed = json.loads(cleaned)
    except Exception:
        # Try extracting JSON object substring
        match = re.search(r"\{.*\}", cleaned, flags=re.DOTALL)
        if match:
            try:
                parsed = json.loads(match.group(0))
            except Exception:
                return None
        else:
            return None

    raw_tasks = []
    if isinstance(parsed, dict) and "tasks" in parsed:
        raw_tasks = parsed["tasks"]
    elif isinstance(parsed, list):
        raw_tasks = parsed
    elif isinstance(parsed, dict) and "title" in parsed:
        raw_tasks = [parsed]

    normalized = _normalize_extracted_tasks(raw_tasks)
    if normalized:
        return ExtractedTaskList(tasks=normalized)
    return None


def _fallback_parse(
    text: str, current_date: date, existing_goals: Optional[List[str]] = None
) -> ExtractedTaskList:
    """Fallback keyword and regex parser when AI keys are missing or offline."""
    lines = [l.strip() for l in re.split(r"[\n;,]+|\s+и\s+", text) if l.strip()]
    tasks: List[ExtractedTask] = []
    current_goal: Optional[str] = None

    for line in lines:
        lower = line.lower()

        # Check numeric quantity patterns
        target_val = None
        unit_val = None
        step_val = None

        # Look for e.g. "2 литра", "2.5 л", "20 отжиманий", "5 помидоров", "10 раз"
        num_match = re.search(r"(\d+(?:[.,]\d+)?)\s*(литра?|литров|л|мл|кг|килограмм\w*|раз\w*|отжиман\w*|шт|штук\w*|помидор\w*|стр|страниц\w*|км|километр\w*)", lower)
        if num_match:
            try:
                val_str = num_match.group(1).replace(",", ".")
                target_val = float(val_str)
                u = num_match.group(2)
                if "литр" in u or u == "л":
                    unit_val = "л"
                    step_val = 0.25
                elif "мл" in u:
                    unit_val = "мл"
                    step_val = 250.0
                elif "кг" in u or "килограмм" in u:
                    unit_val = "кг"
                    step_val = 0.5
                elif "отжиман" in u or "раз" in u:
                    unit_val = "раз"
                    step_val = 1.0
                elif "помидор" in u or "шт" in u:
                    unit_val = "шт"
                    step_val = 1.0
                elif "стр" in u:
                    unit_val = "стр"
                    step_val = 1.0
                elif "км" in u:
                    unit_val = "км"
                    step_val = 1.0
                else:
                    unit_val = "шт"
                    step_val = 1.0
            except Exception:
                target_val = None

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
                    target_value=target_val,
                    step=step_val,
                    unit=unit_val,
                )
            )
        # Goal check
        elif any(w in lower for w in ["цель:", "цель ", "проект:", "проект "]):
            title = re.sub(r"\b(цель|проект)\b:?", "", line, flags=re.IGNORECASE).strip()
            current_goal = title or line
            tasks.append(
                ExtractedTask(
                    category="goal",
                    title=current_goal,
                )
            )
        # Subtask check or One-time task check
        else:
            matched_goal = None
            clean_subtask = line

            goal_ref_match = re.search(r"\b(?:к цели|для цели|по цели)\s+([^,:]+)", line, re.IGNORECASE)
            if goal_ref_match:
                matched_goal = goal_ref_match.group(1).strip()
                clean_subtask = re.sub(r"\b(?:к цели|для цели|по цели)\s+[^,:]+[:\s]*", "", line, flags=re.IGNORECASE).strip()
            elif existing_goals:
                for eg in existing_goals:
                    if eg and eg.lower() in lower:
                        matched_goal = eg
                        break

            if not matched_goal and current_goal and any(w in lower for w in ["шаг", "подзадач", "пункт"]):
                matched_goal = current_goal
                clean_subtask = re.sub(r"\b(шаг|подзадача|пункт)\s*\d*[:\s]*", "", line, flags=re.IGNORECASE).strip()

            if matched_goal:
                tasks.append(
                    ExtractedTask(
                        category="subtask",
                        title=clean_subtask or line,
                        goal_title=matched_goal,
                        target_value=target_val,
                        step=step_val,
                        unit=unit_val,
                    )
                )
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
                        target_value=target_val,
                        step=step_val,
                        unit=unit_val,
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
        self._http_client: Optional[httpx.AsyncClient] = None

    def _get_http_client(self) -> httpx.AsyncClient:
        if self._http_client is None or self._http_client.is_closed:
            self._http_client = httpx.AsyncClient(timeout=httpx.Timeout(7.0, connect=3.0))
        return self._http_client

    def get_providers_status(self, user_active: Optional[str] = None) -> AIProvidersResponse:
        groq_ready = bool(settings.GROQ_API_KEY and settings.GROQ_API_KEY.strip())
        openrouter_ready = bool(settings.OPENROUTER_API_KEY and settings.OPENROUTER_API_KEY.strip())
        gemini_ready = bool(settings.GEMINI_API_KEY and settings.GEMINI_API_KEY.strip())

        providers = [
            AIProviderInfo(
                id="auto",
                name="Auto-Fast Cascade (Рекомендуется)",
                description="Сверхбыстрый каскад: Groq Llama 3.1 8B (~200 мс) и бесплатные модели OpenRouter, с автоматическим переходом на Google Gemini",
                is_configured=groq_ready or openrouter_ready or gemini_ready,
            ),
            AIProviderInfo(
                id="groq",
                name="Groq Llama 3.1 & Whisper",
                description="Молниеносная скорость генерации (~150-300 мс) на чипах LPU",
                is_configured=groq_ready,
            ),
            AIProviderInfo(
                id="openrouter",
                name="OpenRouter Free Models",
                description="Бесплатные легковесные модели (Gemma 4, LFM 2.6B, Nemotron)",
                is_configured=openrouter_ready,
            ),
            AIProviderInfo(
                id="gemini",
                name="Google Gemini (3.8 Flash / 3.5 Flash-Lite)",
                description="Официальные мультимодальные модели Google Gemini",
                is_configured=gemini_ready,
            ),
        ]

        active = user_active or settings.DEFAULT_AI_PROVIDER or "auto"
        # Validate active provider availability
        if active == "auto" and not (groq_ready or openrouter_ready or gemini_ready):
            active = "fallback"
        elif active == "groq" and not groq_ready:
            active = "auto" if (openrouter_ready or gemini_ready) else ("gemini" if gemini_ready else "groq")
        elif active == "openrouter" and not openrouter_ready:
            active = "auto" if (groq_ready or gemini_ready) else "openrouter"
        elif active == "gemini" and not gemini_ready:
            active = "auto" if (groq_ready or openrouter_ready) else "gemini"

        return AIProvidersResponse(active_provider=active, providers=providers)

    def _get_groq_client(self):
        if not self._groq_client and settings.GROQ_API_KEY and settings.GROQ_API_KEY.strip():
            try:
                from groq import AsyncGroq
                self._groq_client = AsyncGroq(api_key=settings.GROQ_API_KEY.strip(), timeout=6.0)
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
        prov = (requested or settings.DEFAULT_AI_PROVIDER or "auto").lower()
        return prov

    async def parse_text_tasks(
        self,
        text: str,
        current_date: date,
        provider: Optional[str] = None,
        existing_goals: Optional[List[str]] = None,
    ) -> ExtractedTaskList:
        chosen = self.resolve_provider(provider)
        logger.info(f"Parsing text tasks with requested provider: {chosen}")

        if chosen == "auto":
            # Auto-Fast cascade: Groq -> OpenRouter Free -> Gemini -> Fallback
            res = await self._parse_text_groq(text, current_date, existing_goals)
            if res is not None:
                logger.info("Successfully parsed tasks via Groq (Fast)")
                return res

            if settings.OPENROUTER_API_KEY and settings.OPENROUTER_API_KEY.strip():
                res = await self._parse_text_openrouter(text, current_date, existing_goals)
                if res is not None:
                    logger.info("Successfully parsed tasks via OpenRouter Free")
                    return res

            res = await self._parse_text_gemini(text, current_date, existing_goals)
            if res is not None:
                logger.info("Successfully parsed tasks via Gemini Flash fallback")
                return res

        elif chosen == "groq":
            res = await self._parse_text_groq(text, current_date, existing_goals)
            if res is not None:
                return res
            # Cascade fallbacks
            if settings.OPENROUTER_API_KEY and settings.OPENROUTER_API_KEY.strip():
                res = await self._parse_text_openrouter(text, current_date, existing_goals)
                if res is not None:
                    return res
            res = await self._parse_text_gemini(text, current_date, existing_goals)
            if res is not None:
                return res

        elif chosen == "openrouter":
            res = await self._parse_text_openrouter(text, current_date, existing_goals)
            if res is not None:
                return res
            res = await self._parse_text_groq(text, current_date, existing_goals)
            if res is not None:
                return res
            res = await self._parse_text_gemini(text, current_date, existing_goals)
            if res is not None:
                return res

        elif chosen == "gemini":
            res = await self._parse_text_gemini(text, current_date, existing_goals)
            if res is not None:
                return res
            res = await self._parse_text_groq(text, current_date, existing_goals)
            if res is not None:
                return res
            if settings.OPENROUTER_API_KEY and settings.OPENROUTER_API_KEY.strip():
                res = await self._parse_text_openrouter(text, current_date, existing_goals)
                if res is not None:
                    return res

        return _fallback_parse(text, current_date, existing_goals)

    async def _parse_text_groq(
        self, text: str, current_date: date, existing_goals: Optional[List[str]] = None
    ) -> Optional[ExtractedTaskList]:
        client = self._get_groq_client()
        if not client:
            return None

        # Ultrafast models on Groq: 20B first (~200ms), then Qwen 27B and 120B
        for model_name in [
            "openai/gpt-oss-20b",
            "qwen/qwen3.8-27b",
            "openai/gpt-oss-120b",
        ]:
            try:
                # Wrap with 6.0 second timeout to ensure snappy response
                coro = client.chat.completions.create(
                    model=model_name,
                    messages=[
                        {
                            "role": "system",
                            "content": (
                                _format_system_prompt(current_date, existing_goals)
                                + "\nОтвет должен быть строго в формате JSON с ключом 'tasks'."
                            ),
                        },
                        {"role": "user", "content": f"Текст сообщения пользователя:\n{text}"},
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.1,
                )
                response = await asyncio.wait_for(coro, timeout=6.0)
                raw = response.choices[0].message.content
                parsed = _parse_json_tasks(raw)
                if parsed:
                    return parsed
            except Exception as e:
                logger.warning(f"Groq text model {model_name} failed: {e}")
                continue
        return None

    async def _parse_text_openrouter(
        self, text: str, current_date: date, existing_goals: Optional[List[str]] = None
    ) -> Optional[ExtractedTaskList]:
        api_key = settings.OPENROUTER_API_KEY.strip() if settings.OPENROUTER_API_KEY else ""
        if not api_key:
            return None

        client = self._get_http_client()
        headers = {
            "Authorization": f"Bearer {api_key}",
            "HTTP-Referer": "https://taskerbot.local",
            "X-Title": "TaskerBot",
            "Content-Type": "application/json",
        }

        # Free lightweight models on OpenRouter (tested and active)
        free_models = [
            "dots-studio/dots-3-note-preview:free",
            "nvidia/nemotron-3.5-lightning:free",
            "google/gemma-4-31b-it:free",
            "google/gemma-4-26b-a4b-it:free",
            "liquid/lfm-2.5-2.6b:free",
            "openrouter/free",
        ]

        system_msg = (
            _format_system_prompt(current_date, existing_goals)
            + "\nОтвет должен быть строго в формате JSON с ключом 'tasks'."
        )

        for model_name in free_models:
            payload = {
                "model": model_name,
                "messages": [
                    {"role": "system", "content": system_msg},
                    {"role": "user", "content": f"Текст сообщения пользователя:\n{text}"},
                ],
                "temperature": 0.1,
            }
            try:
                resp = await client.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers=headers,
                    json=payload,
                    timeout=8.0,
                )
                if resp.status_code == 200:
                    data = resp.json()
                    choices = data.get("choices", [])
                    if choices and "message" in choices[0]:
                        msg = choices[0]["message"]
                        content = msg.get("content") or msg.get("reasoning") or ""
                        parsed = _parse_json_tasks(content)
                        if parsed and parsed.tasks:
                            return parsed
                        logger.warning(
                            f"OpenRouter model {model_name} returned non-JSON task format: {content[:100]}"
                        )
                else:
                    logger.warning(f"OpenRouter model {model_name} HTTP {resp.status_code}: {resp.text[:150]}")
            except Exception as e:
                logger.warning(f"OpenRouter model {model_name} failed: {e}")
                continue
        return None

    async def _parse_text_gemini(
        self, text: str, current_date: date, existing_goals: Optional[List[str]] = None
    ) -> Optional[ExtractedTaskList]:
        client = self._get_gemini_client()
        if not client:
            return None

        prompt = (
            _format_system_prompt(current_date, existing_goals)
            + f"\n\nТекст сообщения пользователя:\n{text}"
        )

        from google.genai import types

        # Official supported active models per documentation
        for model_name in [
            "gemini-3.8-flash",
            "gemini-3.5-flash-lite",
            "gemini-3.7-flash",
            "gemini-3.6-flash",
            "gemini-3-flash-preview",
        ]:
            try:
                # Run synchronous call in thread pool with 7.0s timeout
                def _call():
                    return client.models.generate_content(
                        model=model_name,
                        contents=prompt,
                        config=types.GenerateContentConfig(
                            response_mime_type="application/json",
                            response_schema=ExtractedTaskList,
                            temperature=0.2,
                        ),
                    )

                response = await asyncio.wait_for(asyncio.to_thread(_call), timeout=7.0)
                if response.parsed and isinstance(response.parsed, ExtractedTaskList) and response.parsed.tasks:
                    return response.parsed
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
        existing_goals: Optional[List[str]] = None,
    ) -> ExtractedTaskList:
        chosen = self.resolve_provider(provider)
        logger.info(f"Parsing audio voice with provider setting: {chosen}")

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
                # Parse through Auto-Fast cascade (Groq 8B -> OpenRouter -> Gemini)
                res = await self.parse_text_tasks(
                    text, current_date, provider=chosen, existing_goals=existing_goals
                )
                if res and res.tasks:
                    return res
                return _fallback_parse(text, current_date, existing_goals)

        # 2. Fallback to Gemini multimodal audio if Groq client not available
        if self._get_gemini_client():
            res = await self._parse_audio_gemini(
                audio_bytes, current_date, mime_type, existing_goals=existing_goals
            )
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
        self,
        audio_bytes: bytes,
        current_date: date,
        mime_type: str,
        existing_goals: Optional[List[str]] = None,
    ) -> Optional[ExtractedTaskList]:
        client = self._get_gemini_client()
        if not client:
            return None

        prompt = (
            _format_system_prompt(current_date, existing_goals)
            + "\n\nРасшифруй это аудиосообщение и извлеки задачи строго в формате JSON."
        )

        from google.genai import types

        for model_name in [
            "gemini-3.8-flash",
            "gemini-3.5-flash-lite",
            "gemini-3.7-flash",
            "gemini-3.6-flash",
            "gemini-3-flash-preview",
        ]:
            try:
                def _call():
                    audio_part = types.Part.from_bytes(data=audio_bytes, mime_type=mime_type)
                    return client.models.generate_content(
                        model=model_name,
                        contents=[audio_part, prompt],
                        config=types.GenerateContentConfig(
                            response_mime_type="application/json",
                            response_schema=ExtractedTaskList,
                            temperature=0.2,
                        ),
                    )

                response = await asyncio.wait_for(asyncio.to_thread(_call), timeout=10.0)
                if response.parsed and isinstance(response.parsed, ExtractedTaskList) and response.parsed.tasks:
                    return response.parsed
                if response.text:
                    cleaned = response.text.strip()
                    if cleaned.startswith("```"):
                        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
                        cleaned = re.sub(r"\s*```$", "", cleaned)
                    try:
                        parsed_res = ExtractedTaskList.model_validate_json(cleaned)
                        if parsed_res and parsed_res.tasks:
                            return parsed_res
                    except Exception:
                        pass
                    fb = _fallback_parse(cleaned, current_date)
                    if fb and fb.tasks:
                        return fb
            except Exception as e:
                logger.warning(f"Gemini audio model {model_name} failed: {e}")
                continue
        return None


ai_service = AIService()
