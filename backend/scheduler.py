import logging
from datetime import datetime, date, timedelta
from typing import Dict, Set

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select, and_, update
from sqlalchemy.orm import selectinload

from backend.database import AsyncSessionLocal
from backend.models import User, RoutineTask, RoutineLog, OneTimeTask
from backend.crud import (
    get_user_now,
    get_user_effective_date_and_urgency,
    get_user_routines_with_status,
    get_day_tasks,
)
from backend.bot.bot_instance import bot
from backend.bot.keyboards import get_routine_actions_kb, get_webapp_inline_keyboard

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()

# Cache sent notifications to prevent duplicates: { "user_id:date:stage" }
SENT_NOTIFICATIONS: Set[str] = set()


async def check_user_reminders_and_rollover():
    """Periodic job running every 5-10 minutes."""
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

                    # Morning digest (if enabled and it's morning)
                    if user.morning_digest_enabled and 7 <= now.hour <= 12:
                        overdue, today = await get_day_tasks(session, user.telegram_id, effective_date)
                        routines = await get_user_routines_with_status(session, user.telegram_id, effective_date)

                        digest_text = (
                            f"☀️ <b>Доброе утро, {user.first_name or 'друг'}!</b>\n\n"
                            f"📋 <b>Ваш план на сегодня ({effective_date.strftime('%d.%m')}):</b>\n"
                        )
                        if overdue:
                            digest_text += f"⚠️ Перенесено невыполненных задач: <b>{len(overdue)}</b> (закреплены сверху)\n"
                        digest_text += f"🔄 Ежедневных рутин: <b>{len(routines)}</b>\n"
                        digest_text += f"⚡️ Разовых задач на день: <b>{len(today)}</b>\n\n"
                        digest_text += "Удачного и продуктивного дня! 💪"

                        try:
                            await bot.send_message(
                                chat_id=user.telegram_id,
                                text=digest_text,
                                reply_markup=get_webapp_inline_keyboard(),
                            )
                        except Exception as e:
                            logger.warning(f"Could not send morning digest to {user.telegram_id}: {e}")

                elif not user.last_active_date:
                    user.last_active_date = effective_date
                    await session.commit()

                # --- 2. Routine Reminders (6h, 3h, 1h before day end) ---
                routines = await get_user_routines_with_status(session, user.telegram_id, effective_date)
                uncompleted_routines = [r for r in routines if not r.is_completed_today]

                if not uncompleted_routines:
                    continue

                date_key = effective_date.isoformat()

                # 6 hours reminder
                if (
                    user.reminder_6h_enabled
                    and 5.0 <= hours_left <= 6.0
                    and f"{user.telegram_id}:{date_key}:6h" not in SENT_NOTIFICATIONS
                ):
                    SENT_NOTIFICATIONS.add(f"{user.telegram_id}:{date_key}:6h")
                    msg = (
                        "🟡 <b>Напоминание: осталось 6 часов до конца дня!</b>\n\n"
                        "Не забудьте закрыть ежедневные рутины:\n"
                    )
                    for r in uncompleted_routines:
                        msg += f"• {r.title}\n"
                    try:
                        await bot.send_message(chat_id=user.telegram_id, text=msg)
                    except Exception as e:
                        logger.warning(f"Failed to send 6h reminder to {user.telegram_id}: {e}")

                # 3 hours reminder
                if (
                    user.reminder_3h_enabled
                    and 2.0 <= hours_left <= 3.0
                    and f"{user.telegram_id}:{date_key}:3h" not in SENT_NOTIFICATIONS
                ):
                    SENT_NOTIFICATIONS.add(f"{user.telegram_id}:{date_key}:3h")
                    msg = (
                        "🟠 <b>Внимание: осталось 3 часа до конца дня!</b>\n\n"
                        "Остались незавершенные рутины:\n"
                    )
                    for r in uncompleted_routines:
                        msg += f"• {r.title}\n"
                    try:
                        await bot.send_message(chat_id=user.telegram_id, text=msg)
                    except Exception as e:
                        logger.warning(f"Failed to send 3h reminder to {user.telegram_id}: {e}")

                # 1 hour critical reminder
                if (
                    user.reminder_1h_enabled
                    and 0.1 <= hours_left <= 1.0
                    and f"{user.telegram_id}:{date_key}:1h" not in SENT_NOTIFICATIONS
                ):
                    SENT_NOTIFICATIONS.add(f"{user.telegram_id}:{date_key}:1h")
                    msg = (
                        "🚨 <b>Критично: остался 1 час до сброса дня!</b>\n\n"
                        "Завершите рутины, чтобы не потерять стрик привычек:\n"
                    )
                    for r in uncompleted_routines:
                        msg += f"• <b>{r.title}</b> (стрик: 🔥 {r.current_streak})\n"
                    try:
                        await bot.send_message(chat_id=user.telegram_id, text=msg)
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
    )
    scheduler.start()
