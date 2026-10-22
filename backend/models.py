from datetime import datetime as dt_datetime, date as dt_date
from typing import List, Optional
from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.database import Base


class User(Base):
    __tablename__ = "users"

    telegram_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)
    username: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    first_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    timezone: Mapped[str] = mapped_column(String(64), default="Europe/Moscow")
    day_end_time: Mapped[str] = mapped_column(String(5), default="00:00")  # HH:MM
    reminder_6h_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    reminder_3h_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    reminder_1h_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    morning_digest_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    ai_provider: Mapped[str] = mapped_column(String(32), default="groq")
    last_active_date: Mapped[Optional[dt_date]] = mapped_column(Date, nullable=True)
    created_at: Mapped[dt_datetime] = mapped_column(DateTime, default=dt_datetime.utcnow)

    # Relationships
    routine_tasks: Mapped[List["RoutineTask"]] = relationship(
        "RoutineTask", back_populates="user", cascade="all, delete-orphan"
    )
    goals: Mapped[List["Goal"]] = relationship(
        "Goal", back_populates="user", cascade="all, delete-orphan"
    )
    one_time_tasks: Mapped[List["OneTimeTask"]] = relationship(
        "OneTimeTask", back_populates="user", cascade="all, delete-orphan"
    )


class RoutineTask(Base):
    __tablename__ = "routine_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.telegram_id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(500))
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    current_streak: Mapped[int] = mapped_column(Integer, default=0)
    best_streak: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[dt_datetime] = mapped_column(DateTime, default=dt_datetime.utcnow)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="routine_tasks")
    logs: Mapped[List["RoutineLog"]] = relationship(
        "RoutineLog", back_populates="routine", cascade="all, delete-orphan"
    )


class RoutineLog(Base):
    __tablename__ = "routine_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    routine_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("routine_tasks.id", ondelete="CASCADE"), index=True
    )
    date: Mapped[dt_date] = mapped_column(Date, index=True)
    is_completed: Mapped[bool] = mapped_column(Boolean, default=False)
    completed_at: Mapped[Optional[dt_datetime]] = mapped_column(DateTime, nullable=True)

    # Relationships
    routine: Mapped["RoutineTask"] = relationship("RoutineTask", back_populates="logs")


class Goal(Base):
    __tablename__ = "goals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.telegram_id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(500))
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    target_date: Mapped[Optional[dt_date]] = mapped_column(Date, nullable=True)
    is_completed: Mapped[bool] = mapped_column(Boolean, default=False)
    completed_at: Mapped[Optional[dt_datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[dt_datetime] = mapped_column(DateTime, default=dt_datetime.utcnow)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="goals")
    subtasks: Mapped[List["OneTimeTask"]] = relationship(
        "OneTimeTask", back_populates="goal", cascade="all, delete-orphan"
    )


class OneTimeTask(Base):
    __tablename__ = "one_time_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.telegram_id", ondelete="CASCADE"), index=True
    )
    goal_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("goals.id", ondelete="SET NULL"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(500))
    scheduled_date: Mapped[dt_date] = mapped_column(Date, index=True)
    is_completed: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    completed_at: Mapped[Optional[dt_datetime]] = mapped_column(DateTime, nullable=True)
    is_overdue: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    overdue_days: Mapped[int] = mapped_column(Integer, default=0)
    priority: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[dt_datetime] = mapped_column(DateTime, default=dt_datetime.utcnow)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="one_time_tasks")
    goal: Mapped[Optional["Goal"]] = relationship("Goal", back_populates="subtasks")
