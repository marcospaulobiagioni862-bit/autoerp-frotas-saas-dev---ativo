import React from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  primaryAction?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
  };
  secondaryActions?: React.ReactNode;
  breadcrumb?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  primaryAction,
  secondaryActions,
  breadcrumb,
}) => {
  return (
    <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
      <div>
        {breadcrumb && (
          <span className="text-xs font-semibold uppercase tracking-wider text-purple-600 dark:text-purple-400 mb-1 block">
            {breadcrumb}
          </span>
        )}
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {description}
          </p>
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        {secondaryActions}
        {primaryAction && (
          <button
            onClick={primaryAction.onClick}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 active:bg-purple-800 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
          >
            {primaryAction.icon}
            <span>{primaryAction.label}</span>
          </button>
        )}
      </div>
    </div>
  );
};
