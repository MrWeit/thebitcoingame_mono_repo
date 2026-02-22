import { motion } from 'framer-motion';

type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

interface BadgeCardProps {
  badge: {
    slug: string;
    name: string;
    description: string;
    iconUrl?: string;
    rarity: Rarity;
  };
  earned?: { date: Date; metadata?: Record<string, string> };
  onClick?: () => void;
  className?: string;
}

const RARITY_COLORS = {
  common: '#8B949E',
  rare: '#58A6FF',
  epic: '#A371F7',
  legendary: '#D4A843',
};

const RARITY_GLOW = {
  common: 'hover:shadow-[0_0_20px_rgba(139,148,158,0.3)]',
  rare: 'hover:shadow-[0_0_20px_rgba(88,166,255,0.4)]',
  epic: 'hover:shadow-[0_0_20px_rgba(163,113,247,0.4)]',
  legendary: 'hover:shadow-[0_0_20px_rgba(212,168,67,0.5)]',
};

export function BadgeCard({
  badge,
  earned,
  onClick,
  className = '',
}: BadgeCardProps) {
  const isUnlocked = !!earned;
  const rarityColor = RARITY_COLORS[badge.rarity];
  const rarityGlow = RARITY_GLOW[badge.rarity];

  const cardVariants = {
    hover: isUnlocked
      ? {
          y: -4,
          transition: { duration: 0.2 },
        }
      : {},
    tap: !isUnlocked
      ? {
          x: [0, -4, 4, -4, 4, 0],
          transition: { duration: 0.4 },
        }
      : {},
  };

  return (
    <motion.div
      variants={cardVariants}
      whileHover="hover"
      whileTap="tap"
      onClick={onClick}
      className={`bg-surface rounded-radius-lg p-4 border border-white/4 flex flex-col items-center text-center cursor-pointer transition-shadow ${
        isUnlocked ? rarityGlow : ''
      } ${badge.rarity === 'legendary' && isUnlocked ? 'animate-legendary' : ''} ${className}`}
    >
      {/* Icon Area */}
      <div
        className="w-16 h-16 rounded-full bg-elevated flex items-center justify-center mb-3 relative"
        style={
          isUnlocked
            ? {
                border: `2px solid ${rarityColor}`,
              }
            : {}
        }
      >
        {isUnlocked ? (
          badge.iconUrl ? (
            <img
              src={badge.iconUrl}
              alt={badge.name}
              className="w-10 h-10 object-contain"
            />
          ) : (
            <span className="text-2xl">🏆</span>
          )
        ) : (
          <span className="text-2xl grayscale opacity-30">???</span>
        )}
      </div>

      {/* Badge Name */}
      <div
        className={`text-caption font-semibold mb-1 ${
          isUnlocked ? 'text-primary' : 'text-secondary'
        }`}
      >
        {isUnlocked ? badge.name : '???'}
      </div>

      {/* Date/Status */}
      <div className="text-micro text-secondary">
        {earned
          ? new Date(earned.date).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })
          : 'Locked'}
      </div>
    </motion.div>
  );
}
