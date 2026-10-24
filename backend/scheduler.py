import logging
from datetime import datetime, date, timedelta
from typing import Dict, Set, List

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select, and_, update
from sqlalchemy.orm import selectinload

from backend.database import AsyncSessionLocal
from backend.models import User, RoutineTask, RoutineLog, OneTimeTask, SentNotification
from backend.crud import (
    get_user_now,
    get_user_effective_date_and_urgency,
    get_user_routines_with_status,
    get_day_tasks,
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
            prog = f" [{r.current_value:g}/{r.target_value:g} {r.unit}]" if r.target_value else ""
            lines.append(f"• <b>{r.title}</b>{prog}{streak}")
        lines.append("")
    if tasks:
        lines.append("⚡️ <b>Задачи на день:</b>")
        for t in tasks:
            overdue_tag = f" ⚠️ <i>(+{t.overdue_days} дн.)</i>" if t.is_overdue else ""
            prog = f" [{t.current_value:g}/{t.target_value:g} {t.unit}]" if t.target_value else ""
            lines.append(f"• {t.title}{prog}{overdue_tag}")
        lines.append("")
    return "\n".join(lines).strip()


async def check_user_reminders_and_rollover():
    """Periodic job running every 5 minutes and immediately on boot."""
    try:
        async with AsyncSessionLocal() as session:
            stmt = select(User)
            res = await session.execute(stmt)
            users = res.scalars().all()

            for user in users:
                now = get_user_now(user.timezone)
                effective_date, hours_left, urgency = get_user_effective_date_and_urgency(
                    now, user.day_end_time
                )

                # --- 1. Day Rollover Logic ---
                if user.last_active_date and user.last_active_date < effective_date:
                    # Previous day just completed!
                    prev_date = user.last_active_date

                    # Routine streak reset check for prev_date
                    routines_stmt = select(RoutineTask).where(
                        and_(RoutineTask.user_id == user.telegram_id, RoutineTask.is_active == True)
                    )
                    r_res = await session.execute(routines_stmt)
                    user_routines = r_res.scalars().all()

                    for r in user_routines:
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

                # --- 2. Morning Digest (7:00 - 11:59) ---
                if user.morning_digest_enabled and 7 <= now.hour <= 11:
                    if not await is_stage_sent(session, user.telegram_id, effective_date, "morning"):
                        overdue, today = await get_day_tasks(session, user.telegram_id, effective_date)
                        routines = await get_user_routines_with_status(session, user.telegram_id, effective_date)

                        if overdue or today or routines:
                            digest_text = (
                                f"☀️ <b>Доброе утро, {user.first_name or 'друг'}!</b>\n\n"
                                f"📋 <b>Ваш план на сегодня ({effective_date.strftime('%d.%m')}):</b>\n"
                            )
                            if overdue:
                                digest_text += f"⚠️ Перенесено невыполненных задач: <b>{len(overdue)}</b> (закреплены сверху)\n"
                            if routines:
                                digest_text += f"🔄 Ежедневных рутин: <b>{len(routines)}</b>\n"
                            if today:
                                digest_text += f"⚡️ Разовых задач на день: <b>{len(today)}</b>\n"
                            digest_text += "\nУдачного и продуктивного дня! 💪"

                            try:
                                await bot.send_message(
                                    chat_id=user.telegram_id,
                                    text=digest_text,
                                    reply_markup=get_webapp_inline_keyboard(),
                                )
                                await record_stage_sent(session, user.telegram_id, effective_date, "morning")
                            except Exception as e:
                                logger.warning(f"Could not send morning digest to {user.telegram_id}: {e}")

                # --- 3. Routine and Task Reminders (6h, 3h, 1h before day end) ---
                routines = await get_user_routines_with_status(session, user.telegram_id, effective_date)
                uncompleted_routines = [r for r in routines if not r.is_completed_today]

                overdue, today_tasks = await get_day_tasks(session, user.telegram_id, effective_date)
                uncompleted_tasks = [t for t in (overdue + today_tasks) if not t.is_completed]

                # If no uncompleted items left, skip reminders
                if not uncompleted_routines and not uncompleted_tasks:
                    continue

                # 6 hours reminder (window: 3h < hours_left <= 6h)
                if (
                    user.reminder_6h_enabled
                    and 3.0 < hours_left <= 6.0
                    and not await is_stage_sent(session, user.telegram_id, effective_date, "6h")
                ):
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
                        await record_stage_sent(session, user.telegram_id, effective_date, "6h")
                    except Exception as e:
                        logger.warning(f"Failed to send 6h reminder to {user.telegram_id}: {e}")

                # 3 hours reminder (window: 1h < hours_left <= 3h)
                elif (
                    user.reminder_3h_enabled
                    and 1.0 < hours_left <= 3.0
                    and not await is_stage_sent(session, user.telegram_id, effective_date, "3h")
                ):
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
                        await record_stage_sent(session, user.telegram_id, effective_date, "3h")
                        await record_stage_sent(session, user.telegram_id, effective_date, "6h")
                    except Exception as e:
                        logger.warning(f"Failed to send 3h reminder to {user.telegram_id}: {e}")

                # 1 hour critical reminder (window: 0h < hours_left <= 1h)
                elif (
                    user.reminder_1h_enabled
                    and 0.0 < hours_left <= 1.0
                    and not await is_stage_sent(session, user.telegram_id, effective_date, "1h")
                ):
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
                        await record_stage_sent(session, user.telegram_id, effective_date, "1h")
                        await record_stage_sent(session, user.telegram_id, effective_date, "3h")
                        await record_stage_sent(session, user.telegram_id, effective_date, "6h")
                    except Exception as e:
                        logger.warning(f"Failed to send 1h reminder to {user.telegram_id}: {e}")

    except Exception as e:
        logger.error(f"Error in check_user_reminders_and_rollover: {e}", exc_info=True)


def start_scheduler():
    scheduler.add_job(
        check_user_reminders_and_rollover,
        "interval",
        minutes=5,
        id="check_reminders",
        replace_existing=True,
        next_run_time=datetime.now(),
    )
    scheduler.start()
