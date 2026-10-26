import html
import logging
from datetime import datetime, date, timedelta
from typing import Dict, Set, List, Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select, and_, update, delete
from sqlalchemy.orm import selectinload

from backend.database import AsyncSessionLocal
from backend.models import User, RoutineTask, RoutineLog, Goal, OneTimeTask, SentNotification
from backend.crud import (
    get_user_now,
    get_user_effective_date_and_urgency,
    get_user_routines_with_status,
    get_day_tasks,
    is_routine_scheduled_for_date,
    get_user_goals,
)
from backend.bot.bot_instance import bot
from backend.bot.keyboards import get_webapp_inline_keyboard

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()

# Fast in-memory cache to avoid redundant DB queries: "user_id:date_iso:stage"
_SENT_CACHE: Set[str] = set()


async def is_stage_sent(session, user_id: int, target_date: date, stage: str) -> bool:
    cache_key = f"{user_id}:{target_date.isoformat()}:{stage}"
    if cache_key in _SENT_CACHE:
        return True
    stmt = select(SentNotification).where(
        and_(
            SentNotification.user_id == user_id,
            SentNotification.date == target_date,
            SentNotification.stage == stage,
        )
    )
    res = await session.execute(stmt)
    if res.scalar_one_or_none() is not None:
        _SENT_CACHE.add(cache_key)
        return True
    return False


async def record_stage_sent(session, user_id: int, target_date: date, stage: str):
    cache_key = f"{user_id}:{target_date.isoformat()}:{stage}"
    _SENT_CACHE.add(cache_key)
    try:
        stmt = select(SentNotification).where(
            and_(
                SentNotification.user_id == user_id,
                SentNotification.date == target_date,
                SentNotification.stage == stage,
            )
        )
        existing = (await session.execute(stmt)).scalar_one_or_none()
        if not existing:
            session.add(SentNotification(user_id=user_id, date=target_date, stage=stage))
            await session.commit()
    except Exception as e:
        await session.rollback()
        logger.warning(f"Could not record sent notification {cache_key}: {e}")


def format_reminder_text(title: str, subtitle: str, routines: list, tasks: list) -> str:
    lines = [title, "", subtitle, ""]
    if routines:
        lines.append("🔄 <b>Ежедневные рутины:</b>")
        for r in routines:
            streak = f" (стрик: 🔥 {r.current_streak})" if r.current_streak > 0 else ""
            unit_str = f" {html.escape(r.unit)}" if r.unit else ""
            prog = f" [{r.current_value:g}/{r.target_value:g}{unit_str}]" if r.target_value else ""
            lines.append(f"• <b>{html.escape(r.title)}</b>{prog}{streak}")
        lines.append("")
    if tasks:
        lines.append("⚡️ <b>Задачи на день:</b>")
        for t in tasks:
            overdue_tag = f" ⚠️ <i>(+{t.overdue_days} дн.)</i>" if t.is_overdue else ""
            unit_str = f" {html.escape(t.unit)}" if t.unit else ""
            prog = f" [{t.current_value:g}/{t.target_value:g}{unit_str}]" if t.target_value else ""
            lines.append(f"• {html.escape(t.title)}{prog}{overdue_tag}")
        lines.append("")
    return "\n".join(lines).strip()


def format_praise_text(
    title: str,
    intro: str,
    completed_routines: list,
    completed_tasks: list,
) -> str:
    lines = [title, "", intro, ""]
    total_done = len(completed_routines) + len(completed_tasks)
    if total_done > 0:
        lines.append(f"📊 <b>Выполнено дел: {total_done}</b>")
        if completed_routines:
            lines.append("🔄 <b>Ежедневные рутины:</b>")
            for r in completed_routines:
                streak = f" (стрик: 🔥 {r.current_streak})" if r.current_streak > 0 else ""
                unit_str = f" {html.escape(r.unit)}" if r.unit else ""
                prog = f" [{r.current_value:g}/{r.target_value:g}{unit_str}]" if r.target_value else ""
                lines.append(f"• <b>{html.escape(r.title)}</b>{prog}{streak} — ✅")
            lines.append("")
        if completed_tasks:
            lines.append("⚡️ <b>Задачи на день:</b>")
            show_tasks = completed_tasks[:10]
            for t in show_tasks:
                unit_str = f" {html.escape(t.unit)}" if t.unit else ""
                prog = f" [{t.current_value:g}/{t.target_value:g}{unit_str}]" if t.target_value else ""
                lines.append(f"• {html.escape(t.title)}{prog} — ✅")
            if len(completed_tasks) > 10:
                lines.append(f"• <i>...и ещё {len(completed_tasks) - 10} задач</i>")
            lines.append("")
        lines.append("Отличная продуктивность! Наслаждайтесь заслуженным отдыхом! 👏✨")
    else:
        lines.append("🌟 <b>На сегодня задач не было запланировано.</b>")
        lines.append("Отличный повод отдохнуть или наметить цели на завтра! 💪")
    return "\n".join(lines).strip()


async def send_test_notification(session, user: User) -> dict:
    """Sends a rich test notification to the user in Telegram explaining notification status."""
    now = get_user_now(user.timezone)
    effective_date, hours_left, urgency = get_user_effective_date_and_urgency(
        now, user.day_end_time
    )
    routines = await get_user_routines_with_status(session, user.telegram_id, effective_date)
    overdue, today_tasks = await get_day_tasks(session, user.telegram_id, effective_date)
    all_tasks = overdue + today_tasks

    completed_routines = [r for r in routines if r.is_completed_today]
    uncompleted_routines = [r for r in routines if not r.is_completed_today]
    completed_tasks = [t for t in all_tasks if t.is_completed]
    uncompleted_tasks = [t for t in all_tasks if not t.is_completed]

    hours = int(max(0, hours_left))
    minutes = int(max(0, (hours_left - hours) * 60))
    time_left_str = f"{hours} ч. {minutes} мин." if hours > 0 else f"{minutes} мин."

    lines = [
        "🔔 <b>Тестовое уведомление от TaskerBot</b>",
        "",
        "Уведомления настроены и работают корректно! Текущий статус вашей системы:",
        "",
        "🕒 <b>Время и расписание:</b>",
        f"• Местное время: <b>{now.strftime('%H:%M')}</b> (пояс {html.escape(user.timezone)})",
        f"• Время сброса дня: <b>{user.day_end_time}</b>",
        f"• До сброса дня осталось: <b>{time_left_str}</b>",
        "",
        "⚙️ <b>Статус напоминаний:</b>",
        f"• За 6 часов: {'🔔 Включено' if user.reminder_6h_enabled else '🔕 Выключено'}",
        f"• За 3 часа: {'🔔 Включено' if user.reminder_3h_enabled else '🔕 Выключено'}",
        f"• За 1 час (срочное): {'🔔 Включено' if user.reminder_1h_enabled else '🔕 Выключено'}",
        f"• Похвала за закрытие всех дел: {'🔔 Включено' if getattr(user, 'praise_notifications_enabled', True) else '🔕 Выключено'}",
        f"• Утренний дайджест: {'🔔 Включено (' + (user.morning_digest_time or '09:00') + ')' if user.morning_digest_enabled else '🔕 Выключено'}",
        f"• Вечерний отчет (за 15м): {'🔔 Включено' if user.evening_digest_enabled else '🔕 Выключено'}",
        "",
        "📊 <b>Дела на сегодня:</b>",
        f"• Рутины: <b>{len(completed_routines)}/{len(routines)}</b> выполнено",
        f"• Задачи: <b>{len(completed_tasks)}/{len(all_tasks)}</b> выполнено",
    ]

    if not uncompleted_routines and not uncompleted_tasks:
        lines.append("")
        lines.append("🌟 <b>Все намеченные дела на сегодня выполнены на 100%!</b>")
        if getattr(user, "praise_notifications_enabled", True):
            lines.append("В контрольные моменты (за 6ч, 3ч и 1ч) бот присылает <b>уведомление-похвалу</b> с итогами закрытых дел. 🎉")
        else:
            lines.append("Уведомления-похвала отключены в настройках — бот не будет беспокоить, если всё закрыто. 🔕")
    else:
        pending_total = len(uncompleted_routines) + len(uncompleted_tasks)
        lines.append("")
        lines.append(f"⏳ Осталось невыполненных дел: <b>{pending_total}</b>")
        lines.append("В контрольные часы бот напомнит завершить их.")

    lines.append("")
    lines.append("✨ <i>Система уведомлений активна и готова к работе!</i>")

    msg = "\n".join(lines).strip()
    await bot.send_message(
        chat_id=user.telegram_id,
        text=msg,
        reply_markup=get_webapp_inline_keyboard(),
    )
    return {"status": "ok", "message": "Тестовое уведомление успешно отправлено в Telegram"}


async def send_evening_report(session, user: User, target_date: date):
    """Generates and sends the evening report/summary for a specific date."""
    if await is_stage_sent(session, user.telegram_id, target_date, "evening"):
        return

    routines = await get_user_routines_with_status(session, user.telegram_id, target_date)
    overdue, today_tasks = await get_day_tasks(session, user.telegram_id, target_date)
    all_tasks = overdue + today_tasks

    completed_routines = [r for r in routines if r.is_completed_today]
    completed_tasks = [t for t in all_tasks if t.is_completed]
    pending_tasks = [t for t in all_tasks if not t.is_completed]

    report_lines = [
        f"🌙 <b>Итоги дня ({target_date.strftime('%d.%m')}):</b>",
        "<i>Подведение итогов дня и подготовка ко сну.</i>\n",
    ]

    if routines:
        report_lines.append(
            f"🔄 <b>Рутины и привычки:</b> {len(completed_routines)}/{len(routines)} выполнено"
        )
        for r in routines:
            icon = "✅" if r.is_completed_today else "❌"
            streak_tag = f" (🔥 {r.current_streak})" if r.current_streak > 0 else ""
            unit_str = f" {html.escape(r.unit)}" if r.unit else ""
            prog_tag = (
                f" [{r.current_value:g}/{r.target_value:g}{unit_str}]"
                if r.target_value
                else ""
            )
            report_lines.append(f"  {icon} {html.escape(r.title)}{prog_tag}{streak_tag}")
        report_lines.append("")

    if all_tasks:
        report_lines.append(
            f"⚡️ <b>Задачи:</b> {len(completed_tasks)}/{len(all_tasks)} завершено"
        )
        for t in all_tasks:
            icon = "✅" if t.is_completed else "⏳"
            unit_str = f" {html.escape(t.unit)}" if t.unit else ""
            prog_tag = (
                f" [{t.current_value:g}/{t.target_value:g}{unit_str}]"
                if t.target_value
                else ""
            )
            report_lines.append(f"  {icon} {html.escape(t.title)}{prog_tag}")
        if pending_tasks:
            report_lines.append("\n⚠️ <i>Невыполненные задачи будут автоматически перенесены на следующий день.</i>")
        report_lines.append("")

    if (not routines or len(completed_routines) == len(routines)) and not pending_tasks:
        report_lines.append("🌟 <b>Блестяще! Все намеченные дела выполнены на 100%! Спокойной ночи! 😴</b>")
    else:
        report_lines.append("Хороший день! Отдохните и наберитесь сил перед завтрашним днем! ✨")

    report_msg = "\n".join(report_lines).strip()
    try:
        await bot.send_message(
            chat_id=user.telegram_id,
            text=report_msg,
            reply_markup=get_webapp_inline_keyboard(),
        )
        await record_stage_sent(session, user.telegram_id, target_date, "evening")
        logger.info(f"Evening report successfully sent to {user.telegram_id} for date {target_date}")
    except Exception as e:
        logger.warning(f"Could not send evening report to {user.telegram_id}: {e}")


async def check_user_reminders_and_rollover():
    """Periodic job running every minute and immediately on boot."""
    try:
        async with AsyncSessionLocal() as session:
            stmt = select(User)
            res = await session.execute(stmt)
            users = res.scalars().all()

            for user in users:
                try:
                    now = get_user_now(user.timezone)
                    effective_date, hours_left, urgency = get_user_effective_date_and_urgency(
                        now, user.day_end_time
                    )

                    # --- 1. Day Rollover Logic (triggers when day ends / cutoff passes) ---
                    if user.last_active_date and user.last_active_date < effective_date:
                        prev_date = user.last_active_date

                        # If evening digest was enabled and not yet sent for prev_date, send it now before rolling over!
                        if user.evening_digest_enabled and not await is_stage_sent(session, user.telegram_id, prev_date, "evening"):
                            await send_evening_report(session, user, prev_date)

                        # Routine streak reset check for prev_date
                        routines_stmt = select(RoutineTask).where(
                            and_(RoutineTask.user_id == user.telegram_id, RoutineTask.is_active == True)
                        )
                        r_res = await session.execute(routines_stmt)
                        user_routines = r_res.scalars().all()

                        for r in user_routines:
                            if is_routine_scheduled_for_date(r, prev_date):
                                log_stmt = select(RoutineLog).where(
                                    and_(RoutineLog.routine_id == r.id, RoutineLog.date == prev_date)
                                )
                                l_res = await session.execute(log_stmt)
                                log = l_res.scalar_one_or_none()
                                if not log or not log.is_completed:
                                    r.current_streak = 0

                        # Carry over uncompleted one-time tasks
                        overdue_update_stmt = (
                            update(OneTimeTask)
                            .where(
                                and_(
                                    OneTimeTask.user_id == user.telegram_id,
                                    OneTimeTask.is_completed == False,
                                    OneTimeTask.scheduled_date <= prev_date,
                                )
                            )
                            .values(
                                scheduled_date=effective_date,
                                is_overdue=True,
                                overdue_days=OneTimeTask.overdue_days + 1,
                            )
                        )
                        await session.execute(overdue_update_stmt)
                        user.last_active_date = effective_date
                        await session.commit()

                    elif not user.last_active_date:
                        user.last_active_date = effective_date
                        await session.commit()

                    # --- 1b. Auto-cleanup completed goals past retention period ---
                    retention_days = getattr(user, "goal_cleanup_days", 3)
                    if retention_days is None:
                        retention_days = 3
                    if retention_days >= 0:
                        cleanup_cutoff = datetime.utcnow() - timedelta(days=retention_days)
                        exp_stmt = select(Goal.id).where(
                            and_(
                                Goal.user_id == user.telegram_id,
                                Goal.is_completed == True,
                                Goal.completed_at != None,
                                Goal.completed_at <= cleanup_cutoff,
                            )
                        )
                        exp_res = await session.execute(exp_stmt)
                        expired_goal_ids = exp_res.scalars().all()
                        if expired_goal_ids:
                            await session.execute(
                                delete(OneTimeTask).where(OneTimeTask.goal_id.in_(expired_goal_ids))
                            )
                            await session.execute(
                                delete(Goal).where(Goal.id.in_(expired_goal_ids))
                            )
                            await session.commit()
                            logger.info(f"Auto-cleaned {len(expired_goal_ids)} expired goals for user {user.telegram_id}")

                    # --- 2. Morning Digest (Configurable time, default 09:00) ---
                    if user.morning_digest_enabled:
                        try:
                            m_parts = (user.morning_digest_time or "09:00").split(":")
                            m_hour = int(m_parts[0])
                            m_min = int(m_parts[1]) if len(m_parts) > 1 else 0
                        except Exception:
                            m_hour, m_min = 9, 0

                        # Morning window: from morning_digest_time up to 4 hours later
                        m_now_minutes = now.hour * 60 + now.minute
                        m_target_minutes = m_hour * 60 + m_min
                        is_morning_time = 0 <= (m_now_minutes - m_target_minutes) <= 240

                        if is_morning_time and not await is_stage_sent(session, user.telegram_id, effective_date, "morning"):
                            overdue, today = await get_day_tasks(session, user.telegram_id, effective_date)
                            routines = await get_user_routines_with_status(session, user.telegram_id, effective_date)
                            goals = await get_user_goals(session, user.telegram_id)
                            empty_goals = [g for g in goals if not g.is_completed and g.total_subtasks == 0]

                            safe_name = html.escape(user.first_name or "друг")
                            digest_text = (
                                f"☀️ <b>Доброе утро, {safe_name}!</b>\n\n"
                                f"📋 <b>Ваш план на сегодня ({effective_date.strftime('%d.%m')}):</b>\n"
                            )
                            if overdue:
                                digest_text += f"⚠️ Перенесено невыполненных задач: <b>{len(overdue)}</b> (закреплены сверху)\n"
                            if routines:
                                digest_text += f"🔄 Ежедневных рутин: <b>{len(routines)}</b>\n"
                            if today:
                                digest_text += f"⚡️ Разовых задач на день: <b>{len(today)}</b>\n"
                            if not overdue and not routines and not today:
                                digest_text += "Пока нет запланированных дел. Самое время наметить задачи на день! 🎯\n"
                            if empty_goals:
                                g_names = ", ".join(f"«{g.title}»" for g in empty_goals[:2])
                                digest_text += f"\n⚠️ <b>Цели без шагов ({len(empty_goals)}):</b> {g_names}. Добавьте к ним первые шаги в приложении, чтобы начать прогресс!\n"
                            digest_text += "\nУдачного и продуктивного дня! 💪"

                            try:
                                await bot.send_message(
                                    chat_id=user.telegram_id,
                                    text=digest_text,
                                    reply_markup=get_webapp_inline_keyboard(),
                                )
                                await record_stage_sent(session, user.telegram_id, effective_date, "morning")
                                logger.info(f"Morning digest sent to {user.telegram_id}")
                            except Exception as e:
                                logger.warning(f"Could not send morning digest to {user.telegram_id}: {e}")

                    # --- 3. Routine and Task Reminders / Praise (6h, 3h, 1h before day end) ---
                    routines = await get_user_routines_with_status(session, user.telegram_id, effective_date)
                    uncompleted_routines = [r for r in routines if not r.is_completed_today]
                    completed_routines = [r for r in routines if r.is_completed_today]

                    overdue, today_tasks = await get_day_tasks(session, user.telegram_id, effective_date)
                    all_tasks = overdue + today_tasks
                    uncompleted_tasks = [t for t in all_tasks if not t.is_completed]
                    completed_tasks = [t for t in all_tasks if t.is_completed]

                    has_unfinished = bool(uncompleted_routines or uncompleted_tasks)

                    # 6 hours reminder (window: 3h < hours_left <= 6h)
                    if (
                        user.reminder_6h_enabled
                        and 3.0 < hours_left <= 6.0
                        and not await is_stage_sent(session, user.telegram_id, effective_date, "6h")
                    ):
                        if has_unfinished:
                            msg = format_reminder_text(
                                title="🟡 <b>Напоминание: осталось 6 часов до конца дня!</b>",
                                subtitle="Не забудьте завершить намеченные дела и рутины:",
                                routines=uncompleted_routines,
                                tasks=uncompleted_tasks,
                            )
                            try:
                                await bot.send_message(
                                    chat_id=user.telegram_id,
                                    text=msg,
                                    reply_markup=get_webapp_inline_keyboard(),
                                )
                                logger.info(f"6h reminder sent to {user.telegram_id}")
                            except Exception as e:
                                logger.warning(f"Failed to send 6h reminder to {user.telegram_id}: {e}")
                        elif getattr(user, "praise_notifications_enabled", True):
                            msg = format_praise_text(
                                title="✨ <b>Осталось 6 часов: отличный темп!</b>",
                                intro="Все задачи и привычки на сегодня уже закрыты! Можно заслуженно перевести дух.",
                                completed_routines=completed_routines,
                                completed_tasks=completed_tasks,
                            )
                            try:
                                await bot.send_message(
                                    chat_id=user.telegram_id,
                                    text=msg,
                                    reply_markup=get_webapp_inline_keyboard(),
                                )
                                logger.info(f"6h praise sent to {user.telegram_id}")
                            except Exception as e:
                                logger.warning(f"Failed to send 6h praise to {user.telegram_id}: {e}")
                        await record_stage_sent(session, user.telegram_id, effective_date, "6h")

                    # 3 hours reminder (window: 1h < hours_left <= 3h)
                    elif (
                        user.reminder_3h_enabled
                        and 1.0 < hours_left <= 3.0
                        and not await is_stage_sent(session, user.telegram_id, effective_date, "3h")
                    ):
                        if has_unfinished:
                            msg = format_reminder_text(
                                title="🟠 <b>Внимание: осталось 3 часа до конца дня!</b>",
                                subtitle="Остались незавершенные дела на сегодня:",
                                routines=uncompleted_routines,
                                tasks=uncompleted_tasks,
                            )
                            try:
                                await bot.send_message(
                                    chat_id=user.telegram_id,
                                    text=msg,
                                    reply_markup=get_webapp_inline_keyboard(),
                                )
                                logger.info(f"3h reminder sent to {user.telegram_id}")
                            except Exception as e:
                                logger.warning(f"Failed to send 3h reminder to {user.telegram_id}: {e}")
                        elif getattr(user, "praise_notifications_enabled", True):
                            msg = format_praise_text(
                                title="🎉 <b>Осталось 3 часа: день прошел на отлично!</b>",
                                intro="До конца дня ещё 3 часа, а у тебя уже всё сделано на 100%! Вечер свободен для отдыха.",
                                completed_routines=completed_routines,
                                completed_tasks=completed_tasks,
                            )
                            try:
                                await bot.send_message(
                                    chat_id=user.telegram_id,
                                    text=msg,
                                    reply_markup=get_webapp_inline_keyboard(),
                                )
                                logger.info(f"3h praise sent to {user.telegram_id}")
                            except Exception as e:
                                logger.warning(f"Failed to send 3h praise to {user.telegram_id}: {e}")
                        await record_stage_sent(session, user.telegram_id, effective_date, "3h")
                        await record_stage_sent(session, user.telegram_id, effective_date, "6h")

                    # 1 hour critical reminder (window: 0.25h < hours_left <= 1h)
                    elif (
                        user.reminder_1h_enabled
                        and 0.25 < hours_left <= 1.0
                        and not await is_stage_sent(session, user.telegram_id, effective_date, "1h")
                    ):
                        if has_unfinished:
                            msg = format_reminder_text(
                                title="🚨 <b>Критично: остался 1 час до сброса дня!</b>",
                                subtitle="Срочно завершите дела, чтобы не потерять стрик привычек и не просрочить задачи:",
                                routines=uncompleted_routines,
                                tasks=uncompleted_tasks,
                            )
                            try:
                                await bot.send_message(
                                    chat_id=user.telegram_id,
                                    text=msg,
                                    reply_markup=get_webapp_inline_keyboard(),
                                )
                                logger.info(f"1h reminder sent to {user.telegram_id}")
                            except Exception as e:
                                logger.warning(f"Failed to send 1h reminder to {user.telegram_id}: {e}")
                        elif getattr(user, "praise_notifications_enabled", True):
                            msg = format_praise_text(
                                title="🏆 <b>Остался 1 час: идеальный финиш дня!</b>",
                                intro="Все задачи закрыты, стрики привычек защищены, ни одного хвоста на завтра! Ты супермолодец.",
                                completed_routines=completed_routines,
                                completed_tasks=completed_tasks,
                            )
                            try:
                                await bot.send_message(
                                    chat_id=user.telegram_id,
                                    text=msg,
                                    reply_markup=get_webapp_inline_keyboard(),
                                )
                                logger.info(f"1h praise sent to {user.telegram_id}")
                            except Exception as e:
                                logger.warning(f"Failed to send 1h praise to {user.telegram_id}: {e}")
                        await record_stage_sent(session, user.telegram_id, effective_date, "1h")
                        await record_stage_sent(session, user.telegram_id, effective_date, "3h")
                        await record_stage_sent(session, user.telegram_id, effective_date, "6h")

                    # --- 4. Evening Report (approx. 15-18 minutes before day end cutoff) ---
                    if (
                        user.evening_digest_enabled
                        and 0.0 < hours_left <= 0.30
                        and not await is_stage_sent(session, user.telegram_id, effective_date, "evening")
                    ):
                        await send_evening_report(session, user, effective_date)

                except Exception as user_err:
                    logger.error(
                        f"Error processing reminders for user {user.telegram_id}: {user_err}",
                        exc_info=True,
                    )

    except Exception as e:
        logger.error(f"Error in check_user_reminders_and_rollover: {e}", exc_info=True)


def start_scheduler():
    scheduler.add_job(
        check_user_reminders_and_rollover,
        "interval",
        minutes=1,
        id="check_reminders",
        replace_existing=True,
        next_run_time=datetime.now(),
    )
    if not scheduler.running:
        scheduler.start()
        logger.info("Background scheduler successfully started with 1-minute interval.")
