import React from 'react';

export interface SkeletonProps {
 className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '' }) => {
 return (
 <div
 className={`animate-pulse bg-graphite-200 dark:bg-graphite-700/60 rounded-lg ${className}`}
 />
 );
};
