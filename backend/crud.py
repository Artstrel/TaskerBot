from datetime import datetime, date, timedelta
from typing import List, Optional, Tuple
import zoneinfo
from sqlalchemy import select, update, delete, and_, func, desc, Integer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.models import User, RoutineTask, RoutineLog, Goal, OneTimeTask, GroceryItem
from backend.schemas import (
    UserUpdate,
    RoutineWithStatus,
    RoutineTaskUpdate,
    GoalWithProgress,
    OneTimeTaskRead,
    DaySummary,
    GroceryItemRead,
    GroceryListResponse,
)
from backend.database import engine


def _task_to_read(t: OneTimeTask, goal_title: Optional[str] = None) -> OneTimeTaskRead:
    gt = goal_title or (t.goal.title if getattr(t, "goal", None) else None)
    return OneTimeTaskRead(
        id=t.id,
        user_id=t.user_id,
        goal_id=t.goal_id,
        goal_title=gt,
        title=t.title,
        scheduled_date=t.scheduled_date,
        is_completed=t.is_completed,
        completed_at=t.completed_at,
        is_overdue=t.is_overdue,
        overdue_days=t.overdue_days,
        priority=t.priority,
        target_value=t.target_value,
        current_value=t.current_value or 0.0,
        step=t.step or 1.0,
        unit=t.unit,
        created_at=t.created_at,
    )


def _routine_to_status(r: RoutineTask, log: Optional[RoutineLog] = None) -> RoutineWithStatus:
    is_completed = log.is_completed if log else False
    completed_at = log.completed_at if log else None
    current_value = log.current_value if (log and log.current_value is not None) else 0.0
    return RoutineWithStatus(
        id=r.id,
        title=r.title,
        description=r.description,
        is_active=r.is_active,
        current_streak=r.current_streak,
        best_streak=r.best_streak,
        is_completed_today=is_completed,
        completed_at=completed_at,
        target_value=r.target_value,
        current_value=current_value,
        step=r.step or 1.0,
        unit=r.unit,
    )


def get_user_now(timezone_str: str) -> datetime:
    try:
        tz = zoneinfo.ZoneInfo(timezone_str)
    except Exception:
        tz = zoneinfo.ZoneInfo("Europe/Moscow")
    return datetime.now(tz)


def get_user_effective_date_and_urgency(
    now: datetime, day_end_time_str: str = "00:00"
) -> Tuple[date, float, str]:
    """
    Calculates the effective date and hours remaining until day_end_time.
    If day_end_time is 02:00 and now is 01:30, the effective date is yesterday,
    and 0.5 hours remain until day_end_time.
    """
    try:
        parts = day_end_time_str.split(":")
        end_hour = int(parts[0])
        end_minute = int(parts[1]) if len(parts) > 1 else 0
    except Exception:
        end_hour, end_minute = 0, 0

    local_date = now.date()
    local_time = now.time()

    if end_hour == 0 and end_minute == 0:
        # Standard midnight boundary
        effective_date = local_date
        next_deadline = datetime(
            local_date.year, local_date.month, local_date.day, 23, 59, 59, tzinfo=now.tzinfo
        )
        seconds_left = max(0.0, (next_deadline - now).total_seconds())
    else:
        # Custom bedtime cutoff (e.g. 02:00)
        target_cutoff_today = datetime(
            local_date.year, local_date.month, local_date.day, end_hour, end_minute, tzinfo=now.tzinfo
        )
        if now < target_cutoff_today:
            # Still in "yesterday's" productive day!
            effective_date = local_date - timedelta(days=1)
            seconds_left = max(0.0, (target_cutoff_today - now).total_seconds())
        else:
            effective_date = local_date
            next_deadline = target_cutoff_today + timedelta(days=1)
            seconds_left = max(0.0, (next_deadline - now).total_seconds())

    hours_left = seconds_left / 3600.0

    if hours_left <= 1.0:
        urgency = "critical_1h"
    elif hours_left <= 3.0:
        urgency = "warning_3h"
    elif hours_left <= 6.0:
        urgency = "warning_6h"
    else:
        urgency = "normal"

    return effective_date, hours_left, urgency


# --- User CRUD ---
async def get_or_create_user(
    session: AsyncSession,
    telegram_id: int,
    username: Optional[str] = None,
    first_name: Optional[str] = None,
) -> User:
    stmt = select(User).where(User.telegram_id == telegram_id)
    res = await session.execute(stmt)
    user = res.scalar_one_or_none()

    if not user:
        user = User(
            telegram_id=telegram_id,
            username=username,
            first_name=first_name,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
    else:
        changed = False
        if username and user.username != username:
            user.username = username
            changed = True
        if first_name and user.first_name != first_name:
            user.first_name = first_name
            changed = True
        if changed:
            await session.commit()
            await session.refresh(user)

    return user


async def update_user(
    session: AsyncSession, telegram_id: int, update_data: UserUpdate
) -> Optional[User]:
    stmt = select(User).where(User.telegram_id == telegram_id)
    res = await session.execute(stmt)
    user = res.scalar_one_or_none()
    if not user:
        return None

    update_dict = update_data.model_dump(exclude_unset=True)
    for key, value in update_dict.items():
        if value is not None:
            setattr(user, key, value)

    await session.commit()
    await session.refresh(user)
    return user


# --- Routine Tasks CRUD ---
async def create_routine(
    session: AsyncSession,
    user_id: int,
    title: str,
    description: Optional[str] = None,
    target_value: Optional[float] = None,
    step: Optional[float] = 1.0,
    unit: Optional[str] = None,
) -> RoutineTask:
    routine = RoutineTask(
        user_id=user_id,
        title=title.strip(),
        description=description.strip() if description else None,
        target_value=target_value,
        step=step or 1.0,
        unit=unit.strip() if unit else None,
    )
    session.add(routine)
    await session.commit()
    await session.refresh(routine)
    return routine


async def update_routine(
    session: AsyncSession,
    routine_id: int,
    user_id: int,
    data: RoutineTaskUpdate,
    target_date: Optional[date] = None,
) -> Optional[RoutineWithStatus]:
    stmt = select(RoutineTask).where(
        and_(RoutineTask.id == routine_id, RoutineTask.user_id == user_id)
    )
    res = await session.execute(stmt)
    routine = res.scalar_one_or_none()
    if not routine:
        return None

    if data.title is not None:
        routine.title = data.title.strip()
    if data.description is not None:
        routine.description = data.description.strip() if data.description else None
    if data.is_active is not None:
        routine.is_active = data.is_active
    if data.target_value is not None:
        routine.target_value = data.target_value
    if data.step is not None:
        routine.step = data.step
    if data.unit is not None:
        routine.unit = data.unit.strip() if data.unit else None

    await session.commit()
    await session.refresh(routine)

    log = None
    if target_date:
        log_stmt = select(RoutineLog).where(
            and_(RoutineLog.routine_id == routine_id, RoutineLog.date == target_date)
        )
        log_res = await session.execute(log_stmt)
        log = log_res.scalar_one_or_none()

    return _routine_to_status(routine, log)


async def get_user_routines_with_status(
    session: AsyncSession, user_id: int, target_date: date
) -> List[RoutineWithStatus]:
    # Select all active routines of the user
    stmt = (
        select(RoutineTask)
        .where(and_(RoutineTask.user_id == user_id, RoutineTask.is_active == True))
        .order_by(RoutineTask.id.asc())
    )
    res = await session.execute(stmt)
    routines = res.scalars().all()

    # Batch load all logs for target_date in a single query (avoid N+1 latency to remote DB)
    routine_ids = [r.id for r in routines]
    logs_by_routine_id = {}
    if routine_ids:
        log_stmt = select(RoutineLog).where(
            and_(RoutineLog.routine_id.in_(routine_ids), RoutineLog.date == target_date)
        )
        log_res = await session.execute(log_stmt)
        for log in log_res.scalars().all():
            logs_by_routine_id[log.routine_id] = log

    result = []
    for r in routines:
        log = logs_by_routine_id.get(r.id)
        result.append(_routine_to_status(r, log))
    return result


async def toggle_routine_completion(
    session: AsyncSession,
    routine_id: int,
    user_id: int,
    target_date: date,
    completed: Optional[bool] = None,
) -> Optional[RoutineWithStatus]:
    # Verify routine belongs to user
    stmt = select(RoutineTask).where(
        and_(RoutineTask.id == routine_id, RoutineTask.user_id == user_id)
    )
    res = await session.execute(stmt)
    routine = res.scalar_one_or_none()
    if not routine:
        return None

    log_stmt = select(RoutineLog).where(
        and_(RoutineLog.routine_id == routine_id, RoutineLog.date == target_date)
    )
    log_res = await session.execute(log_stmt)
    log = log_res.scalar_one_or_none()

    if completed is None:
        new_state = not (log.is_completed if log else False)
    else:
        new_state = completed

    now_utc = datetime.utcnow()

    if not log:
        log = RoutineLog(
            routine_id=routine_id,
            date=target_date,
            is_completed=new_state,
            current_value=0.0,
            completed_at=now_utc if new_state else None,
        )
        session.add(log)
    else:
        log.is_completed = new_state
        log.completed_at = now_utc if new_state else None

    # Sync current_value if numeric target exists
    if routine.target_value is not None and routine.target_value > 0:
        if new_state and (log.current_value or 0.0) < routine.target_value:
            log.current_value = routine.target_value
        elif not new_state and (log.current_value or 0.0) >= routine.target_value:
            log.current_value = 0.0

    # Update streaks
    if new_state:
        routine.current_streak += 1
        if routine.current_streak > routine.best_streak:
            routine.best_streak = routine.current_streak
    else:
        if routine.current_streak > 0:
            routine.current_streak -= 1

    await session.commit()
    await session.refresh(routine)
    await session.refresh(log)

    return _routine_to_status(routine, log)


async def update_routine_progress(
    session: AsyncSession,
    routine_id: int,
    user_id: int,
    target_date: date,
    current_value: Optional[float] = None,
    delta: Optional[float] = None,
) -> Optional[RoutineWithStatus]:
    stmt = select(RoutineTask).where(
        and_(RoutineTask.id == routine_id, RoutineTask.user_id == user_id)
    )
    res = await session.execute(stmt)
    routine = res.scalar_one_or_none()
    if not routine:
        return None

    log_stmt = select(RoutineLog).where(
        and_(RoutineLog.routine_id == routine_id, RoutineLog.date == target_date)
    )
    log_res = await session.execute(log_stmt)
    log = log_res.scalar_one_or_none()

    now_utc = datetime.utcnow()
    if not log:
        log = RoutineLog(
            routine_id=routine_id,
            date=target_date,
            is_completed=False,
            current_value=0.0,
        )
        session.add(log)

    old_val = log.current_value or 0.0
    if current_value is not None:
        new_val = current_value
    elif delta is not None:
        new_val = old_val + delta
    else:
        new_val = old_val

    new_val = max(0.0, round(float(new_val), 2))
    log.current_value = new_val

    # Auto complete / uncomplete check
    if routine.target_value is not None and routine.target_value > 0:
        if new_val >= routine.target_value and not log.is_completed:
            log.is_completed = True
            log.completed_at = now_utc
            routine.current_streak += 1
            if routine.current_streak > routine.best_streak:
                routine.best_streak = routine.current_streak
        elif new_val < routine.target_value and log.is_completed:
            log.is_completed = False
            log.completed_at = None
            if routine.current_streak > 0:
                routine.current_streak -= 1

    await session.commit()
    await session.refresh(routine)
    await session.refresh(log)

    return _routine_to_status(routine, log)


async def delete_routine(
    session: AsyncSession, routine_id: int, user_id: int
) -> bool:
    stmt = delete(RoutineTask).where(
        and_(RoutineTask.id == routine_id, RoutineTask.user_id == user_id)
    )
    res = await session.execute(stmt)
    await session.commit()
    return res.rowcount > 0


# --- OneTimeTask CRUD ---
async def create_one_time_task(
    session: AsyncSession,
    user_id: int,
    title: str,
    scheduled_date: date,
    goal_id: Optional[int] = None,
    priority: int = 0,
    target_value: Optional[float] = None,
    current_value: Optional[float] = 0.0,
    step: Optional[float] = 1.0,
    unit: Optional[str] = None,
) -> OneTimeTask:
    task = OneTimeTask(
        user_id=user_id,
        title=title.strip(),
        scheduled_date=scheduled_date,
        goal_id=goal_id,
        priority=priority,
        target_value=target_value,
        current_value=current_value or 0.0,
        step=step or 1.0,
        unit=unit.strip() if unit else None,
    )
    session.add(task)
    await session.commit()
    await session.refresh(task)
    return task


async def get_day_tasks(
    session: AsyncSession, user_id: int, current_date: date
) -> Tuple[List[OneTimeTaskRead], List[OneTimeTaskRead]]:
    """
    Returns (overdue_tasks, today_tasks).
    Overdue tasks: is_overdue == True OR (scheduled_date < current_date and not is_completed)
    Today tasks: scheduled_date == current_date and not is_overdue
    """
    # First, handle tasks from past dates that weren't marked overdue yet
    is_sqlite = engine.dialect.name == "sqlite"
    if is_sqlite:
        days_diff_expr = func.cast(
            func.julianday(current_date) - func.julianday(OneTimeTask.scheduled_date), Integer
        )
    else:
        days_diff_expr = func.cast(current_date - OneTimeTask.scheduled_date, Integer)

    mark_overdue_stmt = (
        update(OneTimeTask)
        .where(
            and_(
                OneTimeTask.user_id == user_id,
                OneTimeTask.is_completed == False,
                OneTimeTask.scheduled_date < current_date,
            )
        )
        .values(
            is_overdue=True,
            overdue_days=func.max(1, days_diff_expr),
        )
    )
    try:
        await session.execute(mark_overdue_stmt)
        await session.commit()
    except Exception:
        await session.rollback()

    # Query all tasks for user with goal title eager loaded
    stmt = (
        select(OneTimeTask)
        .options(selectinload(OneTimeTask.goal))
        .where(OneTimeTask.user_id == user_id)
        .order_by(OneTimeTask.is_completed.asc(), OneTimeTask.priority.desc(), OneTimeTask.id.desc())
    )
    res = await session.execute(stmt)
    all_tasks = res.scalars().all()

    overdue: List[OneTimeTaskRead] = []
    today: List[OneTimeTaskRead] = []

    for t in all_tasks:
        task_dto = _task_to_read(t)

        if not t.is_completed and (t.is_overdue or t.scheduled_date < current_date):
            overdue.append(task_dto)
        elif t.scheduled_date == current_date:
            today.append(task_dto)

    # Sort overdue by overdue_days desc
    overdue.sort(key=lambda x: (x.is_completed, -x.overdue_days, -x.priority, x.id))
    today.sort(key=lambda x: (x.is_completed, -x.priority, x.id))

    return overdue, today


async def toggle_one_time_task(
    session: AsyncSession, task_id: int, user_id: int, completed: Optional[bool] = None
) -> Optional[OneTimeTaskRead]:
    stmt = (
        select(OneTimeTask)
        .options(selectinload(OneTimeTask.goal))
        .where(and_(OneTimeTask.id == task_id, OneTimeTask.user_id == user_id))
    )
    res = await session.execute(stmt)
    task = res.scalar_one_or_none()
    if not task:
        return None

    if completed is None:
        task.is_completed = not task.is_completed
    else:
        task.is_completed = completed

    task.completed_at = datetime.utcnow() if task.is_completed else None

    # Sync current_value if numeric target exists
    if task.target_value is not None and task.target_value > 0:
        if task.is_completed and (task.current_value or 0.0) < task.target_value:
            task.current_value = task.target_value
        elif not task.is_completed and (task.current_value or 0.0) >= task.target_value:
            task.current_value = 0.0

    await session.commit()
    await session.refresh(task)

    return _task_to_read(task)


async def update_task_progress(
    session: AsyncSession,
    task_id: int,
    user_id: int,
    current_value: Optional[float] = None,
    delta: Optional[float] = None,
) -> Optional[OneTimeTaskRead]:
    stmt = (
        select(OneTimeTask)
        .options(selectinload(OneTimeTask.goal))
        .where(and_(OneTimeTask.id == task_id, OneTimeTask.user_id == user_id))
    )
    res = await session.execute(stmt)
    task = res.scalar_one_or_none()
    if not task:
        return None

    old_val = task.current_value or 0.0
    if current_value is not None:
        new_val = current_value
    elif delta is not None:
        new_val = old_val + delta
    else:
        new_val = old_val

    new_val = max(0.0, round(float(new_val), 2))
    task.current_value = new_val

    # Auto complete / uncomplete check
    if task.target_value is not None and task.target_value > 0:
        if new_val >= task.target_value and not task.is_completed:
            task.is_completed = True
            task.completed_at = datetime.utcnow()
        elif new_val < task.target_value and task.is_completed:
            task.is_completed = False
            task.completed_at = None

    await session.commit()
    await session.refresh(task)

    return _task_to_read(task)


async def postpone_task(
    session: AsyncSession, task_id: int, user_id: int, new_date: date
) -> Optional[OneTimeTaskRead]:
    stmt = (
        select(OneTimeTask)
        .options(selectinload(OneTimeTask.goal))
        .where(and_(OneTimeTask.id == task_id, OneTimeTask.user_id == user_id))
    )
    res = await session.execute(stmt)
    task = res.scalar_one_or_none()
    if not task:
        return None

    task.scheduled_date = new_date
    task.is_overdue = False
    task.overdue_days = 0

    await session.commit()
    await session.refresh(task)

    return _task_to_read(task)


async def update_one_time_task(
    session: AsyncSession,
    task_id: int,
    user_id: int,
    title: Optional[str] = None,
    scheduled_date: Optional[date] = None,
    is_completed: Optional[bool] = None,
    goal_id: Optional[int] = None,
    priority: Optional[int] = None,
    target_value: Optional[float] = None,
    current_value: Optional[float] = None,
    step: Optional[float] = None,
    unit: Optional[str] = None,
) -> Optional[OneTimeTaskRead]:
    stmt = (
        select(OneTimeTask)
        .options(selectinload(OneTimeTask.goal))
        .where(and_(OneTimeTask.id == task_id, OneTimeTask.user_id == user_id))
    )
    res = await session.execute(stmt)
    task = res.scalar_one_or_none()
    if not task:
        return None

    if title is not None:
        task.title = title.strip()
    if scheduled_date is not None:
        task.scheduled_date = scheduled_date
        task.is_overdue = False
        task.overdue_days = 0
    if is_completed is not None:
        task.is_completed = is_completed
        task.completed_at = datetime.utcnow() if is_completed else None
    if goal_id is not None:
        task.goal_id = goal_id if goal_id > 0 else None
    if priority is not None:
        task.priority = priority
    if target_value is not None:
        task.target_value = target_value
    if current_value is not None:
        task.current_value = max(0.0, round(float(current_value), 2))
    if step is not None:
        task.step = step
    if unit is not None:
        task.unit = unit.strip() if unit else None

    # Check auto-complete if current_value / target_value changed
    if task.target_value is not None and task.target_value > 0 and (current_value is not None or target_value is not None):
        if (task.current_value or 0.0) >= task.target_value and not task.is_completed:
            task.is_completed = True
            task.completed_at = datetime.utcnow()
        elif (task.current_value or 0.0) < task.target_value and task.is_completed:
            task.is_completed = False
            task.completed_at = None

    await session.commit()
    await session.refresh(task)
    return _task_to_read(task)


async def delete_one_time_task(
    session: AsyncSession, task_id: int, user_id: int
) -> bool:
    stmt = delete(OneTimeTask).where(
        and_(OneTimeTask.id == task_id, OneTimeTask.user_id == user_id)
    )
    res = await session.execute(stmt)
    await session.commit()
    return res.rowcount > 0


# --- Goals CRUD ---
async def create_goal(
    session: AsyncSession,
    user_id: int,
    title: str,
    description: Optional[str] = None,
    target_date: Optional[date] = None,
) -> Goal:
    goal = Goal(
        user_id=user_id,
        title=title.strip(),
        description=description.strip() if description else None,
        target_date=target_date,
    )
    session.add(goal)
    await session.commit()
    await session.refresh(goal)
    return goal


async def get_user_goals(
    session: AsyncSession, user_id: int
) -> List[GoalWithProgress]:
    stmt = (
        select(Goal)
        .options(selectinload(Goal.subtasks))
        .where(Goal.user_id == user_id)
        .order_by(Goal.is_completed.asc(), Goal.id.desc())
    )
    res = await session.execute(stmt)
    goals = res.scalars().all()

    result: List[GoalWithProgress] = []
    for g in goals:
        subtasks_dto: List[OneTimeTaskRead] = []
        completed_count = 0
        total_count = len(g.subtasks)

        for st in g.subtasks:
            if st.is_completed:
                completed_count += 1
            subtasks_dto.append(_task_to_read(st, g.title))

        pct = int((completed_count / total_count * 100)) if total_count > 0 else 0
        result.append(
            GoalWithProgress(
                id=g.id,
                title=g.title,
                description=g.description,
                target_date=g.target_date,
                is_completed=g.is_completed,
                completed_at=g.completed_at,
                total_subtasks=total_count,
                completed_subtasks=completed_count,
                progress_percentage=pct,
                subtasks=subtasks_dto,
            )
        )
    return result


async def add_subtask_to_goal(
    session: AsyncSession,
    goal_id: int,
    user_id: int,
    title: str,
    scheduled_date: Optional[date] = None,
) -> Optional[OneTimeTaskRead]:
    # Check goal ownership
    stmt = select(Goal).where(and_(Goal.id == goal_id, Goal.user_id == user_id))
    res = await session.execute(stmt)
    goal = res.scalar_one_or_none()
    if not goal:
        return None

    if not scheduled_date:
        user_now = get_user_now("Europe/Moscow")
        scheduled_date = user_now.date()

    task = OneTimeTask(
        user_id=user_id,
        goal_id=goal_id,
        title=title.strip(),
        scheduled_date=scheduled_date,
    )
    session.add(task)
    await session.commit()
    await session.refresh(task)

    return _task_to_read(task, goal.title)


async def delete_goal(session: AsyncSession, goal_id: int, user_id: int) -> bool:
    stmt = delete(Goal).where(and_(Goal.id == goal_id, Goal.user_id == user_id))
    res = await session.execute(stmt)
    await session.commit()
    return res.rowcount > 0


# --- Complete Day Summary for Dashboard ---
async def get_day_summary(
    session: AsyncSession, user: User
) -> DaySummary:
    now = get_user_now(user.timezone)
    effective_date, hours_left, urgency = get_user_effective_date_and_urgency(
        now, user.day_end_time
    )

    routines = await get_user_routines_with_status(session, user.telegram_id, effective_date)
    overdue_tasks, today_tasks = await get_day_tasks(session, user.telegram_id, effective_date)

    total = len(routines) + len(overdue_tasks) + len(today_tasks)
    completed = (
        sum(1 for r in routines if r.is_completed_today)
        + sum(1 for t in overdue_tasks if t.is_completed)
        + sum(1 for t in today_tasks if t.is_completed)
    )

    return DaySummary(
        date=effective_date,
        hours_left_in_day=round(hours_left, 1),
        urgency_level=urgency,
        overdue_tasks=overdue_tasks,
        routine_tasks=routines,
        today_tasks=today_tasks,
        completed_count=completed,
        total_count=total,
    )


# --- Groceries CRUD ---
def _grocery_to_read(g: GroceryItem) -> GroceryItemRead:
    return GroceryItemRead(
        id=g.id,
        user_id=g.user_id,
        title=g.title,
        is_completed=g.is_completed,
        completed_at=g.completed_at,
        target_value=g.target_value,
        current_value=g.current_value or 0.0,
        step=g.step or 1.0,
        unit=g.unit,
        created_at=g.created_at,
    )


async def get_user_groceries(session: AsyncSession, user_id: int) -> GroceryListResponse:
    stmt = (
        select(GroceryItem)
        .where(GroceryItem.user_id == user_id)
        .order_by(desc(GroceryItem.created_at))
    )
    res = await session.execute(stmt)
    items = res.scalars().all()

    active = [_grocery_to_read(item) for item in items if not item.is_completed]
    completed = [_grocery_to_read(item) for item in items if item.is_completed]

    return GroceryListResponse(
        active_items=active,
        completed_items=completed,
        total_count=len(items),
        completed_count=len(completed),
    )


async def create_grocery_item(
    session: AsyncSession,
    user_id: int,
    title: str,
    target_value: Optional[float] = None,
    step: Optional[float] = 1.0,
    unit: Optional[str] = None,
) -> GroceryItemRead:
    item = GroceryItem(
        user_id=user_id,
        title=title.strip(),
        target_value=target_value,
        current_value=0.0,
        step=step or 1.0,
        unit=unit.strip() if unit else None,
        is_completed=False,
    )
    session.add(item)
    await session.commit()
    await session.refresh(item)
    return _grocery_to_read(item)


async def update_grocery_item(
    session: AsyncSession,
    item_id: int,
    user_id: int,
    title: Optional[str] = None,
    is_completed: Optional[bool] = None,
    target_value: Optional[float] = None,
    current_value: Optional[float] = None,
    step: Optional[float] = None,
    unit: Optional[str] = None,
) -> Optional[GroceryItemRead]:
    stmt = select(GroceryItem).where(and_(GroceryItem.id == item_id, GroceryItem.user_id == user_id))
    res = await session.execute(stmt)
    item = res.scalar_one_or_none()
    if not item:
        return None

    if title is not None:
        item.title = title.strip()
    if is_completed is not None:
        item.is_completed = is_completed
        item.completed_at = datetime.utcnow() if is_completed else None
    if target_value is not None:
        item.target_value = target_value
    if current_value is not None:
        item.current_value = max(0.0, float(current_value))
    if step is not None:
        item.step = step
    if unit is not None:
        item.unit = unit.strip() if unit else None

    await session.commit()
    await session.refresh(item)
    return _grocery_to_read(item)


async def delete_grocery_item(session: AsyncSession, item_id: int, user_id: int) -> bool:
    stmt = delete(GroceryItem).where(and_(GroceryItem.id == item_id, GroceryItem.user_id == user_id))
    res = await session.execute(stmt)
    await session.commit()
    return res.rowcount > 0


async def clear_completed_groceries(session: AsyncSession, user_id: int) -> int:
    stmt = delete(GroceryItem).where(and_(GroceryItem.user_id == user_id, GroceryItem.is_completed == True))
    res = await session.execute(stmt)
    await session.commit()
    return res.rowcount

