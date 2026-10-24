from datetime import date, datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.models import User
from backend.schemas import (
    UserRead,
    UserUpdate,
    DaySummary,
    RoutineWithStatus,
    RoutineTaskCreate,
    RoutineTaskUpdate,
    ProgressUpdate,
    OneTimeTaskRead,
    OneTimeTaskCreate,
    OneTimeTaskUpdate,
    GoalWithProgress,
    GoalCreate,
    ExtractedTaskList,
    AIProvidersResponse,
    GroceryItemCreate,
    GroceryItemUpdate,
    GroceryItemRead,
    GroceryListResponse,
)
from backend.crud import (
    get_or_create_user,
    update_user,
    get_user_now,
    get_user_effective_date_and_urgency,
    get_day_summary,
    create_routine,
    update_routine,
    update_routine_progress,
    get_user_routines_with_status,
    toggle_routine_completion,
    delete_routine,
    create_one_time_task,
    update_task_progress,
    toggle_one_time_task,
    postpone_task,
    update_one_time_task,
    delete_one_time_task,
    create_goal,
    get_user_goals,
    add_subtask_to_goal,
    delete_goal,
    get_user_groceries,
    create_grocery_item,
    update_grocery_item,
    delete_grocery_item,
    clear_completed_groceries,
)
from backend.ai_service import ai_service

router = APIRouter(prefix="/api")


async def get_current_user(
    telegram_id: int = Query(...),
    username: Optional[str] = Query(None),
    first_name: Optional[str] = Query(None),
    session: AsyncSession = Depends(get_db),
) -> User:
    user = await get_or_create_user(session, telegram_id, username, first_name)
    return user


# --- User & Settings Endpoints ---
@router.get("/user/me", response_model=UserRead)
async def get_me(user: User = Depends(get_current_user)):
    return user


@router.post("/user/sync")
async def sync_user(
    telegram_id: int = Query(...),
    timezone: Optional[str] = Query(None),
    username: Optional[str] = Query(None),
    first_name: Optional[str] = Query(None),
    session: AsyncSession = Depends(get_db),
):
    user = await get_or_create_user(session, telegram_id, username, first_name)
    if timezone and user.timezone != timezone:
        await update_user(session, telegram_id, UserUpdate(timezone=timezone))
    return {"status": "ok", "telegram_id": telegram_id, "timezone": user.timezone}


@router.patch("/user/settings", response_model=UserRead)
async def update_settings(
    settings_data: UserUpdate,
    telegram_id: int = Query(...),
    session: AsyncSession = Depends(get_db),
):
    user = await update_user(session, telegram_id, settings_data)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


# --- Dashboard / Day Summary ---
@router.get("/dashboard/today", response_model=DaySummary)
async def get_dashboard_today(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    summary = await get_day_summary(session, user)
    return summary


# --- Routine Tasks Endpoints ---
@router.get("/routines", response_model=List[RoutineWithStatus])
async def list_routines(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    now = get_user_now(user.timezone)
    effective_date, _, _ = get_user_effective_date_and_urgency(now, user.day_end_time)
    return await get_user_routines_with_status(session, user.telegram_id, effective_date)


@router.post("/routines", response_model=RoutineWithStatus)
async def add_routine(
    routine_in: RoutineTaskCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    now = get_user_now(user.timezone)
    effective_date, _, _ = get_user_effective_date_and_urgency(now, user.day_end_time)
    routine = await create_routine(
        session,
        user.telegram_id,
        routine_in.title,
        routine_in.description,
        target_value=routine_in.target_value,
        step=routine_in.step,
        unit=routine_in.unit,
        frequency_type=routine_in.frequency_type or "daily",
        interval_days=routine_in.interval_days or 1,
        days_of_week=routine_in.days_of_week,
        start_date=routine_in.start_date or effective_date,
    )
    res = await get_user_routines_with_status(session, user.telegram_id, effective_date)
    matching = next((r for r in res if r.id == routine.id), None)
    if matching:
        return matching
    return RoutineWithStatus(
        id=routine.id,
        title=routine.title,
        description=routine.description,
        is_active=routine.is_active,
        current_streak=routine.current_streak,
        best_streak=routine.best_streak,
        is_completed_today=False,
        target_value=routine.target_value,
        current_value=0.0,
        step=routine.step or 1.0,
        unit=routine.unit,
        frequency_type=routine.frequency_type,
        interval_days=routine.interval_days,
        days_of_week=routine_in.days_of_week,
        start_date=routine.start_date,
    )


@router.patch("/routines/{routine_id}", response_model=RoutineWithStatus)
async def update_routine_endpoint(
    routine_id: int,
    routine_in: RoutineTaskUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    now = get_user_now(user.timezone)
    effective_date, _, _ = get_user_effective_date_and_urgency(now, user.day_end_time)
    res = await update_routine(session, routine_id, user.telegram_id, routine_in, effective_date)
    if not res:
        raise HTTPException(status_code=404, detail="Routine not found")
    return res


@router.patch("/routines/{routine_id}/toggle", response_model=RoutineWithStatus)
async def toggle_routine(
    routine_id: int,
    completed: Optional[bool] = None,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    now = get_user_now(user.timezone)
    effective_date, _, _ = get_user_effective_date_and_urgency(now, user.day_end_time)
    res = await toggle_routine_completion(
        session, routine_id, user.telegram_id, effective_date, completed
    )
    if not res:
        raise HTTPException(status_code=404, detail="Routine not found")
    return res


@router.patch("/routines/{routine_id}/progress", response_model=RoutineWithStatus)
async def update_routine_progress_endpoint(
    routine_id: int,
    progress: ProgressUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    now = get_user_now(user.timezone)
    effective_date, _, _ = get_user_effective_date_and_urgency(now, user.day_end_time)
    res = await update_routine_progress(
        session,
        routine_id,
        user.telegram_id,
        effective_date,
        current_value=progress.current_value,
        delta=progress.delta,
    )
    if not res:
        raise HTTPException(status_code=404, detail="Routine not found")
    return res


@router.delete("/routines/{routine_id}")
async def remove_routine(
    routine_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    success = await delete_routine(session, routine_id, user.telegram_id)
    if not success:
        raise HTTPException(status_code=404, detail="Routine not found")
    return {"status": "deleted"}


# --- One-Time Tasks Endpoints ---
@router.post("/tasks", response_model=OneTimeTaskRead)
async def add_task(
    task_in: OneTimeTaskCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    target_date = task_in.scheduled_date
    if not target_date:
        now = get_user_now(user.timezone)
        target_date, _, _ = get_user_effective_date_and_urgency(now, user.day_end_time)

    task = await create_one_time_task(
        session,
        user.telegram_id,
        task_in.title,
        target_date,
        task_in.goal_id,
        task_in.priority,
        target_value=task_in.target_value,
        current_value=task_in.current_value,
        step=task_in.step,
        unit=task_in.unit,
    )
    return OneTimeTaskRead.model_validate(task)


@router.patch("/tasks/{task_id}/toggle", response_model=OneTimeTaskRead)
async def toggle_task(
    task_id: int,
    completed: Optional[bool] = None,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    task = await toggle_one_time_task(session, task_id, user.telegram_id, completed)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.patch("/tasks/{task_id}/progress", response_model=OneTimeTaskRead)
async def update_task_progress_endpoint(
    task_id: int,
    progress: ProgressUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    task = await update_task_progress(
        session,
        task_id,
        user.telegram_id,
        current_value=progress.current_value,
        delta=progress.delta,
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.patch("/tasks/{task_id}/postpone", response_model=OneTimeTaskRead)
async def postpone_task_endpoint(
    task_id: int,
    new_date: date = Query(...),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    task = await postpone_task(session, task_id, user.telegram_id, new_date)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.patch("/tasks/{task_id}", response_model=OneTimeTaskRead)
async def update_task_endpoint(
    task_id: int,
    task_in: OneTimeTaskUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    task = await update_one_time_task(
        session,
        task_id,
        user.telegram_id,
        title=task_in.title,
        scheduled_date=task_in.scheduled_date,
        is_completed=task_in.is_completed,
        goal_id=task_in.goal_id,
        priority=task_in.priority,
        target_value=task_in.target_value,
        current_value=task_in.current_value,
        step=task_in.step,
        unit=task_in.unit,
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.delete("/tasks/{task_id}")
async def remove_task(
    task_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    success = await delete_one_time_task(session, task_id, user.telegram_id)
    if not success:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"status": "deleted"}


# --- Goals Endpoints ---
@router.get("/goals", response_model=List[GoalWithProgress])
async def list_goals(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    return await get_user_goals(session, user.telegram_id)


@router.post("/goals", response_model=GoalWithProgress)
async def add_goal(
    goal_in: GoalCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    goal = await create_goal(
        session,
        user.telegram_id,
        goal_in.title,
        goal_in.description,
        goal_in.target_date,
    )
    return GoalWithProgress(
        id=goal.id,
        title=goal.title,
        description=goal.description,
        target_date=goal.target_date,
        is_completed=goal.is_completed,
        completed_at=goal.completed_at,
        total_subtasks=0,
        completed_subtasks=0,
        progress_percentage=0,
        subtasks=[],
    )


@router.post("/goals/{goal_id}/subtasks", response_model=OneTimeTaskRead)
async def add_goal_subtask(
    goal_id: int,
    title: str = Query(...),
    scheduled_date: Optional[date] = Query(None),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    subtask = await add_subtask_to_goal(
        session, goal_id, user.telegram_id, title, scheduled_date
    )
    if not subtask:
        raise HTTPException(status_code=404, detail="Goal not found")
    return subtask


@router.delete("/goals/{goal_id}")
async def remove_goal(
    goal_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    success = await delete_goal(session, goal_id, user.telegram_id)
    if not success:
        raise HTTPException(status_code=404, detail="Goal not found")
    return {"status": "deleted"}


# --- AI Endpoints for WebApp ---
@router.get("/ai/providers", response_model=AIProvidersResponse)
async def get_ai_providers(
    user: User = Depends(get_current_user),
):
    return ai_service.get_providers_status(user.ai_provider)


@router.post("/ai/parse-text", response_model=ExtractedTaskList)
async def ai_parse_text(
    text: str = Form(...),
    provider: Optional[str] = Form(None),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    now = get_user_now(user.timezone)
    effective_date, _, _ = get_user_effective_date_and_urgency(now, user.day_end_time)
    chosen_provider = provider or user.ai_provider
    user_goals = await get_user_goals(session, user.telegram_id)
    goal_titles = [g.title for g in user_goals if not g.is_completed]
    return await ai_service.parse_text_tasks(
        text, effective_date, provider=chosen_provider, existing_goals=goal_titles
    )


@router.post("/ai/parse-audio", response_model=ExtractedTaskList)
async def ai_parse_audio(
    audio: UploadFile = File(...),
    provider: Optional[str] = Form(None),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    now = get_user_now(user.timezone)
    effective_date, _, _ = get_user_effective_date_and_urgency(now, user.day_end_time)
    audio_bytes = await audio.read()
    chosen_provider = provider or user.ai_provider
    user_goals = await get_user_goals(session, user.telegram_id)
    goal_titles = [g.title for g in user_goals if not g.is_completed]
    return await ai_service.parse_audio_voice(
        audio_bytes,
        effective_date,
        provider=chosen_provider,
        filename=audio.filename or "audio.ogg",
        existing_goals=goal_titles,
    )


# --- Groceries Endpoints ---
@router.get("/groceries", response_model=GroceryListResponse)
async def get_groceries(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    return await get_user_groceries(session, user.telegram_id)


@router.post("/groceries", response_model=GroceryItemRead)
async def create_grocery(
    payload: GroceryItemCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    return await create_grocery_item(
        session,
        user.telegram_id,
        title=payload.title,
        target_value=payload.target_value,
        step=payload.step,
        unit=payload.unit,
    )


@router.patch("/groceries/{item_id}", response_model=GroceryItemRead)
async def update_grocery(
    item_id: int,
    payload: GroceryItemUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    item = await update_grocery_item(
        session,
        item_id=item_id,
        user_id=user.telegram_id,
        title=payload.title,
        is_completed=payload.is_completed,
        target_value=payload.target_value,
        current_value=payload.current_value,
        step=payload.step,
        unit=payload.unit,
    )
    if not item:
        raise HTTPException(status_code=404, detail="Grocery item not found")
    return item


@router.delete("/groceries/{item_id}")
async def remove_grocery(
    item_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    success = await delete_grocery_item(session, item_id, user.telegram_id)
    if not success:
        raise HTTPException(status_code=404, detail="Grocery item not found")
    return {"status": "deleted"}


@router.post("/groceries/clear-completed")
async def clear_completed(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    deleted_count = await clear_completed_groceries(session, user.telegram_id)
    return {"status": "cleared", "deleted_count": deleted_count}


# --- Notifications Endpoints ---
@router.post("/notifications/test")
async def trigger_test_notification(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    try:
        from backend.scheduler import send_test_notification
        return await send_test_notification(session, user)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send test notification: {e}")


