import React from 'react';
import { Mic, Plus } from 'lucide-react';
import { hapticFeedback } from '../api';

/**
 * QuickAddBar - Унифицированная адаптивная панель быстрого ввода
 * (задач на сегодня, списка покупок, целей и проектов).
 * 
 * Включает лаконичный инпут + кнопку микрофона (голосовой ввод) + кнопку сабмита «+».
 */
export default function QuickAddBar({
  value = '',
  onChange,
  onSubmit,
  placeholder = 'Добавить...',
  onVoiceClick = null,
  voiceTitle = 'Надиктовать голосом',
  submitTitle = 'Добавить',
  isSubmitting = false,
  className = '',
  autoFocus = false,
}) {
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!value.trim() || isSubmitting) return;
    onSubmit(e);
  };

  const handleVoice = () => {
    hapticFeedback('medium');
    if (onVoiceClick) {
      onVoiceClick();
    }
  };

  const isSubmitDisabled = !value.trim() || isSubmitting;

  return (
    <div className={`quick-add-bar-wrap ${className}`.trim()}>
      <form onSubmit={handleSubmit} className="quick-add-bar-form">
        <input
          type="text"
          className="quick-bar-input"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange && onChange(e.target.value)}
          autoFocus={autoFocus}
        />

        {onVoiceClick && (
          <button
            type="button"
            className="quick-bar-btn quick-bar-btn-voice"
            onClick={handleVoice}
            title={voiceTitle}
            aria-label={voiceTitle}
          >
            <Mic size={16} />
          </button>
        )}

        <button
          type="submit"
          className="quick-bar-btn quick-bar-btn-submit"
          disabled={isSubmitDisabled}
          title={submitTitle}
          aria-label={submitTitle}
        >
          <Plus size={16} />
        </button>
      </form>
    </div>
  );
}
