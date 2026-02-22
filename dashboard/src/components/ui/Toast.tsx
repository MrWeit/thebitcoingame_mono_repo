import { useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle,
  Info,
  Warning,
  XCircle,
  Hammer,
  Star,
  Medal,
  ArrowUp,
  Fire,
  Diamond,
  X,
} from '@phosphor-icons/react';
import type { Toast as ToastType } from '@/stores/toastStore';
import { toastVariants } from '@/lib/animation';

interface ToastProps {
  toast: ToastType;
  onDismiss: (id: string) => void;
}

const TOAST_ICONS: Record<string, typeof CheckCircle> = {
  success: CheckCircle,
  info: Info,
  warning: Warning,
  error: XCircle,
  mining: Hammer,
  reward: Star,
  badge: Medal,
  levelup: ArrowUp,
  streak: Fire,
  'personal-best': Diamond,
};

const TOAST_COLORS: Record<string, string> = {
  success: '#3FB950',
  info: '#58A6FF',
  warning: '#F7931A',
  error: '#F85149',
  mining: '#3FB950',
  reward: '#D4A843',
  badge: '#A371F7',
  levelup: '#D4A843',
  streak: '#F7931A',
  'personal-best': '#F7931A',
};

const TOAST_TEXT_COLORS: Record<string, string> = {
  success: 'text-green',
  info: 'text-cyan',
  warning: 'text-bitcoin',
  error: 'text-red',
  mining: 'text-green',
  reward: 'text-gold',
  badge: 'text-purple',
  levelup: 'text-gold',
  streak: 'text-bitcoin',
  'personal-best': 'text-bitcoin',
};

export function Toast({ toast, onDismiss }: ToastProps) {
  const Icon = TOAST_ICONS[toast.type];
  const borderColor = TOAST_COLORS[toast.type];
  const textColor = TOAST_TEXT_COLORS[toast.type];

  useEffect(() => {
    if (toast.duration && toast.duration > 0) {
      const timer = setTimeout(() => {
        onDismiss(toast.id);
      }, toast.duration);

      return () => clearTimeout(timer);
    }
  }, [toast.id, toast.duration, onDismiss]);

  return (
    <motion.div
      layout
      variants={toastVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      className={`glass rounded-radius-md shadow-medium relative overflow-hidden ${
        toast.type === 'personal-best' || toast.type === 'streak' ? 'shadow-glow-orange' : ''
      }`}
      style={{ borderLeft: `3px solid ${borderColor}` }}
    >
      <div className="flex items-start gap-3 p-4 pr-10">
        <Icon
          className={`${textColor} flex-shrink-0 ${toast.type === 'badge' ? 'animate-spin-once' : ''}`}
          size={20}
          weight="fill"
          aria-hidden="true"
        />

        <div className="flex-1 min-w-0">
          <div className="text-body font-semibold text-primary">
            {toast.title}
          </div>

          {toast.message && (
            <div className="text-caption text-secondary mt-1">
              {toast.message}
            </div>
          )}

          {toast.action && (
            <button
              onClick={toast.action.onClick}
              className="text-caption font-medium text-cyan hover:text-cyan/80 transition-colors mt-2"
            >
              {toast.action.label}
            </button>
          )}
        </div>
      </div>

      <button
        onClick={() => onDismiss(toast.id)}
        className="absolute top-3 right-3 text-secondary hover:text-primary transition-colors"
        aria-label="Dismiss"
      >
        <X size={16} weight="bold" />
      </button>
    </motion.div>
  );
}
