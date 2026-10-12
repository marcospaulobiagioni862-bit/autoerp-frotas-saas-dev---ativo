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
 <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-graphite-200 dark:border-graphite-800 pb-5">
 <div>
 {breadcrumb && (
 <span className="text-xs font-semibold uppercase tracking-wider text-fg-secondary dark:text-fg-secondary mb-1 block">
 {breadcrumb}
 </span>
 )}
 <h1 className="text-2xl font-bold tracking-tight text-graphite-900 dark:text-white">
 {title}
 </h1>
 {description && (
 <p className="text-sm text-graphite-500 dark:text-graphite-400 mt-1">
 {description}
 </p>
 )}
 </div>

 <div className="flex items-center gap-3 flex-wrap">
 {secondaryActions}
 {primaryAction && (
 <button
 onClick={primaryAction.onClick}
 className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-on-action-primary bg-action-primary hover:bg-action-primary-hover active:bg-action-primary-active active:bg-action-primary shadow-sm transition-all focus:outline-none focus:ring-2 focus:border-border focus:ring-offset-2"
 >
 {primaryAction.icon}
 <span>{primaryAction.label}</span>
 </button>
 )}
 </div>
 </div>
 );
};
