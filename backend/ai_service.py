import io
import json
import logging
import re
import asyncio
from datetime import date, timedelta
from typing import Optional, List, Dict, Any

import httpx
from backend.config import settings
from backend.schemas import (
    ExtractedTaskList,
    ExtractedTask,
    AIProviderInfo,
    AIProvidersResponse,
    capitalize_first,
    normalize_scheduled_time,
)
from backend.whisper_service import (
    whisper_service,
    detect_hallucination_or_noise,
    strip_whisper_hallucinations,
)

logger = logging.getLogger(__name__)

GROCERY_KEYWORDS = (
    r"молок[оае]?|сливк\w*|кефир\w*|творог\w*|йогурт\w*|сметан\w*|сыр\w*|масл\w*|"
    r"хлеб\w*|батон\w*|булк\w*|лаваш\w*|выпечк\w*|яйц\w*|"
    r"мяс\w*|куриц\w*|говядин\w*|свинин\w*|индейк\w*|фарш\w*|сосиск\w*|колбас\w*|ветчин\w*|бекон\w*|"
    r"рыб\w*|лосос\w*|форел\w*|селедк\w*|тун[ец]\w*|креветк\w*|"
    r"овощ\w*|помидор\w*|огурц\w*|карто[фш]\w*|морков\w*|лук\b|чеснок\w*|капуст\w*|свекл\w*|кабач\w*|баклажан\w*|перец\w*|зелен\w*|укроп\w*|петрушк\w*|салат\w*|шпинат\w*|броккол\w*|авокадо|гриб\w*|шампиньон\w*|"
    r"фрукт\w*|яблок\w*|банан\w*|апельсин\w*|мандарин\w*|лимон\w*|груш\w*|виноград\w*|персик\w*|ягод\w*|клубник\w*|малин\w*|черник\w*|"
    r"круп\w*|рис\b|гречк\w*|макарон\w*|спагетт\w*|паст[аеу]|овсянк\w*|хлопь\w*|мук[аеу]|сахар\w*|сол[ьи]|"
    r"кетчуп\w*|майонез\w*|соус\w*|пицц\w*|"
    r"чай\b|кофе|сок\b|вод[аеуы]|минералк\w*|газировк\w*|квас\w*|лимонад\w*|пив[оа]|вин[оа]|"
    r"шоколад\w*|печень\w*|конфет\w*|торт\w*|вафл\w*|мед\b|орех\w*|чипс\w*|"
    r"порошок\w*|мыл[оа]|шампун\w*|гель\s+для\s+душа|зубн\w*\s+паст\w*|зубн\w*\s+щетк\w*|туалетн\w*\s+бумаг\w*|салфетк\w*|губк\w*\s+для\s+посуды|моющее|мусорн\w*\s+пакет\w*|пакет\w*\s+для\s+мусора|батарейк\w*|корм\w*|"
    r"продукт\w*|покупк\w*"
)

GROCERY_RE = re.compile(rf"(?:^|[^\wа-яА-ЯёЁ])(?:{GROCERY_KEYWORDS})(?=[^\wа-яА-ЯёЁ]|$)", re.IGNORECASE)

CLEAN_GROCERY_PREFIX_RE = re.compile(
    r"^(?:купить|докупить|взять|приобрести|заказать|захватить)"
    r"(?:\s+(?:в\s+магазине|в\s+супермаркете|домой|к\s+чаю|в\s+список\s+(?:продуктов|покупок)))?\s*[:\-]?\s*|"
    r"^(?:список\s+(?:продуктов|покупок)|в\s+список\s+(?:продуктов|покупок))\s*[:\-]?\s*",
    re.IGNORECASE,
)


def is_grocery_text(text: Optional[str]) -> bool:
    if not text or not isinstance(text, str):
        return False
    return bool(GROCERY_RE.search(text))


def clean_grocery_title(text: Optional[str]) -> str:
    if not text or not isinstance(text, str):
        return ""
    cleaned = CLEAN_GROCERY_PREFIX_RE.sub("", text).strip()
    return capitalize_first(cleaned or text)


_RU_HOUR_WORDS = {
    "час": 1,
    "один": 1,
    "два": 2,
    "три": 3,
    "четыре": 4,
    "пять": 5,
    "шесть": 6,
    "семь": 7,
    "восемь": 8,
    "девять": 9,
    "десять": 10,
    "одиннадцать": 11,
    "двенадцать": 12,
}


def _adjust_hour_by_period(hour: int, period: Optional[str]) -> int:
    if not period:
        return hour
    p = period.lower()
    if p.startswith("вечер") or p.startswith("дн"):
        if 1 <= hour <= 11:
            return hour + 12
    elif p.startswith("ноч"):
        if hour == 12:
            return 0
        if 1 <= hour <= 5:
            return hour
        if 6 <= hour <= 11:
            return hour + 12
    elif p.startswith("утр"):
        if hour == 12:
            return 0
    return hour


def extract_and_clean_datetime_markers(
    text: str,
    current_date: Optional[date] = None,
    current_time: Optional[str] = None,
    existing_date: Optional[str] = None,
    existing_time: Optional[str] = None,
) -> tuple[str, Optional[str], Optional[str]]:
    """
    Extracts scheduled_date (YYYY-MM-DD) and scheduled_time (HH:MM) from Russian natural language text,
    strips reminder prefixes ("напомни мне") and date/time markers from the title,
    and advances scheduled_date to tomorrow if no explicit date was given and the time has already passed today.
    """
    if not text or not isinstance(text, str):
        return "", existing_date, normalize_scheduled_time(existing_time)

    if isinstance(current_date, str):
        try:
            current_date = date.fromisoformat(current_date[:10])
        except Exception:
            current_date = None

    working = text.strip()
    lower_orig = working.lower()

    # 1. Detect explicit date markers in original text
    date_explicit = False
    extracted_date: Optional[str] = existing_date
    if current_date:
        if re.search(r"\bпослезавтра\b", lower_orig):
            extracted_date = (current_date + timedelta(days=2)).isoformat()
            date_explicit = True
        elif re.search(r"\bзавтра\b", lower_orig):
            extracted_date = (current_date + timedelta(days=1)).isoformat()
            date_explicit = True
        elif re.search(r"\bсегодня\b", lower_orig):
            extracted_date = current_date.isoformat()
            date_explicit = True
        elif existing_date and existing_date != current_date.isoformat():
            date_explicit = True

    extracted_time: Optional[str] = normalize_scheduled_time(existing_time)

    # 2. Extract time markers and strip them from working title
    # 2a. "в полдень" / "в полночь"
    m_noon = re.search(r"\b(?:в\s+)?(полдень|полночь)\b", working, flags=re.IGNORECASE)
    if m_noon:
        if not extracted_time:
            extracted_time = "12:00" if m_noon.group(1).lower() == "полдень" else "00:00"
        working = working[: m_noon.start()] + " " + working[m_noon.end() :]

    # 2b. Relative time: "через N часов/минут", "через час", "через полчаса"
    if current_time:
        try:
            ch, cm = [int(x) for x in current_time.split(":")[:2]]
            base_mins = ch * 60 + cm
        except Exception:
            base_mins = None
    else:
        base_mins = None

    m_rel = re.search(
        r"\bчерез\s+(?:(\d+)\s*(час(?:а|ов)?|мин(?:ут[аы]?)?)|(полчаса|час))\b",
        working,
        flags=re.IGNORECASE,
    )
    if m_rel:
        if base_mins is not None and not extracted_time:
            delta_m = 0
            if m_rel.group(3):
                w = m_rel.group(3).lower()
                delta_m = 30 if w == "полчаса" else 60
            else:
                num = int(m_rel.group(1))
                unit = m_rel.group(2).lower()
                delta_m = num * 60 if unit.startswith("час") else num
            total_m = base_mins + delta_m
            days_offset = total_m // (24 * 60)
            rem_m = total_m % (24 * 60)
            extracted_time = f"{rem_m // 60:02d}:{rem_m % 60:02d}"
            if days_offset > 0 and current_date and not date_explicit:
                extracted_date = (current_date + timedelta(days=days_offset)).isoformat()
                date_explicit = True
        working = working[: m_rel.start()] + " " + working[m_rel.end() :]

    # 2c. Explicit HH:MM or H.MM with optional period of day:
    # e.g. "в 19:00", "в 7:30 вечера", "вечером в 19:00", "к 14:30"
    m_hhmm = re.search(
        r"(?:\b(?:утром|днем|днём|вечером|ночью)\s+)?\b(?:в|к|на|около)\s*(\d{1,2})[:.](\d{2})(?:\s*(?:час(?:а|ов)?))?(?:\s*(утра|дня|вечера|ночи|утром|днем|днём|вечером|ночью))?(?=[^\wа-яА-ЯёЁ]|$)",
        working,
        flags=re.IGNORECASE,
    )
    if m_hhmm:
        h = int(m_hhmm.group(1))
        m = int(m_hhmm.group(2))
        period = m_hhmm.group(3)
        if not period:
            prefix_match = re.match(r"^\s*(утром|днем|днём|вечером|ночью)", m_hhmm.group(0), flags=re.IGNORECASE)
            if prefix_match:
                period = prefix_match.group(1)
        h = _adjust_hour_by_period(h, period)
        if 0 <= h <= 23 and 0 <= m <= 59 and not extracted_time:
            extracted_time = f"{h:02d}:{m:02d}"
        working = working[: m_hhmm.start()] + " " + working[m_hhmm.end() :]

    # 2d. Numeric hour + period of day or "часов":
    # e.g. "в 7 вечера", "в 7 часов вечера", "вечером в 7", "утром в 9", "в 19 часов", "к 18 часам"
    m_hour_num = re.search(
        r"(?:(?:\b(утром|днем|днём|вечером|ночью)\s+)?\b(?:в|к|на|около)\s*(\d{1,2})(?:\s*час(?:а|ов|ам)?)?\s*(утра|дня|вечера|ночи|утром|днем|днём|вечером|ночью)\b"
        r"|\b(утром|днем|днём|вечером|ночью)\s+(?:в|к|на|около)\s*(\d{1,2})(?:\s*час(?:а|ов|ам)?)?(?=[^\wа-яА-ЯёЁ]|$)"
        r"|\b(?:в|к|на|около)\s*(\d{1,2})\s*час(?:а|ов|ам)(?=[^\wа-яА-ЯёЁ]|$))",
        working,
        flags=re.IGNORECASE,
    )
    if m_hour_num:
        if m_hour_num.group(2):
            h = int(m_hour_num.group(2))
            period = m_hour_num.group(3) or m_hour_num.group(1)
        elif m_hour_num.group(5):
            h = int(m_hour_num.group(5))
            period = m_hour_num.group(4)
        else:
            h = int(m_hour_num.group(6))
            period = None
        h = _adjust_hour_by_period(h, period)
        if 0 <= h <= 23 and not extracted_time:
            extracted_time = f"{h:02d}:00"
        working = working[: m_hour_num.start()] + " " + working[m_hour_num.end() :]

    # 2e. Word hour + period of day or "часов":
    # e.g. "в семь вечера", "в семь часов вечера", "в час дня"
    hour_words_pattern = "|".join(_RU_HOUR_WORDS.keys())
    m_hour_word = re.search(
        rf"(?:\b(утром|днем|днём|вечером|ночью)\s+)?\b(?:в|к|на|около)\s*({hour_words_pattern})(?:\s*час(?:а|ов|ам)?)?\s*(утра|дня|вечера|ночи|утром|днем|днём|вечером|ночью|час(?:а|ов|ам))(?=[^\wа-яА-ЯёЁ]|$)",
        working,
        flags=re.IGNORECASE,
    )
    if m_hour_word:
        w_hour = m_hour_word.group(2).lower()
        h = _RU_HOUR_WORDS.get(w_hour, 0)
        period = m_hour_word.group(3)
        if period and period.lower().startswith("час"):
            period = m_hour_word.group(1)
        h = _adjust_hour_by_period(h, period)
        if 0 <= h <= 23 and not extracted_time:
            extracted_time = f"{h:02d}:00"
        working = working[: m_hour_word.start()] + " " + working[m_hour_word.end() :]

    # 2f. Standalone "в HH" when clearly a time (e.g. "в 19", "в 21")
    m_hour_24 = re.search(
        r"\b(?:в|к)\s*(1[3-9]|2[0-3]|0[0-9])(?=[^\wа-яА-ЯёЁ:.\d]|$)",
        working,
        flags=re.IGNORECASE,
    )
    if m_hour_24:
        h = int(m_hour_24.group(1))
        if 0 <= h <= 23 and not extracted_time:
            extracted_time = f"{h:02d}:00"
        working = working[: m_hour_24.start()] + " " + working[m_hour_24.end() :]

    # 2g. Vague time-of-day words ("сегодня вечером", "завтра утром") when no exact time was given
    m_vague = re.search(r"\b(утром|вечером|днем|днём|ночью)\b", working, flags=re.IGNORECASE)
    if m_vague:
        vw = m_vague.group(1).lower()
        if not extracted_time:
            if vw == "утром":
                extracted_time = "09:00"
            elif vw in ("днем", "днём"):
                extracted_time = "14:00"
            elif vw == "вечером":
                extracted_time = "19:00"
            elif vw == "ночью":
                extracted_time = "23:00"
        working = working[: m_vague.start()] + " " + working[m_vague.end() :]

    # 3. Strip introductory reminder phrases and date words from working title
    working = re.sub(
        r"^\s*(?:пожалуйста[,\s]+)?(?:напомни(?:те)?|напомнить)(?:\s+мне)?(?:\s*,?\s*пожалуйста)?\s*",
        "",
        working,
        flags=re.IGNORECASE,
    )
    working = re.sub(
        r"\b(?:напомни(?:те)?\s+мне|напомни(?:те)?|не\s+забудь(?:те)?|не\s+забыть|сегодня|завтра|послезавтра)\b",
        " ",
        working,
        flags=re.IGNORECASE,
    )
    working = re.sub(
        r"^\s*(?:мне\s+)?(?:нужно|надо|необходимо|задача)\s*[:\-]?\s*",
        "",
        working,
        flags=re.IGNORECASE,
    )
    # Clean stray prepositions/punctuation left at the very beginning or end
    working = re.sub(r"\s{2,}", " ", working).strip(" \t\n\r,.:;-–—")

    # 4. If time is present, no explicit date was specified, and the time has already passed today -> schedule for tomorrow
    if extracted_time and current_date and not date_explicit:
        norm_curr = normalize_scheduled_time(current_time) if current_time else None
        if norm_curr and extracted_time <= norm_curr:
            extracted_date = (current_date + timedelta(days=1)).isoformat()
        elif not extracted_date:
            extracted_date = current_date.isoformat()

    final_title = capitalize_first(working) if working else capitalize_first(text.strip())
    return final_title, extracted_date, extracted_time


SYSTEM_PROMPT = """Ты — интеллектуальный ассистент по планированию задач TaskerBot.
Твоя задача — внимательно проанализировать текст или аудиосообщение пользователя и извлечь ВСЕ упомянутые задачи.

Правила классификации категорий:
1. "routine": регулярные или повторяющиеся привычки и действия (маркеры: "каждый день", "ежедневно", "по утрам", "каждый вечер", "пить воду", "делать зарядку", "отжиматься каждый день", "раз в 3 дня", "каждые 2 дня", "через день", "по вторникам и четвергам", "по выходным", "по будням").
   - Для категории "routine" ОБЯЗАТЕЛЬНО определи расписание:
     * "frequency_type": "daily" (каждый день), "interval" (каждые N дней) или "weekly" (по дням недели).
     * "interval_days": число дней при frequency_type="interval" (например: 2 для "через день", 3 для "раз в 3 дня", 7 для "раз в неделю"). Для daily равно 1.
     * "days_of_week": массив индексов дней недели при frequency_type="weekly": 0=Пн, 1=Вт, 2=Ср, 3=Чт, 4=Пт, 5=Сб, 6=Вс (например: для "по выходным" -> [5, 6], для "по будням" -> [0, 1, 2, 3, 4], для "по вторникам и четвергам" -> [1, 3]). Если frequency_type не "weekly", установи null.
2. "one_time": разовые задачи на конкретный день (маркеры: "сегодня", "завтра", "позвонить врачу", "заехать в автосервис").
3. "goal": глобальные крупные цели, проекты или майлстоуны (маркеры: "цель", "хочу запустить проект", "сделать ремонт", "выучить английский", "похудеть").
4. "subtask": конкретный шаг для достижения цели (если пользователь говорит "к цели X сделать Y", "для ремонта заказать краску", либо если задача логически относится к одной из существующих целей, либо если диктуется новая цель и шаги к ней).
5. "grocery": продукты питания, напитки, еда, бытовая химия и повседневные товары для дома из супермаркета (маркеры: "молоко", "хлеб", "яйца", "помидоры", "сыр", "курица", "стиральный порошок", "мыло", "зубная паста", "купить в магазине", "список продуктов", "список покупок", "в список продуктов").

ВАЖНО по разделению покупок:
- Обычные продукты питания и повседневные бытовые покупки для дома (молоко, бананы, кофе, губки для посуды, стиральный порошок и т.д.) ВСЕГДА классифицируй как "grocery". Для них scheduled_date устанавливай в null.
- Для продуктов в поле "title" пиши только сам продукт без слова "Купить" (например: "Молоко 2 л", "Сыр", "Хлеб").
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

Текущая дата пользователя: {current_date}. Текущее местное время пользователя: {current_time}.
Правила распознавания дат и времени (scheduled_date и scheduled_time):
- Если указано время выполнения разовой задачи или подзадачи (например: "в 7 вечера", "в 19:00", "в 9 утра", "в 14:30", "в полдень", "через 2 часа", "сегодня вечером"), ОБЯЗАТЕЛЬНО извлеки время в формате 24ч "HH:MM" в поле "scheduled_time" (например: "19:00", "09:00", "14:30", "12:00").
- ОБЯЗАТЕЛЬНО очищай "title" от вводных фраз ("напомни мне", "напомни", "не забудь", "нужно", "надо") и маркеров даты/времени ("в 7 вечера", "в 19:00", "завтра", "сегодня"). Пример: "напомни мне в 7 вечера сходить полить цветы" -> title: "Сходить полить цветы", scheduled_time: "19:00".
- Если указано "завтра", рассчитай точную дату YYYY-MM-DD (текущая дата + 1 день). Если указано "послезавтра" — текущая дата + 2 дня.
- Если конкретная дата НЕ указана, но указано время (scheduled_time), которое сегодня УЖЕ ПРОШЛО относительно текущего времени пользователя ({current_time}), автоматически поставь "scheduled_date" на ЗАВТРА (текущая дата + 1 день). Иначе установи null (что означает "сегодня").
Если в сообщении несколько задач (например: "Каждый день пить 2 литра воды и завтра купить 5 помидоров"), ОБЯЗАТЕЛЬНО разбей их на отдельные элементы списка.

Формат ответа: строго JSON с полем "tasks".
Каждый элемент в "tasks" должен содержать:
- "category": "routine" | "one_time" | "goal" | "subtask" | "grocery"
- "title": краткое и четкое название задачи или продукта без вводных "напомни мне" и без тайм-маркеров (ОБЯЗАТЕЛЬНО начинай с заглавной буквы, например: "Сходить полить цветы", "Позвонить врачу", "Сделать зарядку"). Для продуктов из категории "grocery" пиши только сам продукт без слова "Купить" (например: "Молоко 2 л", "Сыр", "Хлеб").
- "description": подробности или null
- "scheduled_date": "YYYY-MM-DD" или null
- "scheduled_time": "HH:MM" (в 24-часовом формате, например "19:00") или null
- "goal_title": точное название цели из списка или новой цели (всегда с заглавной буквы) или null
- "target_date": дедлайн цели "YYYY-MM-DD" (если это goal) или null
- "target_value": число (float) или null
- "step": шаг (float) или null
- "unit": строка единицы измерения ("л", "шт", "раз", "кг" и т.п.) или null
- "frequency_type": "daily" | "interval" | "weekly" или null (для routine)
- "interval_days": число (int) или null (для routine)
- "days_of_week": массив чисел [0, 1, ...] или null (для routine)
"""


def filter_relevant_goals(text: str, existing_goals: Optional[List[str]]) -> List[str]:
    """
    Privacy filter: only include goals that are referenced in the user's text.
    Prevents leaking the user's entire backlog of strategic goals to external LLMs.
    """
    if not existing_goals or not text:
        return []
    text_lower = text.lower()
    relevant = []
    for g in existing_goals:
        if not g or not g.strip():
            continue
        g_clean = g.strip()
        g_lower = g_clean.lower()
        if g_lower in text_lower:
            relevant.append(g_clean)
            continue
        words = [w for w in re.findall(r"[\wа-яА-ЯёЁ]+", g_lower) if len(w) >= 3]
        if words and any(w in text_lower for w in words):
            relevant.append(g_clean)
    return relevant


def _format_system_prompt(
    current_date: date,
    existing_goals: Optional[List[str]] = None,
    current_time: Optional[str] = None,
) -> str:
    goals_info = "Список существующих целей пуст."
    if existing_goals:
        cleaned_goals = [g.strip() for g in existing_goals if g and g.strip()]
        if cleaned_goals:
            goals_info = "\n".join(f"- {g}" for g in cleaned_goals)
    date_str = current_date.isoformat() if hasattr(current_date, "isoformat") else str(current_date)
    time_str = normalize_scheduled_time(current_time) or "12:00"
    return SYSTEM_PROMPT.format(
        current_date=date_str,
        current_time=time_str,
        existing_goals_info=goals_info,
    )


def _postprocess_extracted_list(
    extracted: ExtractedTaskList,
    source_text: Optional[str] = None,
    current_date: Optional[date] = None,
    current_time: Optional[str] = None,
) -> ExtractedTaskList:
    if not extracted or not extracted.tasks:
        return extracted
    single_task = len(extracted.tasks) == 1
    for t in extracted.tasks:
        if t.category in ("one_time", "subtask"):
            cleaned_title, new_date, new_time = extract_and_clean_datetime_markers(
                t.title,
                current_date=current_date,
                current_time=current_time,
                existing_date=t.scheduled_date,
                existing_time=t.scheduled_time,
            )
            if single_task and source_text:
                _, src_date, src_time = extract_and_clean_datetime_markers(
                    source_text,
                    current_date=current_date,
                    current_time=current_time,
                    existing_date=new_date,
                    existing_time=new_time,
                )
                new_date = src_date or new_date
                new_time = src_time or new_time
            t.title = cleaned_title
            t.scheduled_date = new_date
            t.scheduled_time = new_time
    return extracted


def _normalize_extracted_tasks(
    raw_tasks: list,
    current_date: Optional[date] = None,
    current_time: Optional[str] = None,
) -> List[ExtractedTask]:
    normalized_tasks = []
    for t in raw_tasks:
        if isinstance(t, str):
            raw_title = strip_whisper_hallucinations(t.strip())
            if not raw_title or detect_hallucination_or_noise(raw_title):
                continue
            if is_grocery_text(raw_title):
                normalized_tasks.append(
                    ExtractedTask(
                        category="grocery",
                        title=clean_grocery_title(raw_title),
                        scheduled_date=None,
                    )
                )
            else:
                title, sched_date, sched_time = extract_and_clean_datetime_markers(
                    raw_title, current_date=current_date, current_time=current_time
                )
                normalized_tasks.append(
                    ExtractedTask(
                        category="one_time",
                        title=title,
                        scheduled_date=sched_date,
                        scheduled_time=sched_time,
                    )
                )
        elif isinstance(t, dict):
            raw_title = strip_whisper_hallucinations(str(t.get("title") or t.get("name") or "").strip())
            if not raw_title or detect_hallucination_or_noise(raw_title):
                continue
            cat = t.get("category", "one_time")
            if cat not in ["routine", "one_time", "goal", "subtask", "grocery"]:
                cat = "one_time"

            if cat == "grocery" or is_grocery_text(raw_title):
                cat = "grocery"
                title = clean_grocery_title(raw_title)
                sched_date = None
                sched_time = None
            elif cat in ("one_time", "subtask"):
                title, sched_date, sched_time = extract_and_clean_datetime_markers(
                    raw_title,
                    current_date=current_date,
                    current_time=current_time,
                    existing_date=t.get("scheduled_date"),
                    existing_time=t.get("scheduled_time") or t.get("time"),
                )
            else:
                title = capitalize_first(raw_title)
                sched_date = t.get("scheduled_date")
                sched_time = None

            goal_title = capitalize_first(t.get("goal_title")) if t.get("goal_title") else None

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

            freq_type = t.get("frequency_type")
            interval_d = t.get("interval_days")
            d_of_w = t.get("days_of_week")
            if cat == "routine":
                if not freq_type:
                    freq_type = "daily"
                if freq_type == "interval":
                    try:
                        interval_d = int(interval_d) if interval_d else 1
                    except (ValueError, TypeError):
                        interval_d = 1
                if freq_type == "weekly" and isinstance(d_of_w, list):
                    try:
                        d_of_w = [int(x) for x in d_of_w]
                    except (ValueError, TypeError):
                        d_of_w = None

            normalized_tasks.append(
                ExtractedTask(
                    category=cat,
                    title=title,
                    scheduled_date=sched_date,
                    scheduled_time=sched_time,
                    description=t.get("description"),
                    goal_title=goal_title,
                    target_date=t.get("target_date"),
                    target_value=target_val,
                    step=step_val,
                    unit=unit_val,
                    frequency_type=freq_type,
                    interval_days=interval_d,
                    days_of_week=d_of_w,
                )
            )
    return normalized_tasks


def _parse_json_tasks(
    raw: str,
    current_date: Optional[date] = None,
    current_time: Optional[str] = None,
) -> Optional[ExtractedTaskList]:
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

    normalized = _normalize_extracted_tasks(
        raw_tasks, current_date=current_date, current_time=current_time
    )
    if normalized:
        return ExtractedTaskList(tasks=normalized)
    return None


def _fallback_parse(
    text: str,
    current_date: date,
    existing_goals: Optional[List[str]] = None,
    current_time: Optional[str] = None,
) -> ExtractedTaskList:
    if detect_hallucination_or_noise(text):
        return ExtractedTaskList(tasks=[])

    # Protect phrases like "по вторникам и четвергам" from splitting by " и "
    protected_text = re.sub(
        r"(понедельник\w*|вторник\w*|сред\w*|четверг\w*|пятниц\w*|суббот\w*|воскресень\w*)\s+и\s+(понедельник\w*|вторник\w*|сред\w*|четверг\w*|пятниц\w*|суббот\w*|воскресень\w*)",
        r"\1 &&& \2",
        text,
        flags=re.IGNORECASE,
    )
    lines = [l.replace("&&&", "и").strip() for l in re.split(r"[\n;,]+|\s+и\s+", protected_text) if l.strip()]
    tasks: List[ExtractedTask] = []
    current_goal: Optional[str] = None

    for line in lines:
        if detect_hallucination_or_noise(line):
            continue
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
        is_routine_match = False
        freq_type = "daily"
        interval_d = 1
        d_of_w = None

        if "через день" in lower:
            is_routine_match = True
            freq_type = "interval"
            interval_d = 2
        else:
            m_interval = re.search(r"(?:раз в|каждые)\s+(\d+)\s*(?:дня|дней|день)", lower)
            if m_interval:
                is_routine_match = True
                freq_type = "interval"
                interval_d = int(m_interval.group(1))

        if not is_routine_match:
            days_map = {
                "понедельник": 0, "вторник": 1, "сред": 2, "четверг": 3,
                "пятниц": 4, "суббот": 5, "воскресень": 6
            }
            matched_days = []
            for d_name, d_idx in days_map.items():
                if d_name in lower:
                    matched_days.append(d_idx)
            if "по будням" in lower:
                matched_days = [0, 1, 2, 3, 4]
            elif "по выходным" in lower:
                matched_days = [5, 6]

            if matched_days:
                is_routine_match = True
                freq_type = "weekly"
                d_of_w = sorted(list(set(matched_days)))

        if not is_routine_match and any(
            w in lower
            for w in ["каждый день", "ежедневно", "по утрам", "по вечерам", "каждое утро", "каждый вечер", "привычк"]
        ):
            is_routine_match = True
            freq_type = "daily"

        if is_routine_match:
            title = re.sub(
                r"\b(каждый день|ежедневно|по утрам|по вечерам|каждое утро|каждый вечер|утром|вечером|надо|нужно|привычка|через день|по выходным|по будням|раз в \d+ дня|раз в \d+ дней|раз в \d+ день|каждые \d+ дня|каждые \d+ дней)\b",
                "",
                line,
                flags=re.IGNORECASE,
            ).strip()
            if freq_type == "weekly":
                title = re.sub(
                    r"\b(?:по|и)?\s*(?:понедельник\w*|вторник\w*|сред\w*|четверг\w*|пятниц\w*|суббот\w*|воскресень\w*)\b",
                    "",
                    title,
                    flags=re.IGNORECASE,
                ).strip()
            tasks.append(
                ExtractedTask(
                    category="routine",
                    title=capitalize_first(title or line),
                    target_value=target_val,
                    step=step_val,
                    unit=unit_val,
                    frequency_type=freq_type,
                    interval_days=interval_d,
                    days_of_week=d_of_w,
                )
            )
        # Goal check
        elif any(w in lower for w in ["цель:", "цель ", "проект:", "проект "]):
            title = re.sub(r"\b(цель|проект)\b:?", "", line, flags=re.IGNORECASE).strip()
            current_goal = capitalize_first(title or line)
            tasks.append(
                ExtractedTask(
                    category="goal",
                    title=current_goal,
                )
            )
        # Grocery check
        elif is_grocery_text(line):
            tasks.append(
                ExtractedTask(
                    category="grocery",
                    title=clean_grocery_title(line),
                    scheduled_date=None,
                    target_value=target_val,
                    step=step_val,
                    unit=unit_val,
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
                sub_title, sub_date, sub_time = extract_and_clean_datetime_markers(
                    clean_subtask or line, current_date=current_date, current_time=current_time
                )
                tasks.append(
                    ExtractedTask(
                        category="subtask",
                        title=capitalize_first(sub_title or clean_subtask or line),
                        goal_title=capitalize_first(matched_goal),
                        scheduled_date=sub_date,
                        scheduled_time=sub_time,
                        target_value=target_val,
                        step=step_val,
                        unit=unit_val,
                    )
                )
            else:
                clean_title, sched_date, sched_time = extract_and_clean_datetime_markers(
                    line, current_date=current_date, current_time=current_time
                )
                tasks.append(
                    ExtractedTask(
                        category="one_time",
                        title=capitalize_first(clean_title or line),
                        scheduled_date=sched_date,
                        scheduled_time=sched_time,
                        target_value=target_val,
                        step=step_val,
                        unit=unit_val,
                    )
                )

    if not tasks and text.strip():
        if is_grocery_text(text):
            tasks.append(
                ExtractedTask(
                    category="grocery",
                    title=clean_grocery_title(text),
                    scheduled_date=None,
                )
            )
        else:
            clean_title, sched_date, sched_time = extract_and_clean_datetime_markers(
                text.strip(), current_date=current_date, current_time=current_time
            )
            tasks.append(
                ExtractedTask(
                    category="one_time",
                    title=capitalize_first(clean_title or text.strip()),
                    scheduled_date=sched_date,
                    scheduled_time=sched_time,
                )
            )

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
                id="offline",
                name="Локальный режим (100% приватность)",
                description="Обработка на сервере без отправки данных во внешние AI-сервисы",
                is_configured=True,
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
                name="Google Gemini (Flash Latest / 3.5 Flash)",
                description="Официальные мультимодальные модели Google Gemini",
                is_configured=gemini_ready,
            ),
        ]

        active = user_active or settings.DEFAULT_AI_PROVIDER or "auto"
        # Validate active provider availability
        if active in ("offline", "none", "local"):
            active = "offline"
        elif active == "auto" and not (groq_ready or openrouter_ready or gemini_ready):
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
        current_time: Optional[str] = None,
    ) -> ExtractedTaskList:
        chosen = self.resolve_provider(provider)
        clean_chars = re.sub(r"[^\wа-яА-ЯёЁ\d]+", "", text or "")
        if len(clean_chars) < 2:
            return ExtractedTaskList(tasks=[])

        logger.info(f"Parsing text tasks with requested provider: {chosen}")

        relevant_goals = filter_relevant_goals(text, existing_goals)

        if chosen in ("offline", "none", "local"):
            logger.info("Parsing text tasks locally in offline/privacy mode")
            fallback_res = _fallback_parse(text, current_date, relevant_goals, current_time)
            return _postprocess_extracted_list(fallback_res, text, current_date, current_time)

        if chosen == "auto":
            # Auto-Fast cascade: Groq -> OpenRouter Free -> Gemini -> Fallback
            res = await self._parse_text_groq(text, current_date, relevant_goals, current_time)
            if res is not None:
                logger.info("Successfully parsed tasks via Groq (Fast)")
                return _postprocess_extracted_list(res, text, current_date, current_time)

            if settings.OPENROUTER_API_KEY and settings.OPENROUTER_API_KEY.strip():
                res = await self._parse_text_openrouter(text, current_date, relevant_goals, current_time)
                if res is not None:
                    logger.info("Successfully parsed tasks via OpenRouter Free")
                    return _postprocess_extracted_list(res, text, current_date, current_time)

            res = await self._parse_text_gemini(text, current_date, relevant_goals, current_time)
            if res is not None:
                logger.info("Successfully parsed tasks via Gemini Flash fallback")
                return _postprocess_extracted_list(res, text, current_date, current_time)

        elif chosen == "groq":
            res = await self._parse_text_groq(text, current_date, relevant_goals, current_time)
            if res is not None:
                return _postprocess_extracted_list(res, text, current_date, current_time)
            # Cascade fallbacks
            if settings.OPENROUTER_API_KEY and settings.OPENROUTER_API_KEY.strip():
                res = await self._parse_text_openrouter(text, current_date, relevant_goals, current_time)
                if res is not None:
                    return _postprocess_extracted_list(res, text, current_date, current_time)
            res = await self._parse_text_gemini(text, current_date, relevant_goals, current_time)
            if res is not None:
                return _postprocess_extracted_list(res, text, current_date, current_time)

        elif chosen == "openrouter":
            res = await self._parse_text_openrouter(text, current_date, relevant_goals, current_time)
            if res is not None:
                return _postprocess_extracted_list(res, text, current_date, current_time)
            res = await self._parse_text_groq(text, current_date, relevant_goals, current_time)
            if res is not None:
                return _postprocess_extracted_list(res, text, current_date, current_time)
            res = await self._parse_text_gemini(text, current_date, relevant_goals, current_time)
            if res is not None:
                return _postprocess_extracted_list(res, text, current_date, current_time)

        elif chosen == "gemini":
            res = await self._parse_text_gemini(text, current_date, relevant_goals, current_time)
            if res is not None:
                return _postprocess_extracted_list(res, text, current_date, current_time)
            res = await self._parse_text_groq(text, current_date, relevant_goals, current_time)
            if res is not None:
                return _postprocess_extracted_list(res, text, current_date, current_time)
            if settings.OPENROUTER_API_KEY and settings.OPENROUTER_API_KEY.strip():
                res = await self._parse_text_openrouter(text, current_date, relevant_goals, current_time)
                if res is not None:
                    return _postprocess_extracted_list(res, text, current_date, current_time)

        return _fallback_parse(text, current_date, relevant_goals, current_time)

    async def _parse_text_groq(
        self,
        text: str,
        current_date: date,
        existing_goals: Optional[List[str]] = None,
        current_time: Optional[str] = None,
    ) -> Optional[ExtractedTaskList]:
        client = self._get_groq_client()
        if not client:
            return None

        # Ultrafast models on Groq: Qwen 27B first (~200ms), then GPT-OSS 120B and 20B
        for model_name in [
            "qwen/qwen3.8-27b",
            "openai/gpt-oss-120b",
            "openai/gpt-oss-20b",
        ]:
            try:
                # Wrap with 6.0 second timeout to ensure snappy response
                coro = client.chat.completions.create(
                    model=model_name,
                    messages=[
                        {
                            "role": "system",
                            "content": (
                                _format_system_prompt(current_date, existing_goals, current_time)
                                + "\nОтвет должен быть строго в формате JSON с ключом 'tasks'."
                                + "\nВАЖНО: Все названия задач в поле 'title' и целей в 'goal_title' ОБЯЗАТЕЛЬНО начинай с заглавной (большой) буквы и очищай от вводных 'напомни мне' и маркеров времени (например: 'Сходить полить цветы', 'Позвонить врачу')! Время указывай в 'scheduled_time' в формате HH:MM. Все продукты питания, еду и напитки классифицируй как 'grocery' со scheduled_date: null, а в поле title указывай только название продукта без слова 'Купить' (например: 'Молоко 2 л', 'Хлеб')!"
                            ),
                        },
                        {"role": "user", "content": f"Текст сообщения пользователя:\n{text}"},
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.1,
                )
                response = await asyncio.wait_for(coro, timeout=6.0)
                msg = response.choices[0].message
                raw = msg.content
                if not raw or not raw.strip():
                    raw = getattr(msg, "reasoning", "") or ""
                parsed = _parse_json_tasks(raw, current_date=current_date, current_time=current_time)
                if parsed:
                    return parsed
            except Exception as e:
                logger.warning(f"Groq text model {model_name} failed: {type(e).__name__} - {e}")
                continue
        return None

    async def _parse_text_openrouter(
        self,
        text: str,
        current_date: date,
        existing_goals: Optional[List[str]] = None,
        current_time: Optional[str] = None,
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

        # Top tested and verified fast free models on OpenRouter
        free_models = [
            "liquid/lfm-2.5-2.6b:free",
            "openrouter/free",
            "dots-studio/dots-3-note-preview:free",
            "nvidia/nemotron-3.5-lightning:free",
        ]

        system_msg = (
            _format_system_prompt(current_date, existing_goals, current_time)
            + "\nОтвет должен быть строго в формате JSON с ключом 'tasks'."
            + "\nВАЖНО: Все названия задач в поле 'title' и целей в 'goal_title' ОБЯЗАТЕЛЬНО начинай с заглавной (большой) буквы и очищай от вводных 'напомни мне' и маркеров времени (например: 'Сходить полить цветы', 'Позвонить врачу')! Время указывай в 'scheduled_time' в формате HH:MM. Все продукты питания, еду и напитки классифицируй как 'grocery' со scheduled_date: null, а в поле title указывай только название продукта без слова 'Купить' (например: 'Молоко 2 л', 'Хлеб')!"
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
                        parsed = _parse_json_tasks(
                            content, current_date=current_date, current_time=current_time
                        )
                        if parsed is not None:
                            if parsed.tasks:
                                return parsed
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
        self,
        text: str,
        current_date: date,
        existing_goals: Optional[List[str]] = None,
        current_time: Optional[str] = None,
    ) -> Optional[ExtractedTaskList]:
        client = self._get_gemini_client()
        if not client:
            return None

        prompt = (
            _format_system_prompt(current_date, existing_goals, current_time)
            + f"\n\nТекст сообщения пользователя:\n{text}"
        )

        from google.genai import types

        # Official supported active models per documentation
        for model_name in [
            "gemini-flash-latest",
            "gemini-3.5-flash-lite",
            "gemini-3.5-flash",
            "gemini-3.8-flash",
            "gemini-3-flash-preview",
        ]:
            try:
                # Run synchronous call in thread pool with 10.0s timeout
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

                response = await asyncio.wait_for(asyncio.to_thread(_call), timeout=10.0)
                if response.parsed and isinstance(response.parsed, ExtractedTaskList) and response.parsed.tasks:
                    return response.parsed
                if response.text:
                    cleaned = response.text.strip()
                    if cleaned.startswith("```"):
                        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
                        cleaned = re.sub(r"\s*```$", "", cleaned)
                    return ExtractedTaskList.model_validate_json(cleaned)
            except Exception as e:
                logger.warning(f"Gemini model {model_name} failed: {type(e).__name__} - {e}")
                continue
        return None

    async def parse_audio_voice(
        self,
        audio_bytes: bytes,
        current_date: date,
        provider: Optional[str] = None,
        filename: Optional[str] = None,
        existing_goals: Optional[List[str]] = None,
        current_time: Optional[str] = None,
    ) -> ExtractedTaskList:
        chosen = self.resolve_provider(provider)
        logger.info(f"Parsing audio voice with provider setting: {chosen}")

        if len(audio_bytes) < 100:
            logger.warning("Audio payload too short (<100 bytes), returning empty tasks list")
            return ExtractedTaskList(tasks=[])

        mime_type, detected_fn = detect_audio_mime_and_filename(audio_bytes)
        fn = detected_fn or filename or "audio.webm"

        # 1. Local whisper.cpp (Primary engine with VAD & noise filtering)
        try:
            if await whisper_service.is_available():
                whisper_cpp_text = await whisper_service.transcribe(audio_bytes, filename=fn)
                if whisper_cpp_text and whisper_cpp_text.strip():
                    raw_text = strip_whisper_hallucinations(whisper_cpp_text.strip())
                    if not detect_hallucination_or_noise(raw_text):
                        logger.info(f"Audio transcribed successfully via local whisper.cpp: {raw_text[:100]}")
                        res = await self.parse_text_tasks(
                            raw_text,
                            current_date,
                            provider=chosen,
                            existing_goals=existing_goals,
                            current_time=current_time,
                        )
                        if res and res.tasks:
                            valid_tasks = [t for t in res.tasks if not detect_hallucination_or_noise(t.title)]
                            if valid_tasks:
                                return ExtractedTaskList(tasks=valid_tasks)
                        fallback_res = _fallback_parse(raw_text, current_date, existing_goals, current_time)
                        valid_fallback = [t for t in fallback_res.tasks if not detect_hallucination_or_noise(t.title)]
                        if valid_fallback:
                            return ExtractedTaskList(tasks=valid_fallback)
        except Exception as wce:
            logger.warning(f"Local whisper.cpp transcription error: {wce}")

        if chosen in ("offline", "none", "local"):
            logger.info("Local/Offline mode active: skipping cloud audio transcription fallbacks")
            return ExtractedTaskList(tasks=[])

        # 2. Groq Whisper (Cloud fallback ~300ms transcription with FFmpeg noise reduction, pause compression & neutral prompt)
        groq_client = self._get_groq_client()
        clean_audio_bytes, clean_fn = await whisper_service.preprocess_audio_ffmpeg(audio_bytes, filename=fn)
        if not clean_audio_bytes or len(clean_audio_bytes) <= 44:
            logger.info("Audio pre-processing yielded no speech (pure silence or sub-threshold background noise).")
            return ExtractedTaskList(tasks=[])

        if groq_client:
            transcription = None
            prompt_anchor = "Разговорная русская речь без субтитров. Запись повседневных дел и покупок."
            for whisper_model in ["whisper-large-v3-turbo", "whisper-large-v3"]:
                try:
                    transcription = await groq_client.audio.transcriptions.create(
                        file=(clean_fn, clean_audio_bytes),
                        model=whisper_model,
                        response_format="text",
                        temperature=0.0,
                        language="ru",
                        prompt=prompt_anchor,
                    )
                    if transcription:
                        break
                except Exception as we:
                    logger.warning(f"Groq Whisper {whisper_model} error: {we}")

            if transcription and str(transcription).strip():
                raw_text = strip_whisper_hallucinations(str(transcription).strip())
                if detect_hallucination_or_noise(raw_text):
                    logger.info(f"Groq Whisper transcription discarded as hallucination or noise: {raw_text!r}")
                else:
                    clean_speech = re.sub(r"[^\wа-яА-ЯёЁ\d]+", "", raw_text)
                    if len(clean_speech) >= 2:
                        logger.info(f"Audio transcribed successfully via Groq Whisper: {raw_text[:100]}")
                        # Parse through Auto-Fast cascade (Groq -> OpenRouter -> Gemini)
                        res = await self.parse_text_tasks(
                            raw_text,
                            current_date,
                            provider=chosen,
                            existing_goals=existing_goals,
                            current_time=current_time,
                        )
                        if res and res.tasks:
                            valid_tasks = [t for t in res.tasks if not detect_hallucination_or_noise(t.title)]
                            if valid_tasks:
                                return ExtractedTaskList(tasks=valid_tasks)
                        fallback_res = _fallback_parse(raw_text, current_date, existing_goals, current_time)
                        valid_fallback = [t for t in fallback_res.tasks if not detect_hallucination_or_noise(t.title)]
                        if valid_fallback:
                            return ExtractedTaskList(tasks=valid_fallback)
                    else:
                        logger.info(f"Whisper transcription discarded as noise or punctuation: {raw_text!r}")

        # 3. Fallback to Gemini multimodal audio if Groq client not available or returned hallucination
        if self._get_gemini_client():
            gemini_payload = clean_audio_bytes if (clean_audio_bytes and len(clean_audio_bytes) > 44) else audio_bytes
            gemini_mime = "audio/wav" if (clean_audio_bytes and len(clean_audio_bytes) > 44) else mime_type
            res = await self._parse_audio_gemini(
                gemini_payload,
                current_date,
                gemini_mime,
                existing_goals=existing_goals,
                current_time=current_time,
            )
            if res and res.tasks:
                return _postprocess_extracted_list(res, None, current_date, current_time)

        logger.warning("Audio transcription/parsing produced no valid speech tasks")
        return ExtractedTaskList(tasks=[])

    async def _parse_audio_gemini(
        self,
        audio_bytes: bytes,
        current_date: date,
        mime_type: str,
        existing_goals: Optional[List[str]] = None,
        current_time: Optional[str] = None,
    ) -> Optional[ExtractedTaskList]:
        client = self._get_gemini_client()
        if not client:
            return None

        prompt = (
            _format_system_prompt(current_date, existing_goals, current_time)
            + "\n\nРасшифруй это аудиосообщение и извлеки задачи строго в формате JSON."
        )

        from google.genai import types

        for model_name in [
            "gemini-flash-latest",
            "gemini-3.5-flash-lite",
            "gemini-3.5-flash",
            "gemini-3.8-flash",
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

                response = await asyncio.wait_for(asyncio.to_thread(_call), timeout=12.0)
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
                    fb = _fallback_parse(cleaned, current_date, current_time=current_time)
                    if fb and fb.tasks:
                        return fb
            except Exception as e:
                logger.warning(f"Gemini audio model {model_name} failed: {type(e).__name__} - {e}")
                continue
        return None


ai_service = AIService()
