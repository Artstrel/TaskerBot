from datetime import date, datetime
from typing import List, Optional, Literal, Union, Any
from pydantic import BaseModel, Field, field_validator


def capitalize_first(text: Optional[str]) -> Optional[str]:
    """Capitalize only the first letter of a string, preserving the rest of the text and casing."""
    if not text:
        return text
    s = str(text).strip()
    if not s:
        return s
    for i, ch in enumerate(s):
        if ch.lower() != ch.upper():
            return s[:i] + ch.upper() + s[i + 1:]
        if ch.isdigit():
            return s
        if ch not in ('"', "'", '«', '“', '‘', '`', '(', '['):
            return s
    return s


# --- Gemini / AI Parsing Schemas ---
class ExtractedTask(BaseModel):
    category: Literal["routine", "one_time", "goal", "subtask", "grocery"] = Field(
        ...,
        description="Category: routine (daily habit), one_time (ad-hoc task for a specific date), goal (big long-term target), subtask (step towards a goal), grocery (shopping or food product item)",
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
    target_value: Optional[float] = Field(
        None, description="Numeric target (e.g. 2 for 2 liters, 20 for 20 pushups, 5 for 5 tomatoes)"
    )
    step: Optional[float] = Field(
        None, description="Increment/decrement step (e.g. 0.25 for liters, 1 for reps/items)"
    )
    unit: Optional[str] = Field(
        None, description="Unit of measurement (e.g. 'л', 'мл', 'шт', 'раз', 'кг', 'км', 'стр')"
    )
    frequency_type: Optional[str] = Field(
        None, description="'daily', 'interval' or 'weekly' if category is routine"
    )
    interval_days: Optional[int] = Field(
        None, description="Interval in days for routine (e.g. 3 for every 3 days)"
    )
    days_of_week: Optional[List[int]] = Field(
        None, description="Days of week for routine: 0=Mon, 1=Tue, ..., 6=Sun"
    )

    @field_validator("title", mode="before")
    @classmethod
    def validate_title(cls, v: Any) -> Any:
        if isinstance(v, str):
            return capitalize_first(v)
        return v

    @field_validator("goal_title", mode="before")
    @classmethod
    def validate_goal_title(cls, v: Any) -> Any:
        if isinstance(v, str):
            return capitalize_first(v)
        return v


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
    morning_digest_time: str = "09:00"
    evening_digest_enabled: bool = True
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
    morning_digest_time: Optional[str] = None
    evening_digest_enabled: Optional[bool] = None
    ai_provider: Optional[str] = None


# --- Routine Schemas ---
class RoutineTaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    target_value: Optional[float] = None
    step: Optional[float] = 1.0
    unit: Optional[str] = None
    frequency_type: Optional[str] = "daily"
    interval_days: Optional[int] = 1
    days_of_week: Optional[List[int]] = None
    start_date: Optional[date] = None

    @field_validator("title", mode="before")
    @classmethod
    def validate_title(cls, v: Any) -> Any:
        if isinstance(v, str):
            return capitalize_first(v)
        return v

    @field_validator("days_of_week", mode="before")
    @classmethod
    def parse_days_of_week(cls, v: Any) -> Optional[List[int]]:
        if v is None:
            return None
        if isinstance(v, list):
            return [int(x) for x in v]
        if isinstance(v, str):
            if not v.strip():
                return None
            return [int(x.strip()) for x in v.split(",") if x.strip().isdigit()]
        return None


class RoutineTaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    target_value: Optional[float] = None
    step: Optional[float] = None
    unit: Optional[str] = None
    frequency_type: Optional[str] = None
    interval_days: Optional[int] = None
    days_of_week: Optional[List[int]] = None
    start_date: Optional[date] = None

    @field_validator("title", mode="before")
    @classmethod
    def validate_title(cls, v: Any) -> Any:
        if isinstance(v, str):
            return capitalize_first(v)
        return v

    @field_validator("days_of_week", mode="before")
    @classmethod
    def parse_days_of_week(cls, v: Any) -> Optional[List[int]]:
        if v is None:
            return None
        if isinstance(v, list):
            return [int(x) for x in v]
        if isinstance(v, str):
            if not v.strip():
                return None
            return [int(x.strip()) for x in v.split(",") if x.strip().isdigit()]
        return None


class RoutineWithStatus(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    is_active: bool
    current_streak: int
    best_streak: int
    is_completed_today: bool
    completed_at: Optional[datetime] = None
    target_value: Optional[float] = None
    current_value: float = 0.0
    step: Optional[float] = 1.0
    unit: Optional[str] = None
    frequency_type: Optional[str] = "daily"
    interval_days: Optional[int] = 1
    days_of_week: Optional[List[int]] = None
    start_date: Optional[date] = None

    @field_validator("days_of_week", mode="before")
    @classmethod
    def parse_days_of_week(cls, v: Any) -> Optional[List[int]]:
        if v is None:
            return None
        if isinstance(v, list):
            return [int(x) for x in v]
        if isinstance(v, str):
            if not v.strip():
                return None
            return [int(x.strip()) for x in v.split(",") if x.strip().isdigit()]
        return None

    class Config:
        from_attributes = True


class ProgressUpdate(BaseModel):
    current_value: Optional[float] = None
    delta: Optional[float] = None


# --- Goal Schemas ---
class GoalCreate(BaseModel):
    title: str
    description: Optional[str] = None
    target_date: Optional[date] = None

    @field_validator("title", mode="before")
    @classmethod
    def validate_title(cls, v: Any) -> Any:
        if isinstance(v, str):
            return capitalize_first(v)
        return v

    @field_validator("target_date", mode="before")
    @classmethod
    def parse_target_date(cls, v: Any):
        if not v or v == "null" or v == "":
            return None
        return v


class GoalUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    target_date: Optional[date] = None
    is_completed: Optional[bool] = None

    @field_validator("title", mode="before")
    @classmethod
    def validate_title(cls, v: Any) -> Any:
        if isinstance(v, str):
            return capitalize_first(v)
        return v

    @field_validator("target_date", mode="before")
    @classmethod
    def parse_target_date(cls, v: Any):
        if not v or v == "null" or v == "":
            return None
        return v


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
    target_value: Optional[float] = None
    current_value: float = 0.0
    step: Optional[float] = 1.0
    unit: Optional[str] = None
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
    target_value: Optional[float] = None
    current_value: Optional[float] = 0.0
    step: Optional[float] = 1.0
    unit: Optional[str] = None

    @field_validator("title", mode="before")
    @classmethod
    def validate_title(cls, v: Any) -> Any:
        if isinstance(v, str):
            return capitalize_first(v)
        return v

    @field_validator("scheduled_date", mode="before")
    @classmethod
    def parse_scheduled_date(cls, v: Any):
        if not v or v == "null" or v == "":
            return None
        return v

    @field_validator("priority", mode="before")
    @classmethod
    def parse_priority(cls, v: Any):
        if v is None:
            return 0
        if isinstance(v, str):
            if v.lower() in ("high", "1", "urgent", "высокий"):
                return 1
            return 0
        try:
            return int(v)
        except (ValueError, TypeError):
            return 0


class OneTimeTaskUpdate(BaseModel):
    title: Optional[str] = None
    scheduled_date: Optional[date] = None
    is_completed: Optional[bool] = None
    goal_id: Optional[int] = None
    priority: Optional[int] = None
    target_value: Optional[float] = None
    current_value: Optional[float] = None
    step: Optional[float] = None
    unit: Optional[str] = None

    @field_validator("title", mode="before")
    @classmethod
    def validate_title(cls, v: Any) -> Any:
        if isinstance(v, str):
            return capitalize_first(v)
        return v

    @field_validator("scheduled_date", mode="before")
    @classmethod
    def parse_scheduled_date(cls, v: Any):
        if not v or v == "null" or v == "":
            return None
        return v

    @field_validator("priority", mode="before")
    @classmethod
    def parse_priority(cls, v: Any):
        if v is None:
            return None
        if isinstance(v, str):
            if v.lower() in ("high", "1", "urgent", "высокий"):
                return 1
            return 0
        try:
            return int(v)
        except (ValueError, TypeError):
            return 0


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


# --- Grocery Schemas ---
class GroceryItemBase(BaseModel):
    title: str
    target_value: Optional[float] = None
    step: Optional[float] = 1.0
    unit: Optional[str] = None

    @field_validator("title", mode="before")
    @classmethod
    def validate_title(cls, v: Any) -> Any:
        if isinstance(v, str):
            return capitalize_first(v)
        return v


class GroceryItemCreate(GroceryItemBase):
    pass


class GroceryItemUpdate(BaseModel):
    title: Optional[str] = None
    is_completed: Optional[bool] = None
    target_value: Optional[float] = None
    current_value: Optional[float] = None
    step: Optional[float] = None
    unit: Optional[str] = None

    @field_validator("title", mode="before")
    @classmethod
    def validate_title(cls, v: Any) -> Any:
        if isinstance(v, str):
            return capitalize_first(v)
        return v


class GroceryItemRead(GroceryItemBase):
    id: int
    user_id: int
    is_completed: bool
    completed_at: Optional[datetime] = None
    current_value: float = 0.0
    created_at: datetime

    class Config:
        from_attributes = True


class GroceryListResponse(BaseModel):
    active_items: List[GroceryItemRead]
    completed_items: List[GroceryItemRead]
    total_count: int
    completed_count: int

