import {
  Diamond,
  HardDrives,
  Medal,
  ArrowUp,
  Fire,
  Trophy,
  GameController,
  UsersThree,
  Cube,
  Gear,
  Lightning,
  Bell,
} from "@phosphor-icons/react";
import { type NotificationItem as NotifType } from "@/mocks/notifications";
import { cn } from "@/lib/utils";
import { formatTimeAgo } from "@/mocks/data";

const ICON_MAP: Record<string, React.ReactNode> = {
  personal_best: <Diamond size={18} weight="duotone" className="text-gold" />,
  worker_online: <HardDrives size={18} weight="duotone" className="text-green" />,
  worker_offline: <HardDrives size={18} weight="duotone" className="text-red" />,
  share_submitted: <Lightning size={18} weight="duotone" className="text-cyan" />,
  badge_earned: <Medal size={18} weight="duotone" className="text-purple" />,
  level_up: <ArrowUp size={18} weight="duotone" className="text-bitcoin" />,
  streak_extended: <Fire size={18} weight="duotone" className="text-bitcoin" />,
  streak_warning: <Fire size={18} weight="duotone" className="text-red" />,
  match_starting: <Trophy size={18} weight="duotone" className="text-gold" />,
  match_result: <Trophy size={18} weight="duotone" className="text-cyan" />,
  lottery_results: <GameController size={18} weight="duotone" className="text-purple" />,
  block_found: <Cube size={18} weight="duotone" className="text-bitcoin" />,
  coop_activity: <UsersThree size={18} weight="duotone" className="text-cyan" />,
  maintenance: <Gear size={18} weight="duotone" className="text-secondary" />,
  welcome: <Bell size={18} weight="duotone" className="text-bitcoin" />,
};

interface NotificationItemProps {
  notification: NotifType;
  onClick: () => void;
}

export function NotificationItemRow({ notification, onClick }: NotificationItemProps) {
  const icon = ICON_MAP[notification.subtype] ?? (
    <Bell size={18} weight="duotone" className="text-secondary" />
  );

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-4 py-3 flex items-start gap-3 transition-colors",
        "hover:bg-spotlight/50 focus:bg-spotlight/50 focus:outline-none",
        !notification.read && "bg-elevated/60"
      )}
    >
      {/* Icon */}
      <div className="w-8 h-8 rounded-full bg-elevated flex items-center justify-center flex-shrink-0 mt-0.5">
        {icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p
            className={cn(
              "text-caption font-medium truncate",
              notification.read ? "text-secondary" : "text-primary"
            )}
          >
            {notification.title}
          </p>
          {!notification.read && (
            <span className="w-2 h-2 rounded-full bg-bitcoin flex-shrink-0 mt-1.5" />
          )}
        </div>

        {notification.description && (
          <p className="text-micro text-secondary mt-0.5 truncate">
            {notification.description}
          </p>
        )}

        <p className="text-micro text-subtle mt-1">
          {formatTimeAgo(notification.timestamp)}
        </p>
      </div>
    </button>
  );
}
