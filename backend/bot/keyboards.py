from typing import Optional, List
from aiogram.types import (
    ReplyKeyboardMarkup,
    KeyboardButton,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
    WebAppInfo,
)
from backend.config import settings


def get_main_menu(webapp_url: Optional[str] = None) -> ReplyKeyboardMarkup:
    url = webapp_url or settings.WEBAPP_URL
    webapp_btn = (
        KeyboardButton(text="📱 Открыть WebApp", web_app=WebAppInfo(url=url))
        if url
        else KeyboardButton(text="📱 Открыть WebApp")
    )

    kb = [
        [
            KeyboardButton(text="📋 Задачи на сегодня"),
            KeyboardButton(text="🛒 Список продуктов"),
        ],
        [
            KeyboardButton(text="🎯 Мои цели"),
            KeyboardButton(text="🔄 Рутины"),
        ],
        [
            webapp_btn,
            KeyboardButton(text="⚙️ Настройки"),
        ],
    ]
    return ReplyKeyboardMarkup(keyboard=kb, resize_keyboard=True)


def get_groceries_keyboard(active_items: list, webapp_url: Optional[str] = None) -> InlineKeyboardMarkup:
    url = webapp_url or settings.WEBAPP_URL
    rows = []
    # Up to 8 active items for quick checkoff in chat
    for item in active_items[:8]:
        rows.append([
            InlineKeyboardButton(
                text=f"Куплено: {item.title[:22]}",
                callback_data=f"check_grocery:{item.id}",
            )
        ])

    bottom_row = []
    if url:
        bottom_row.append(InlineKeyboardButton(text="📱 Открыть в WebApp", web_app=WebAppInfo(url=url)))
    bottom_row.append(InlineKeyboardButton(text="🧹 Очистить купленные", callback_data="clear_groceries"))

    if bottom_row:
        rows.append(bottom_row)

    return InlineKeyboardMarkup(inline_keyboard=rows)


def get_webapp_inline_keyboard(webapp_url: Optional[str] = None) -> Optional[InlineKeyboardMarkup]:
    url = (webapp_url or settings.WEBAPP_URL or "").strip()
    if not url.startswith("https://"):
        return None
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="🚀 Запустить TaskerBot WebApp",
                    web_app=WebAppInfo(url=url),
                )
            ]
        ]
    )


def get_task_actions_kb(
    task_id: int,
    is_completed: bool,
    is_overdue: bool = False,
    target_value: Optional[float] = None,
    step: Optional[float] = 1.0,
    unit: Optional[str] = None,
) -> InlineKeyboardMarkup:
    rows = []
    if target_value is not None and target_value > 0:
        step_val = step or 1.0
        step_str = f"{step_val:g}"
        unit_str = f" {unit}" if unit else ""
        rows.append([
            InlineKeyboardButton(text=f"➖ {step_str}{unit_str}", callback_data=f"task_prog:{task_id}:-{step_val}"),
            InlineKeyboardButton(text=f"➕ {step_str}{unit_str}", callback_data=f"task_prog:{task_id}:+{step_val}"),
        ])
    status_text = "↩️ Вернуть" if is_completed else "✅ Сделано"
    rows.append([
        InlineKeyboardButton(text=status_text, callback_data=f"task_toggle:{task_id}"),
        InlineKeyboardButton(text="➡️ Завтра", callback_data=f"task_postpone:{task_id}"),
        InlineKeyboardButton(text="🗑", callback_data=f"task_delete:{task_id}"),
    ])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def get_routine_actions_kb(
    routine_id: int,
    is_completed: bool,
    target_value: Optional[float] = None,
    step: Optional[float] = 1.0,
    unit: Optional[str] = None,
) -> InlineKeyboardMarkup:
    rows = []
    if target_value is not None and target_value > 0:
        step_val = step or 1.0
        step_str = f"{step_val:g}"
        unit_str = f" {unit}" if unit else ""
        rows.append([
            InlineKeyboardButton(text=f"➖ {step_str}{unit_str}", callback_data=f"routine_prog:{routine_id}:-{step_val}"),
            InlineKeyboardButton(text=f"➕ {step_str}{unit_str}", callback_data=f"routine_prog:{routine_id}:+{step_val}"),
        ])
    status_text = "↩️ Отменить" if is_completed else "✅ Выполнено"
    rows.append([
        InlineKeyboardButton(text=status_text, callback_data=f"routine_toggle:{routine_id}"),
        InlineKeyboardButton(text="🗑 Удалить", callback_data=f"routine_delete:{routine_id}"),
    ])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def get_parsed_tasks_confirmation_kb(cache_id: str, tasks_count: int = 0) -> InlineKeyboardMarkup:
    rows = []

    # If there are multiple tasks, provide quick delete buttons for individual items
    if tasks_count > 1:
        del_buttons = [
            InlineKeyboardButton(text=f"🗑 №{i+1}", callback_data=f"del_parsed:{cache_id}:{i}")
            for i in range(tasks_count)
        ]
        for i in range(0, len(del_buttons), 4):
            rows.append(del_buttons[i:i + 4])

    save_text = f"💾 Сохранить ({tasks_count})" if tasks_count > 0 else "💾 Сохранить всё"
    rows.append([
        InlineKeyboardButton(text=save_text, callback_data=f"save_tasks:{cache_id}"),
        InlineKeyboardButton(text="❌ Отмена", callback_data=f"cancel_tasks:{cache_id}"),
    ])

    if settings.WEBAPP_URL:
        rows.append([
            InlineKeyboardButton(
                text="📱 Открыть WebApp для детальной правки",
                web_app=WebAppInfo(url=settings.WEBAPP_URL),
            )
        ])

    return InlineKeyboardMarkup(inline_keyboard=rows)


def get_goal_actions_kb(goal_id: int, is_completed: bool = False) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="➕ Добавить шаг", callback_data=f"goal_add_step:{goal_id}"),
                InlineKeyboardButton(
                    text="✅ Завершить цель" if not is_completed else "↩️ Возобновить",
                    callback_data=f"goal_toggle:{goal_id}",
                ),
            ],
            [
                InlineKeyboardButton(text="🗑 Удалить цель", callback_data=f"goal_delete:{goal_id}")
            ]
        ]
    )


def get_subtask_kb(subtask_id: int, is_completed: bool) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="↩️ Вернуть" if is_completed else "✅ Выполнено",
                    callback_data=f"task_toggle:{subtask_id}",
                ),
                InlineKeyboardButton(
                    text="📅 На сегодня",
                    callback_data=f"subtask_today:{subtask_id}",
                ),
            ]
        ]
    )


def get_settings_kb(
    reminder_6h: bool,
    reminder_3h: bool,
    reminder_1h: bool,
    morning_digest: bool,
    evening_digest: bool = True,
    praise_notifications: bool = True,
) -> InlineKeyboardMarkup:
    def mark(b: bool) -> str:
        return "🔔 Вкл" if b else "🔕 Выкл"

    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=f"За 6 часов: {mark(reminder_6h)}",
                    callback_data="toggle_setting:reminder_6h",
                )
            ],
            [
                InlineKeyboardButton(
                    text=f"За 3 часа: {mark(reminder_3h)}",
                    callback_data="toggle_setting:reminder_3h",
                )
            ],
            [
                InlineKeyboardButton(
                    text=f"За 1 час: {mark(reminder_1h)}",
                    callback_data="toggle_setting:reminder_1h",
                )
            ],
            [
                InlineKeyboardButton(
                    text=f"Похвала за день: {mark(praise_notifications)}",
                    callback_data="toggle_setting:praise_notifications",
                )
            ],
            [
                InlineKeyboardButton(
                    text=f"Утренний дайджест: {mark(morning_digest)}",
                    callback_data="toggle_setting:morning_digest",
                )
            ],
            [
                InlineKeyboardButton(
                    text=f"Вечерний отчет (за 15м): {mark(evening_digest)}",
                    callback_data="toggle_setting:evening_digest",
                )
            ],
            [
                InlineKeyboardButton(
                    text="🔔 Отправить тестовое уведомление",
                    callback_data="test_notification",
                )
            ],
            [
                InlineKeyboardButton(
                    text="🌐 Часовой пояс & время конца дня в WebApp",
                    callback_data="show_tz_help",
                )
            ],
        ]
    )
