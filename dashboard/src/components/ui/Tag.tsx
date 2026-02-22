import type { ReactNode } from 'react';
import { Star } from '@phosphor-icons/react';

type TagVariant =
  | 'online'
  | 'offline'
  | 'block-found'
  | 'streak'
  | 'country'
  | 'rarity'
  | 'level';

type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

interface TagProps {
  variant: TagVariant;
  children?: ReactNode;
  className?: string;
  rarity?: Rarity;
  countryCode?: string;
}

function countryToFlag(code: string): string {
  return code
    .toUpperCase()
    .split('')
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join('');
}

const RARITY_STYLES = {
  common: 'bg-secondary/10 text-secondary',
  rare: 'bg-cyan/10 text-cyan',
  epic: 'bg-purple/10 text-purple',
  legendary: 'bg-gold/10 text-gold',
};

export function Tag({
  variant,
  children,
  className = '',
  rarity = 'common',
  countryCode,
}: TagProps) {
  const baseClasses =
    'inline-flex items-center gap-1.5 px-2.5 py-1 text-caption font-medium';

  if (variant === 'online') {
    return (
      <span
        className={`${baseClasses} bg-green/10 text-green rounded-full ${className}`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-green" />
        Online
      </span>
    );
  }

  if (variant === 'offline') {
    return (
      <span
        className={`${baseClasses} bg-subtle/50 text-secondary rounded-full ${className}`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
        Offline
      </span>
    );
  }

  if (variant === 'block-found') {
    return (
      <span
        className={`${baseClasses} bg-gold/10 text-gold rounded-full ${className}`}
      >
        <Star size={12} weight="fill" />
        {children}
      </span>
    );
  }

  if (variant === 'streak') {
    return (
      <span
        className={`${baseClasses} bg-bitcoin/10 text-bitcoin rounded-full ${className}`}
      >
        🔥
        {children}
      </span>
    );
  }

  if (variant === 'country') {
    return (
      <span
        className={`${baseClasses} bg-surface border border-white/6 text-primary rounded-full ${className}`}
      >
        {countryCode && countryToFlag(countryCode)}
        {children}
      </span>
    );
  }

  if (variant === 'rarity') {
    return (
      <span
        className={`${baseClasses} ${RARITY_STYLES[rarity]} rounded-full ${className}`}
      >
        {children}
      </span>
    );
  }

  if (variant === 'level') {
    return (
      <span
        className={`${baseClasses} bg-cyan/10 text-cyan rounded-full ${className}`}
      >
        {children}
      </span>
    );
  }

  return null;
}
