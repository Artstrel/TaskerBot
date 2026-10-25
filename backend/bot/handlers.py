import io
import uuid
from datetime import datetime, timedelta, date
from typing import Dict, Any

from aiogram import Router, F
from aiogram.filters import CommandStart, Command
from aiogram.types import Message, CallbackQuery, ContentType

from backend.database import AsyncSessionLocal
from backend.crud import (
    get_or_create_user,
    get_user_now,
    get_user_effective_date_and_urgency,
    get_day_summary,
    get_user_goals,
    get_user_routines_with_status,
    toggle_one_time_task,
    postpone_task,
    delete_one_time_task,
    toggle_routine_completion,
    delete_routine,
    create_routine,
    create_one_time_task,
    update_task_progress,
    update_routine_progress,
    create_goal,
    add_subtask_to_goal,
    toggle_goal,
    delete_goal,
    update_user,
    get_user_groceries,
    create_grocery_item,
    update_grocery_item,
    clear_completed_groceries,
)
from backend.schemas import ExtractedTaskList, UserUpdate
from backend.ai_service import ai_service
from backend.bot.keyboards import (
    get_main_menu,
    get_webapp_inline_keyboard,
    get_task_actions_kb,
    get_routine_actions_kb,
    get_parsed_tasks_confirmation_kb,
    get_goal_actions_kb,
    get_subtask_kb,
    get_settings_kb,
    get_groceries_keyboard,
)
from backend.bot.bot_instance import bot

router = Router()

# In-memory temporary cache for tasks pending confirmation
PENDING_TASKS_CACHE: Dict[str, Dict[str, Any]] = {}

# In-memory tracker for users waiting to add a subtask to a goal: telegram_id -> goal_id
USER_WAITING_FOR_GOAL_STEP: Dict[int, int] = {}


def render_progress_bar(percentage: int, length: int = 8) -> str:
    filled = int(round(length * (percentage / 100.0)))
    return "█" * filled + "░" * (length - filled)


@router.message(CommandStart())
async def handle_start(message: Message):
    async with AsyncSessionLocal() as session:
        user = await get_or_create_user(
            session,
            telegram_id=message.from_user.id,
            username=message.from_user.username,
            first_name=message.from_user.first_name,
        )

    welcome_text = (
        f"👋 <b>Привет, {message.from_user.first_name or 'друг'}!</b>\n\n"
        "Я <b>TaskerBot</b> — твой персональный трекер задач, привычек и целей.\n\n"
        "✨ <b>Что я умею:</b>\n"
        "• <b>🔄 Рутинные задачи:</b> повторяются каждый день со стриками и напоминаниями за 6, 3 и 1 ч.\n"
        "• <b>⚡️ Разовые задачи:</b> если не успел выполнить, автоматически переносятся со статусом просрочки.\n"
        "• <b>🎯 Глобальные цели:</b> проекты с дедлайнами и подзадачами.\n"
        "• <b>🎙 Голосовой ввод через Gemini API:</b> надиктуй мне голосовое, и я сам разберу и классифицирую задачи!\n\n"
        "👇 <i>Используй кнопки меню или просто напиши / надиктуй свои задачи!</i>"
    )

    await message.answer(
        welcome_text,
        reply_markup=get_main_menu(),
    )


@router.message(Command("help"))
@router.message(F.text == "💡 Помощь")
async def handle_help(message: Message):
    help_text = (
        "📖 <b>Как пользоваться TaskerBot:</b>\n\n"
        "<b>1. Ввод задач голосом или текстом:</b>\n"
        "Просто отправь голосовое сообщение или текст в свободной форме. Например:\n"
        "<i>«Каждый день пить витамины, завтра заехать в сервис и для цели Ремонт купить плитку»</i>.\n"
        "Искусственный интеллект автоматически разобьет фразу на задачи и предложит сохранить их в 1 клик.\n\n"
        "<b>2. Категории задач:</b>\n"
        "• <b>Рутина:</b> ежедневные дела. Напоминания приходят за 6, 3 и 1 час до конца дня.\n"
        "• <b>Разовые задачи:</b> задачи дня. Пропущенные переносятся на завтра и закрепляются сверху.\n"
        "• <b>Цели (Goals):</b> масштабные проекты, шаги которых можно брать на сегодня.\n\n"
        "<b>3. WebApp интерфейс:</b>\n"
        "Нажмите кнопку <b>«📱 Открыть WebApp»</b> для красивого интерактивного управления со смартфона."
    )
    await message.answer(help_text, reply_markup=get_webapp_inline_keyboard())


@router.message(Command("today"))
@router.message(F.text == "📋 Задачи на сегодня")
async def handle_today(message: Message):
    async with AsyncSessionLocal() as session:
        user = await get_or_create_user(session, message.from_user.id)
        summary = await get_day_summary(session, user)

    # Urgency badge
    urgency_map = {
        "critical_1h": "🚨 <b>КРИТИЧНО! Осталось менее 1 часа до конца дня!</b>",
        "warning_3h": "🟠 <b>Внимание: осталось 3 часа до конца дня!</b>",
        "warning_6h": "🟡 <b>Напоминание: осталось 6 часов до конца дня.</b>",
        "normal": f"🟢 До конца дня: <b>~{summary.hours_left_in_day:.1f} ч.</b>",
    }
    urgency_line = urgency_map.get(summary.urgency_level, "")

    text_parts = [
        f"📅 <b>Задачи на {summary.date.strftime('%d.%m.%Y')}</b>",
        urgency_line,
        f"📊 Прогресс дня: <b>{summary.completed_count}/{summary.total_count}</b> задач выполнено.\n",
    ]

    # 1. Overdue section (pinned on top!)
    if summary.overdue_tasks:
        text_parts.append("⚠️ <b>ПРОСРОЧЕННЫЕ ЗАДАЧИ (Перенесены):</b>")
        for t in summary.overdue_tasks:
            status_icon = "✅" if t.is_completed else "🔴"
            days_text = f"(+{t.overdue_days} дн.)" if t.overdue_days > 0 else "(со вчера)"
            prog_text = f" [{t.current_value:g}/{t.target_value:g} {t.unit}]" if t.target_value else ""
            goal_badge = f" [🎯 {t.goal_title}]" if t.goal_title else ""
            text_parts.append(f"{status_icon} <b>{t.title}</b>{prog_text} <i>{days_text}</i>{goal_badge}")
        text_parts.append("")

    # 2. Routine section
    if summary.routine_tasks:
        text_parts.append("🔄 <b>РУТИННЫЕ ПРИВЫЧКИ (Каждый день):</b>")
        for r in summary.routine_tasks:
            icon = "✅" if r.is_completed_today else "⏳"
            streak_text = f"🔥 {r.current_streak} дн." if r.current_streak > 0 else ""
            prog_text = f" [{r.current_value:g}/{r.target_value:g} {r.unit}]" if r.target_value else ""
            text_parts.append(f"{icon} <b>{r.title}</b>{prog_text} {streak_text}")
        text_parts.append("")

    # 3. Today's one-time tasks
    if summary.today_tasks:
        text_parts.append("📝 <b>РАЗОВЫЕ ЗАДАЧИ НА СЕГОДНЯ:</b>")
        for t in summary.today_tasks:
            icon = "✅" if t.is_completed else "▫️"
            prog_text = f" [{t.current_value:g}/{t.target_value:g} {t.unit}]" if t.target_value else ""
            goal_badge = f" [🎯 {t.goal_title}]" if t.goal_title else ""
            text_parts.append(f"{icon} <b>{t.title}</b>{prog_text}{goal_badge}")
        text_parts.append("")

    if not summary.overdue_tasks and not summary.routine_tasks and not summary.today_tasks:
        text_parts.append("🎉 <i>На сегодня пока нет задач! Надиктуй голосом или напиши, чтобы добавить.</i>")

    await message.answer("\n".join(text_parts))

    # Send actionable inline items for uncompleted tasks (overdue & routines first)
    if summary.overdue_tasks:
        for t in summary.overdue_tasks[:3]:  # Top overdue
            days_str = f"+{t.overdue_days} дн." if t.overdue_days > 0 else "со вчера"
            prog_str = f"\n📊 Прогресс: <b>{t.current_value:g}/{t.target_value:g} {t.unit}</b>" if t.target_value else ""
            await message.answer(
                f"⚠️ <b>Просрочено ({days_str}):</b> {t.title}{prog_str}",
                reply_markup=get_task_actions_kb(
                    t.id,
                    t.is_completed,
                    is_overdue=True,
                    target_value=t.target_value,
                    step=t.step,
                    unit=t.unit,
                ),
            )

    for r in summary.routine_tasks:
        if not r.is_completed_today:
            streak_str = f" (Стрик: 🔥 {r.current_streak})" if r.current_streak > 0 else ""
            prog_str = f"\n📊 Прогресс: <b>{r.current_value:g}/{r.target_value:g} {r.unit}</b>" if r.target_value else ""
            await message.answer(
                f"🔄 <b>Рутина:</b> {r.title}{streak_str}{prog_str}",
                reply_markup=get_routine_actions_kb(
                    r.id,
                    r.is_completed_today,
                    target_value=r.target_value,
                    step=r.step,
                    unit=r.unit,
                ),
            )

    for t in summary.today_tasks:
        if not t.is_completed:
            prog_str = f"\n📊 Прогресс: <b>{t.current_value:g}/{t.target_value:g} {t.unit}</b>" if t.target_value else ""
            await message.answer(
                f"⚡️ <b>Задача:</b> {t.title}{prog_str}",
                reply_markup=get_task_actions_kb(
                    t.id,
                    t.is_completed,
                    is_overdue=False,
                    target_value=t.target_value,
                    step=t.step,
                    unit=t.unit,
                ),
            )


# --- Groceries Handlers ---
@router.message(Command("groceries"))
@router.message(F.text == "🛒 Список продуктов")
async def handle_groceries(message: Message):
    async with AsyncSessionLocal() as session:
        user = await get_or_create_user(session, message.from_user.id)
        groceries = await get_user_groceries(session, user.telegram_id)

    if not groceries.active_items and not groceries.completed_items:
        await message.answer(
            "🛒 <b>Ваш список продуктов пуст.</b>\n\nВы можете надиктовать голосом или написать, что нужно купить (например: <i>«Купить 2 литра молока, хлеб и яйца»</i>), либо добавить через WebApp.",
            reply_markup=get_main_menu(),
        )
        return

    lines = ["🛒 <b>Список продуктов:</b>\n"]
    if groceries.active_items:
        lines.append("<b>Нужно купить:</b>")
        for item in groceries.active_items:
            qty_str = (
                f" — {item.target_value:g} {item.unit}"
                if item.target_value and item.unit
                else (f" — {item.target_value:g}" if item.target_value else "")
            )
            lines.append(f"▫️ {item.title}{qty_str}")

    if groceries.completed_items:
        lines.append("\n<b>Куплено:</b>")
        for item in groceries.completed_items:
            lines.append(f"<s>▪️ {item.title}</s>")

    lines.append(f"\n<i>Куплено: {groceries.completed_count} из {groceries.total_count}</i>")

    await message.answer(
        "\n".join(lines),
        reply_markup=get_groceries_keyboard(groceries.active_items),
    )


@router.callback_query(F.data.startswith("check_grocery:"))
async def cb_check_grocery(query: CallbackQuery):
    item_id = int(query.data.split(":")[1])
    async with AsyncSessionLocal() as session:
        user = await get_or_create_user(session, query.from_user.id)
        await update_grocery_item(session, item_id=item_id, user_id=user.telegram_id, is_completed=True)
        groceries = await get_user_groceries(session, user.telegram_id)

    await query.answer("Отмечено как купленное! ✅")
    lines = ["🛒 <b>Список продуктов:</b>\n"]
    if groceries.active_items:
        lines.append("<b>Нужно купить:</b>")
        for item in groceries.active_items:
            qty_str = (
                f" — {item.target_value:g} {item.unit}"
                if item.target_value and item.unit
                else (f" — {item.target_value:g}" if item.target_value else "")
            )
            lines.append(f"▫️ {item.title}{qty_str}")

    if groceries.completed_items:
        lines.append("\n<b>Куплено:</b>")
        for item in groceries.completed_items:
            lines.append(f"<s>▪️ {item.title}</s>")

    lines.append(f"\n<i>Куплено: {groceries.completed_count} из {groceries.total_count}</i>")

    try:
        await query.message.edit_text(
            "\n".join(lines),
            reply_markup=get_groceries_keyboard(groceries.active_items),
        )
    except Exception:
        pass


@router.callback_query(F.data == "clear_groceries")
async def cb_clear_groceries(query: CallbackQuery):
    async with AsyncSessionLocal() as session:
        user = await get_or_create_user(session, query.from_user.id)
        count = await clear_completed_groceries(session, user.telegram_id)
        groceries = await get_user_groceries(session, user.telegram_id)

    await query.answer(f"Очищено купленных: {count}")
    lines = ["🛒 <b>Список продуктов:</b>\n"]
    if groceries.active_items:
        lines.append("<b>Нужно купить:</b>")
        for item in groceries.active_items:
            qty_str = (
                f" — {item.target_value:g} {item.unit}"
                if item.target_value and item.unit
                else (f" — {item.target_value:g}" if item.target_value else "")
            )
            lines.append(f"▫️ {item.title}{qty_str}")
    else:
        lines.append("<i>Все продукты куплены! Список чист.</i>")

    lines.append(f"\n<i>Куплено: {groceries.completed_count} из {groceries.total_count}</i>")

    try:
        await query.message.edit_text(
            "\n".join(lines),
            reply_markup=get_groceries_keyboard(groceries.active_items),
        )
    except Exception:
        pass


@router.message(Command("goals"))
@router.message(F.text == "🎯 Мои цели")
async def handle_goals(message: Message):
    async with AsyncSessionLocal() as session:
        user = await get_or_create_user(session, message.from_user.id)
        goals = await get_user_goals(session, user.telegram_id)

    if not goals:
        await message.answer(
            "🎯 <b>У вас пока нет активных целей!</b>\n\n"
            "Чтобы создать цель, напишите например:\n"
            "<i>«Цель: Запустить онлайн-курс до 1 декабря»</i>\n"
            "или откройте WebApp для добавления.",
            reply_markup=get_webapp_inline_keyboard(),
        )
        return

    await message.answer("🎯 <b>Ваши глобальные цели и проекты:</b>")

    for g in goals:
        bar = render_progress_bar(g.progress_percentage)
        deadline_text = f" • Дедлайн: {g.target_date.strftime('%d.%m.%Y')}" if g.target_date else ""
        text = (
            f"🎯 <b>{g.title}</b>\n"
            f"Прогресс: <code>[{bar}]</code> <b>{g.progress_percentage}%</b> "
            f"({g.completed_subtasks}/{g.total_subtasks} шагов){deadline_text}\n"
        )
        if g.description:
            text += f"<i>{g.description}</i>\n"

        if g.subtasks:
            text += "\n<b>Шаги цели:</b>\n"
            for st in g.subtasks:
                icon = "✅" if st.is_completed else "▫️"
                text += f"{icon} {st.title}\n"
        elif not g.is_completed:
            text += "\n⚠️ <i>0 шагов — цель не отслеживается! Нажмите «➕ Добавить шаг», чтобы начать.</i>\n"

        await message.answer(text, reply_markup=get_goal_actions_kb(g.id, g.is_completed))


@router.message(Command("routines"))
@router.message(F.text == "🔄 Рутины")
async def handle_routines(message: Message):
    async with AsyncSessionLocal() as session:
        user = await get_or_create_user(session, message.from_user.id)
        now = get_user_now(user.timezone)
        effective_date, _, _ = get_user_effective_date_and_urgency(now, user.day_end_time)
        routines = await get_user_routines_with_status(session, user.telegram_id, effective_date)

    if not routines:
        await message.answer(
            "🔄 <b>У вас пока нет регулярных привычек!</b>\n\n"
            "Чтобы добавить рутину, напишите например:\n"
            "<i>«Каждый день пить 2 литра воды»</i> или <i>«Ежедневно читать 20 страниц»</i>."
        )
        return

    await message.answer("🔄 <b>Ваши ежедневные привычки:</b>")
    for r in routines:
        status = "✅ Выполнено сегодня" if r.is_completed_today else "⏳ Ожидает выполнения"
        prog_text = f"\nПрогресс: 📊 <b>{r.current_value:g}/{r.target_value:g} {r.unit}</b>" if r.target_value else ""
        text = (
            f"• <b>{r.title}</b>{prog_text}\n"
            f"Статус: {status}\n"
            f"Текущий стрик: 🔥 <b>{r.current_streak} дн.</b> | Рекорд: 🏆 <b>{r.best_streak} дн.</b>"
        )
        await message.answer(
            text,
            reply_markup=get_routine_actions_kb(
                r.id,
                r.is_completed_today,
                target_value=r.target_value,
                step=r.step,
                unit=r.unit,
            ),
        )


@router.message(Command("webapp"))
@router.message(Command("app"))
@router.message(F.text == "📱 Открыть WebApp")
async def handle_open_webapp(message: Message):
    await message.answer(
        "📱 <b>Интерфейс Telegram WebApp:</b>\n\n"
        "Нажмите на кнопку ниже, чтобы открыть визуальный дашборд с целями, графиками и задачами:",
        reply_markup=get_webapp_inline_keyboard(),
    )


@router.message(Command("settings"))
@router.message(F.text == "⚙️ Настройки")
async def handle_settings(message: Message):
    async with AsyncSessionLocal() as session:
        user = await get_or_create_user(session, message.from_user.id)

    text = (
        "⚙️ <b>Настройки уведомлений и расписания:</b>\n\n"
        f"🌍 Часовой пояс: <b>{user.timezone}</b>\n"
        f"🌙 Конец дня: <b>{user.day_end_time}</b>\n"
        f"☀️ Утренний дайджест: <b>{user.morning_digest_time or '09:00'}</b>\n\n"
        "Нажмите на кнопку, чтобы переключить напоминание:"
    )
    await message.answer(
        text,
        reply_markup=get_settings_kb(
            reminder_6h=user.reminder_6h_enabled,
            reminder_3h=user.reminder_3h_enabled,
            reminder_1h=user.reminder_1h_enabled,
            morning_digest=user.morning_digest_enabled,
            evening_digest=user.evening_digest_enabled,
            praise_notifications=getattr(user, "praise_notifications_enabled", True),
        ),
    )


# --- Voice Message Handler ---
@router.message(F.voice | F.audio)
async def handle_voice_message(message: Message):
    async with AsyncSessionLocal() as session:
        user = await get_or_create_user(session, message.from_user.id)
        now = get_user_now(user.timezone)
        effective_date, _, _ = get_user_effective_date_and_urgency(now, user.day_end_time)
        user_provider = user.ai_provider

        goals = await get_user_goals(session, message.from_user.id)
        goal_titles = [g.title for g in goals if not g.is_completed]

    provider_label = (
        "Groq"
        if user_provider == "groq"
        else ("OpenRouter" if user_provider == "openrouter" else ("Auto-Cascade" if user_provider == "auto" else "Gemini"))
    )
    status_msg = await message.answer(f"🎙 <i>Распознаю аудио через {provider_label}...</i>")

    try:
        file_id = message.voice.file_id if message.voice else message.audio.file_id
        file_info = await bot.get_file(file_id)

        file_bytes_io = io.BytesIO()
        await bot.download_file(file_info.file_path, file_bytes_io)
        audio_bytes = file_bytes_io.getvalue()

        extracted = await ai_service.parse_audio_voice(
            audio_bytes, effective_date, provider=user_provider, existing_goals=goal_titles
        )
        await status_msg.delete()

        if not extracted.tasks:
            await message.answer(
                "🎙 <i>Не удалось разобрать слова в аудиосообщении. Попробуйте надиктовать чуть громче и ближе к микрофону, либо отправьте задачу текстом.</i>"
            )
            return

        if message.from_user.id in USER_WAITING_FOR_GOAL_STEP:
            goal_id = USER_WAITING_FOR_GOAL_STEP.pop(message.from_user.id)
            first_title = extracted.tasks[0].title if extracted.tasks else None
            if first_title:
                async with AsyncSessionLocal() as session:
                    subtask = await add_subtask_to_goal(
                        session, goal_id=goal_id, user_id=message.from_user.id, title=first_title, scheduled_date=effective_date
                    )
                if subtask:
                    await message.answer(
                        f"✅ Шаг <b>«{subtask.title}»</b> успешно добавлен к цели из голосового сообщения!",
                        reply_markup=get_webapp_inline_keyboard(),
                    )
                    return

        await present_parsed_tasks(message, extracted, effective_date)

    except Exception as e:
        await status_msg.edit_text(f"❌ Ошибка обработки голосового сообщения: {e}")


# --- Natural Language Text Handler ---
@router.message(F.text)
async def handle_text_message(message: Message):
    text = message.text.strip()

    if text == "/cancel":
        if message.from_user.id in USER_WAITING_FOR_GOAL_STEP:
            del USER_WAITING_FOR_GOAL_STEP[message.from_user.id]
            await message.answer("❌ Добавление шага к цели отменено.")
            return

    if message.from_user.id in USER_WAITING_FOR_GOAL_STEP:
        goal_id = USER_WAITING_FOR_GOAL_STEP.pop(message.from_user.id)
        async with AsyncSessionLocal() as session:
            user = await get_or_create_user(session, message.from_user.id)
            now = get_user_now(user.timezone)
            effective_date, _, _ = get_user_effective_date_and_urgency(now, user.day_end_time)
            subtask = await add_subtask_to_goal(
                session, goal_id=goal_id, user_id=message.from_user.id, title=text, scheduled_date=effective_date
            )
        if subtask:
            await message.answer(
                f"✅ Шаг <b>«{subtask.title}»</b> успешно добавлен к цели!",
                reply_markup=get_webapp_inline_keyboard(),
            )
        else:
            await message.answer("❌ Не удалось добавить шаг (цель не найдена).")
        return

    # Skip command or menu button if not handled above
    if text.startswith("/") or text in [
        "📋 Задачи на сегодня",
        "🛒 Список продуктов",
        "🎯 Мои цели",
        "🔄 Рутины",
        "📱 Открыть WebApp",
        "⚙️ Настройки",
        "💡 Помощь",
    ]:
        return

    status_msg = await message.answer("🤖 <i>Анализирую текст...</i>")

    try:
        async with AsyncSessionLocal() as session:
            user = await get_or_create_user(session, message.from_user.id)
            now = get_user_now(user.timezone)
            effective_date, _, _ = get_user_effective_date_and_urgency(now, user.day_end_time)
            user_provider = user.ai_provider
            goals = await get_user_goals(session, user.telegram_id)
            goal_titles = [g.title for g in goals if not g.is_completed]

        extracted = await ai_service.parse_text_tasks(
            text, effective_date, provider=user_provider, existing_goals=goal_titles
        )
        await status_msg.delete()

        if not extracted.tasks:
            await message.answer("🤔 Не удалось распознать задачу в тексте.")
            return

        await present_parsed_tasks(message, extracted, effective_date)

    except Exception as e:
        await status_msg.edit_text(f"❌ Ошибка распознавания: {e}")


async def present_parsed_tasks(message: Message, extracted: ExtractedTaskList, effective_date: date):
    cache_id = str(uuid.uuid4())[:8]
    PENDING_TASKS_CACHE[cache_id] = {
        "user_id": message.from_user.id,
        "tasks": list(extracted.tasks),
        "effective_date": effective_date,
    }

    category_labels = {
        "routine": "🔄 Рутина (ежедневно)",
        "one_time": "⚡️ Разовая задача",
        "goal": "🎯 Глобальная цель",
        "subtask": "▫️ Подзадача цели",
        "grocery": "🛒 Продукт/Покупка",
    }

    msg_lines = [
        "✨ <b>Распознанные задачи:</b>\n",
    ]

    for idx, t in enumerate(extracted.tasks, 1):
        cat_badge = category_labels.get(t.category, "📝 Задача")
        date_str = f" (на {t.scheduled_date})" if t.scheduled_date else ""
        goal_str = f" [к цели: {t.goal_title}]" if t.goal_title else ""
        msg_lines.append(f"{idx}. <b>{t.title}</b>\n   ↳ <i>{cat_badge}{date_str}{goal_str}</i>")

    msg_lines.append("\nСохранить эти задачи? Вы можете удалить лишние пункты кнопками ниже.")

    await message.answer(
        "\n".join(msg_lines),
        reply_markup=get_parsed_tasks_confirmation_kb(cache_id, len(extracted.tasks)),
    )


# --- Callback Handlers ---
@router.callback_query(F.data.startswith("del_parsed:"))
async def cb_del_parsed_item(query: CallbackQuery):
    parts = query.data.split(":")
    cache_id = parts[1]
    item_idx = int(parts[2])

    cached = PENDING_TASKS_CACHE.get(cache_id)
    if not cached:
        await query.answer("Срок действия подтверждения истек.", show_alert=True)
        return

    tasks = cached["tasks"]
    if 0 <= item_idx < len(tasks):
        removed = tasks.pop(item_idx)
        await query.answer(f"Исключено: {removed.title[:25]}")
    else:
        await query.answer()
        return

    if not tasks:
        PENDING_TASKS_CACHE.pop(cache_id, None)
        await query.message.edit_text("❌ Все задачи были исключены. Ничего не сохранено.")
        return

    category_labels = {
        "routine": "🔄 Рутина (ежедневно)",
        "one_time": "⚡️ Разовая задача",
        "goal": "🎯 Глобальная цель",
        "subtask": "▫️ Подзадача цели",
        "grocery": "🛒 Продукт/Покупка",
    }
    msg_lines = ["✨ <b>Оставшиеся задачи:</b>\n"]
    for idx, t in enumerate(tasks, 1):
        cat_badge = category_labels.get(t.category, "📝 Задача")
        date_str = f" (на {t.scheduled_date})" if t.scheduled_date else ""
        goal_str = f" [к цели: {t.goal_title}]" if t.goal_title else ""
        msg_lines.append(f"{idx}. <b>{t.title}</b>\n   ↳ <i>{cat_badge}{date_str}{goal_str}</i>")

    msg_lines.append("\nСохранить оставшиеся задачи?")

    await query.message.edit_text(
        "\n".join(msg_lines),
        reply_markup=get_parsed_tasks_confirmation_kb(cache_id, len(tasks)),
    )

@router.callback_query(F.data.startswith("save_tasks:"))
async def cb_save_tasks(query: CallbackQuery):
    cache_id = query.data.split(":")[1]
    cached = PENDING_TASKS_CACHE.pop(cache_id, None)

    if not cached:
        await query.answer("Срок действия подтверждения истек.", show_alert=True)
        return

    tasks = cached["tasks"]
    user_id = cached["user_id"]
    effective_date = cached["effective_date"]

    async with AsyncSessionLocal() as session:
        created_count = 0
        newly_created_goals = {}

        # 1. First pass: create all goals so subtasks can link to them
        for t in tasks:
            if t.category == "goal":
                target = None
                if t.target_date:
                    try:
                        target = datetime.strptime(t.target_date, "%Y-%m-%d").date()
                    except Exception:
                        pass
                g = await create_goal(session, user_id=user_id, title=t.title, description=t.description, target_date=target)
                if g and g.title:
                    newly_created_goals[g.title.strip().lower()] = g
                created_count += 1

        # 2. Second pass: create routines, subtasks, and one-time tasks
        existing_goals = await get_user_goals(session, user_id)

        for t in tasks:
            if t.category == "routine":
                await create_routine(
                    session,
                    user_id=user_id,
                    title=t.title,
                    description=t.description,
                    target_value=t.target_value,
                    step=t.step,
                    unit=t.unit,
                )
                created_count += 1
            elif t.category == "subtask":
                matched_goal = None
                if t.goal_title:
                    gt_clean = t.goal_title.strip().lower()
                    # Check newly created goals first
                    for title_k, g_obj in newly_created_goals.items():
                        if gt_clean in title_k or title_k in gt_clean:
                            matched_goal = g_obj
                            break
                    # Then check existing goals
                    if not matched_goal and existing_goals:
                        for eg in existing_goals:
                            if gt_clean in eg.title.lower() or eg.title.lower() in gt_clean:
                                matched_goal = eg
                                break
                goal_id = matched_goal.id if matched_goal else (existing_goals[0].id if existing_goals else None)

                sched_date = effective_date
                if t.scheduled_date:
                    try:
                        sched_date = datetime.strptime(t.scheduled_date, "%Y-%m-%d").date()
                    except Exception:
                        pass

                await create_one_time_task(
                    session,
                    user_id=user_id,
                    title=t.title,
                    scheduled_date=sched_date,
                    goal_id=goal_id,
                    target_value=t.target_value,
                    step=t.step,
                    unit=t.unit,
                )
                created_count += 1
            elif t.category == "grocery":
                await create_grocery_item(
                    session,
                    user_id=user_id,
                    title=t.title,
                    target_value=t.target_value,
                    step=t.step,
                    unit=t.unit,
                )
                created_count += 1
            else:  # one_time
                sched_date = effective_date
                if t.scheduled_date:
                    try:
                        sched_date = datetime.strptime(t.scheduled_date, "%Y-%m-%d").date()
                    except Exception:
                        pass
                await create_one_time_task(
                    session,
                    user_id=user_id,
                    title=t.title,
                    scheduled_date=sched_date,
                    target_value=t.target_value,
                    step=t.step,
                    unit=t.unit,
                )
                created_count += 1

    await query.message.edit_text(f"✅ <b>Успешно сохранено задач: {created_count}!</b>")
    await query.answer("Сохранено!")


@router.callback_query(F.data.startswith("cancel_tasks:"))
async def cb_cancel_tasks(query: CallbackQuery):
    cache_id = query.data.split(":")[1]
    PENDING_TASKS_CACHE.pop(cache_id, None)
    await query.message.edit_text("❌ Добавление задач отменено.")
    await query.answer()


@router.callback_query(F.data.startswith("task_prog:"))
async def cb_task_prog(query: CallbackQuery):
    parts = query.data.split(":")
    task_id = int(parts[1])
    delta = float(parts[2])

    async with AsyncSessionLocal() as session:
        user = await get_or_create_user(session, query.from_user.id)
        task = await update_task_progress(session, task_id=task_id, user_id=user.telegram_id, delta=delta)

    if not task:
        await query.answer("Задача не найдена.", show_alert=True)
        return

    val_str = f"{task.current_value:g}/{task.target_value:g} {task.unit or ''}"
    status_msg = f"✅ Цель достигнута! ({val_str})" if task.is_completed else f"Прогресс: {val_str}"
    await query.answer(status_msg)

    try:
        status_icon = "✅" if task.is_completed else "▫️"
        text = f"{status_icon} <b>Задача:</b> {task.title}\n📊 Прогресс: <b>{val_str}</b>"
        await query.message.edit_text(
            text,
            reply_markup=get_task_actions_kb(
                task.id,
                task.is_completed,
                is_overdue=task.is_overdue,
                target_value=task.target_value,
                step=task.step,
                unit=task.unit,
            ),
        )
    except Exception:
        pass


@router.callback_query(F.data.startswith("routine_prog:"))
async def cb_routine_prog(query: CallbackQuery):
    parts = query.data.split(":")
    routine_id = int(parts[1])
    delta = float(parts[2])

    async with AsyncSessionLocal() as session:
        user = await get_or_create_user(session, query.from_user.id)
        now = get_user_now(user.timezone)
        effective_date, _, _ = get_user_effective_date_and_urgency(now, user.day_end_time)
        res = await update_routine_progress(
            session, routine_id=routine_id, user_id=user.telegram_id, target_date=effective_date, delta=delta
        )

    if not res:
        await query.answer("Рутина не найдена.", show_alert=True)
        return

    val_str = f"{res.current_value:g}/{res.target_value:g} {res.unit or ''}"
    status_msg = f"🔥 Привычка выполнена! ({val_str}) Стрик: {res.current_streak} дн." if res.is_completed_today else f"Прогресс: {val_str}"
    await query.answer(status_msg)

    try:
        icon = "✅" if res.is_completed_today else "⏳"
        streak_str = f" | 🔥 {res.current_streak} дн." if res.current_streak > 0 else ""
        text = f"{icon} <b>Рутина:</b> {res.title}\n📊 Прогресс: <b>{val_str}</b>{streak_str}"
        await query.message.edit_text(
            text,
            reply_markup=get_routine_actions_kb(
                res.id,
                res.is_completed_today,
                target_value=res.target_value,
                step=res.step,
                unit=res.unit,
            ),
        )
    except Exception:
        pass


@router.callback_query(F.data.startswith("task_toggle:"))
async def cb_task_toggle(query: CallbackQuery):
    task_id = int(query.data.split(":")[1])
    async with AsyncSessionLocal() as session:
        task = await toggle_one_time_task(session, task_id=task_id, user_id=query.from_user.id)

    if not task:
        await query.answer("Задача не найдена.", show_alert=True)
        return

    status = "выполнена ✅" if task.is_completed else "возвращена в работу ⏳"
    await query.answer(f"Задача {status}")
    try:
        await query.message.edit_reply_markup(
            reply_markup=get_task_actions_kb(
                task.id,
                task.is_completed,
                task.is_overdue,
                target_value=task.target_value,
                step=task.step,
                unit=task.unit,
            )
        )
    except Exception:
        pass


@router.callback_query(F.data.startswith("task_postpone:"))
async def cb_task_postpone(query: CallbackQuery):
    task_id = int(query.data.split(":")[1])
    tomorrow = date.today() + timedelta(days=1)
    async with AsyncSessionLocal() as session:
        task = await postpone_task(session, task_id=task_id, user_id=query.from_user.id, new_date=tomorrow)

    if not task:
        await query.answer("Задача не найдена.", show_alert=True)
        return

    await query.answer("Перенесено на завтра!")
    await query.message.edit_text(f"➡️ Задача <b>{task.title}</b> перенесена на завтра ({tomorrow.strftime('%d.%m')})")


@router.callback_query(F.data.startswith("task_delete:"))
async def cb_task_delete(query: CallbackQuery):
    task_id = int(query.data.split(":")[1])
    async with AsyncSessionLocal() as session:
        success = await delete_one_time_task(session, task_id=task_id, user_id=query.from_user.id)

    if success:
        await query.answer("Задача удалена.")
        await query.message.delete()
    else:
        await query.answer("Не удалось удалить задачу.", show_alert=True)


@router.callback_query(F.data.startswith("routine_toggle:"))
async def cb_routine_toggle(query: CallbackQuery):
    routine_id = int(query.data.split(":")[1])
    async with AsyncSessionLocal() as session:
        user = await get_or_create_user(session, query.from_user.id)
        now = get_user_now(user.timezone)
        effective_date, _, _ = get_user_effective_date_and_urgency(now, user.day_end_time)
        res = await toggle_routine_completion(session, routine_id=routine_id, user_id=user.telegram_id, target_date=effective_date)

    if not res:
        await query.answer("Рутина не найдена.", show_alert=True)
        return

    status_msg = f"Рутина выполнена! Стрик: 🔥 {res.current_streak} дн." if res.is_completed_today else "Выполнение рутины отменено"
    await query.answer(status_msg)
    try:
        await query.message.edit_reply_markup(
            reply_markup=get_routine_actions_kb(
                res.id,
                res.is_completed_today,
                target_value=res.target_value,
                step=res.step,
                unit=res.unit,
            )
        )
    except Exception:
        pass


@router.callback_query(F.data.startswith("routine_delete:"))
async def cb_routine_delete(query: CallbackQuery):
    routine_id = int(query.data.split(":")[1])
    async with AsyncSessionLocal() as session:
        success = await delete_routine(session, routine_id=routine_id, user_id=query.from_user.id)

    if success:
        await query.answer("Рутина удалена.")
        await query.message.delete()
    else:
        await query.answer("Не удалось удалить рутину.", show_alert=True)


@router.callback_query(F.data.startswith("goal_add_step:"))
async def cb_goal_add_step(query: CallbackQuery):
    goal_id = int(query.data.split(":")[1])
    USER_WAITING_FOR_GOAL_STEP[query.from_user.id] = goal_id
    await query.answer("Ожидаю название шага...")
    await query.message.answer(
        "➕ <b>Добавление шага к цели</b>\n\n"
        "Отправьте название шага сообщением или надиктуйте голосом. "
        "Шаг сразу добавится к цели и появится в списке задач на сегодня.\n\n"
        "<i>Для отмены отправьте /cancel</i>"
    )


@router.callback_query(F.data.startswith("goal_toggle:"))
async def cb_goal_toggle(query: CallbackQuery):
    goal_id = int(query.data.split(":")[1])
    async with AsyncSessionLocal() as session:
        goal = await toggle_goal(session, goal_id=goal_id, user_id=query.from_user.id)

    if not goal:
        await query.answer("Цель не найдена.", show_alert=True)
        return

    status = "завершена! 🎉" if goal.is_completed else "возобновлена 🎯"
    await query.answer(f"Цель {status}")
    try:
        bar = render_progress_bar(goal.progress_percentage)
        deadline_text = f" • Дедлайн: {goal.target_date.strftime('%d.%m.%Y')}" if goal.target_date else ""
        text = (
            f"🎯 <b>{goal.title}</b>\n"
            f"Прогресс: <code>[{bar}]</code> <b>{goal.progress_percentage}%</b> "
            f"({goal.completed_subtasks}/{goal.total_subtasks} шагов){deadline_text}\n"
        )
        if goal.description:
            text += f"<i>{goal.description}</i>\n"

        if goal.subtasks:
            text += "\n<b>Шаги цели:</b>\n"
            for st in goal.subtasks:
                icon = "✅" if st.is_completed else "▫️"
                text += f"{icon} {st.title}\n"

        if goal.is_completed:
            text += "\n✅ <i>Цель выполнена и будет автоматически удалена через несколько дней.</i>\n"

        await query.message.edit_text(text, reply_markup=get_goal_actions_kb(goal.id, goal.is_completed))
    except Exception:
        pass


@router.callback_query(F.data.startswith("goal_delete:"))
async def cb_goal_delete(query: CallbackQuery):
    goal_id = int(query.data.split(":")[1])
    async with AsyncSessionLocal() as session:
        success = await delete_goal(session, goal_id=goal_id, user_id=query.from_user.id)

    if success:
        await query.answer("Цель удалена.")
        await query.message.delete()
    else:
        await query.answer("Не удалось удалить цель.", show_alert=True)


@router.callback_query(F.data.startswith("toggle_setting:"))
async def cb_toggle_setting(query: CallbackQuery):
    key = query.data.split(":")[1]
    async with AsyncSessionLocal() as session:
        user = await get_or_create_user(session, query.from_user.id)
        current_val = getattr(user, f"{key}_enabled", True)
        update_data = UserUpdate(**{f"{key}_enabled": not current_val})
        updated_user = await update_user(session, query.from_user.id, update_data)

    await query.answer("Настройка обновлена!")
    await query.message.edit_reply_markup(
        reply_markup=get_settings_kb(
            reminder_6h=updated_user.reminder_6h_enabled,
            reminder_3h=updated_user.reminder_3h_enabled,
            reminder_1h=updated_user.reminder_1h_enabled,
            morning_digest=updated_user.morning_digest_enabled,
            evening_digest=updated_user.evening_digest_enabled,
            praise_notifications=getattr(updated_user, "praise_notifications_enabled", True),
        )
    )


@router.callback_query(F.data == "show_tz_help")
async def cb_show_tz_help(query: CallbackQuery):
    await query.answer(
        "Точный часовой пояс автоматически синхронизируется при открытии WebApp!",
        show_alert=True,
    )


@router.message(Command("test"))
@router.message(Command("test_notification"))
async def handle_test_notification_cmd(message: Message):
    from backend.scheduler import send_test_notification
    async with AsyncSessionLocal() as session:
        user = await get_or_create_user(session, message.from_user.id)
        try:
            await send_test_notification(session, user)
        except Exception as e:
            await message.answer(f"❌ Не удалось отправить тестовое уведомление: {e}")


@router.callback_query(F.data == "test_notification")
async def cb_test_notification(query: CallbackQuery):
    from backend.scheduler import send_test_notification
    async with AsyncSessionLocal() as session:
        user = await get_or_create_user(session, query.from_user.id)
        try:
            await send_test_notification(session, user)
            await query.answer("🔔 Тестовое уведомление отправлено!")
        except Exception as e:
            await query.answer(f"Ошибка: {e}", show_alert=True)

