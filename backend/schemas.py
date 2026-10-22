from datetime import date, datetime
from typing import List, Optional, Literal
from pydantic import BaseModel, Field


# --- Gemini Parsing Schemas ---
class ExtractedTask(BaseModel):
    category: Literal["routine", "one_time", "goal", "subtask"] = Field(
        ...,
        description="Category: routine (daily habit), one_time (ad-hoc task for a specific date), goal (big long-term target), subtask (step towards a goal)",
    )
    title: str = Field(..., description="Short, clear title of the task or goal")
    description: Optional[str] = Field(None, description="Additional details, notes or steps")
    scheduled_date: Optional[str] = Field(
        None, description="ISO format YYYY-MM-DD for one_time task, or null if today"
    )
    goal_title: Optional[str] = Field(
        None, description="If this is a subtask, which existing or new goal it belongs to"
    )
    target_date: Optional[str] = Field(
        None, description="Target completion date for a goal (YYYY-MM-DD)"
    )


class ExtractedTaskList(BaseModel):
    tasks: List[ExtractedTask] = Field(
        default_factory=list,
        description="List of extracted tasks from voice/text input",
    )


class AIProviderInfo(BaseModel):
    id: str
    name: str
    description: str
    is_configured: bool


class AIProvidersResponse(BaseModel):
    active_provider: str
    providers: List[AIProviderInfo]


class ParseTextRequest(BaseModel):
    text: str
    provider: Optional[str] = None


# --- User Schemas ---
class UserBase(BaseModel):
    telegram_id: int
    username: Optional[str] = None
    first_name: Optional[str] = None
    timezone: str = "Europe/Moscow"
    day_end_time: str = "00:00"
    reminder_6h_enabled: bool = True
    reminder_3h_enabled: bool = True
    reminder_1h_enabled: bool = True
    morning_digest_enabled: bool = True
    ai_provider: str = "groq"


class UserRead(UserBase):
    created_at: datetime

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    timezone: Optional[str] = None
    day_end_time: Optional[str] = None
    reminder_6h_enabled: Optional[bool] = None
    reminder_3h_enabled: Optional[bool] = None
    reminder_1h_enabled: Optional[bool] = None
    morning_digest_enabled: Optional[bool] = None
    ai_provider: Optional[str] = None


# --- Routine Schemas ---
class RoutineTaskCreate(BaseModel):
    title: str
    description: Optional[str] = None


class RoutineTaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class RoutineWithStatus(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    is_active: bool
    current_streak: int
    best_streak: int
    is_completed_today: bool
    completed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# --- Goal Schemas ---
class GoalCreate(BaseModel):
    title: str
    description: Optional[str] = None
    target_date: Optional[date] = None


class GoalUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    target_date: Optional[date] = None
    is_completed: Optional[bool] = None


class OneTimeTaskRead(BaseModel):
    id: int
    user_id: int
    goal_id: Optional[int] = None
    goal_title: Optional[str] = None
    title: str
    scheduled_date: date
    is_completed: bool
    completed_at: Optional[datetime] = None
    is_overdue: bool
    overdue_days: int
    priority: int
    created_at: datetime

    class Config:
        from_attributes = True


class GoalWithProgress(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    target_date: Optional[date] = None
    is_completed: bool
    completed_at: Optional[datetime] = None
    total_subtasks: int = 0
    completed_subtasks: int = 0
    progress_percentage: int = 0
    subtasks: List[OneTimeTaskRead] = Field(default_factory=list)

    class Config:
        from_attributes = True


# --- OneTimeTask Schemas ---
class OneTimeTaskCreate(BaseModel):
    title: str
    scheduled_date: Optional[date] = None  # None = today
    goal_id: Optional[int] = None
    priority: int = 0


class OneTimeTaskUpdate(BaseModel):
    title: Optional[str] = None
    scheduled_date: Optional[date] = None
    is_completed: Optional[bool] = None
    goal_id: Optional[int] = None
    priority: Optional[int] = None


# --- Dashboard Day Summary ---
class DaySummary(BaseModel):
    date: date
    hours_left_in_day: float
    urgency_level: Literal["normal", "warning_6h", "warning_3h", "critical_1h"]
    overdue_tasks: List[OneTimeTaskRead]
    routine_tasks: List[RoutineWithStatus]
    today_tasks: List[OneTimeTaskRead]
    completed_count: int
    total_count: int
