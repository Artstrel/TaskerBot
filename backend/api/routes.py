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
    OneTimeTaskRead,
    OneTimeTaskCreate,
    OneTimeTaskUpdate,
    GoalWithProgress,
    GoalCreate,
    ExtractedTaskList,
    AIProvidersResponse,
)
from backend.crud import (
    get_or_create_user,
    update_user,
    get_user_now,
    get_user_effective_date_and_urgency,
    get_day_summary,
    create_routine,
    get_user_routines_with_status,
    toggle_routine_completion,
    delete_routine,
    create_one_time_task,
    toggle_one_time_task,
    postpone_task,
    update_one_time_task,
    delete_one_time_task,
    create_goal,
    get_user_goals,
    add_subtask_to_goal,
    delete_goal,
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


@router.post("/routines", response_model=RoutineTaskCreate)
async def add_routine(
    routine_in: RoutineTaskCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    routine = await create_routine(
        session, user.telegram_id, routine_in.title, routine_in.description
    )
    return RoutineTaskCreate(title=routine.title, description=routine.description)


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


@router.post("/goals", response_model=GoalCreate)
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
    return GoalCreate(
        title=goal.title,
        description=goal.description,
        target_date=goal.target_date,
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
):
    now = get_user_now(user.timezone)
    effective_date, _, _ = get_user_effective_date_and_urgency(now, user.day_end_time)
    chosen_provider = provider or user.ai_provider
    return await ai_service.parse_text_tasks(text, effective_date, provider=chosen_provider)


@router.post("/ai/parse-audio", response_model=ExtractedTaskList)
async def ai_parse_audio(
    audio: UploadFile = File(...),
    provider: Optional[str] = Form(None),
    user: User = Depends(get_current_user),
):
    now = get_user_now(user.timezone)
    effective_date, _, _ = get_user_effective_date_and_urgency(now, user.day_end_time)
    audio_bytes = await audio.read()
    chosen_provider = provider or user.ai_provider
    return await ai_service.parse_audio_voice(
        audio_bytes,
        effective_date,
        provider=chosen_provider,
        filename=audio.filename or "audio.ogg",
    )
