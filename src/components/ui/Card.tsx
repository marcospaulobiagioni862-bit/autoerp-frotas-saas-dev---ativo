import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
 padding?: 'none' | 'sm' | 'md' | 'lg';
 hoverEffect?: boolean;
}

export const Card: React.FC<CardProps> = ({
 children,
 padding = 'md',
 className = '',
 hoverEffect,
 ...props
}) => {
 const paddingStyles = {
 none: 'p-0',
 sm: 'p-4',
 md: 'p-6',
 lg: 'p-8',
 };

 return (
 <div
 className={`bg-white dark:bg-graphite-800 border border-graphite-200 dark:border-graphite-700/80 rounded-xl shadow-xs transition-all ${paddingStyles[padding]} ${hoverEffect ? 'hover:shadow-md hover:border-graphite-300 dark:hover:border-graphite-600' : ''} ${className}`}
 {...props}
 >
 {children}
 </div>
 );
};
