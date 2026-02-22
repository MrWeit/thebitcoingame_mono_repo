import type { CSSProperties } from 'react';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  rounded?: 'sm' | 'md' | 'lg' | 'full';
  className?: string;
}

const ROUNDED_MAP = {
  sm: 'rounded-radius-sm',
  md: 'rounded-radius-md',
  lg: 'rounded-radius-lg',
  full: 'rounded-radius-full',
};

export function Skeleton({
  width,
  height,
  rounded = 'md',
  className = '',
}: SkeletonProps) {
  const style: CSSProperties = {};

  if (width !== undefined) {
    style.width = typeof width === 'number' ? `${width}px` : width;
  }

  if (height !== undefined) {
    style.height = typeof height === 'number' ? `${height}px` : height;
  }

  return (
    <div
      className={`animate-shimmer ${ROUNDED_MAP[rounded]} ${className}`}
      style={style}
    />
  );
}

export function StatCardSkeleton() {
  return (
    <div className="bg-surface rounded-radius-lg p-6 border border-white/4">
      <div className="flex items-start justify-between mb-4">
        <Skeleton width={40} height={40} rounded="md" />
        <Skeleton width={60} height={20} rounded="full" />
      </div>
      <Skeleton width="60%" height={16} rounded="sm" className="mb-2" />
      <Skeleton width="100%" height={32} rounded="sm" className="mb-3" />
      <Skeleton width="40%" height={14} rounded="sm" />
    </div>
  );
}

export function BadgeCardSkeleton() {
  return (
    <div className="bg-surface rounded-radius-lg p-4 border border-white/4 flex flex-col items-center">
      <Skeleton width={64} height={64} rounded="full" className="mb-3" />
      <Skeleton width="80%" height={14} rounded="sm" className="mb-1" />
      <Skeleton width="60%" height={12} rounded="sm" />
    </div>
  );
}
