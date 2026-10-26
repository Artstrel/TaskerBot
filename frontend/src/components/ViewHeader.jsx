import React from 'react';

/**
 * ViewHeader - Унифицированный адаптивный компонент заголовка экрана.
 * Реализует единый семантический H1 с иерархией токенов типографики,
 * исключая дублирование разметки между мобильной и десктопной версиями.
 */
export default function ViewHeader({
  title,
  subtitle,
  subtitlePrefix = null,
  actions = null,
  mobileActions = null,
  className = '',
}) {
  return (
    <header className={`view-header ${className}`.trim()}>
      <div className="view-title-group">
        <h1 className="view-title">{title}</h1>
        {(subtitle || subtitlePrefix) && (
          <div className="view-subtitle-row">
            {subtitlePrefix && (
              <div className="view-subtitle-prefix">
                {subtitlePrefix}
              </div>
            )}
            {subtitle && (
              <div className="view-subtitle">
                {subtitle}
              </div>
            )}
          </div>
        )}
      </div>

      {actions && (
        <div className="view-actions view-actions-desktop">
          {actions}
        </div>
      )}

      {mobileActions && (
        <div className="view-actions view-actions-mobile">
          {mobileActions}
        </div>
      )}
    </header>
  );
}
