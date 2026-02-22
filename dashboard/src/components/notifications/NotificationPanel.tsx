import { useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check } from "@phosphor-icons/react";
import { useNavigate } from "react-router-dom";
import { useNotificationStore } from "@/stores/notificationStore";
import { type NotificationItem } from "@/mocks/notifications";
import { NotificationItemRow } from "./NotificationItem";
import { cn } from "@/lib/utils";
import { durations, easings } from "@/lib/animation";

function groupNotifications(items: NotificationItem[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86_400_000);
  const weekStart = new Date(today.getTime() - today.getDay() * 86_400_000);

  const groups: { label: string; items: NotificationItem[] }[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Earlier This Week", items: [] },
    { label: "Older", items: [] },
  ];

  for (const item of items) {
    const ts = item.timestamp.getTime();
    if (ts >= today.getTime()) {
      groups[0].items.push(item);
    } else if (ts >= yesterday.getTime()) {
      groups[1].items.push(item);
    } else if (ts >= weekStart.getTime()) {
      groups[2].items.push(item);
    } else {
      groups[3].items.push(item);
    }
  }

  return groups.filter((g) => g.items.length > 0);
}

export function NotificationPanel() {
  const { notifications, isOpen, closePanel, markAsRead, markAllAsRead, unreadCount } =
    useNotificationStore();
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement>(null);

  const groups = useMemo(() => groupNotifications(notifications), [notifications]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        // Don't close if clicking the bell button
        const bellButton = document.getElementById("notification-bell");
        if (bellButton?.contains(e.target as Node)) return;
        closePanel();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePanel();
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, closePanel]);

  // Focus trap
  useEffect(() => {
    if (!isOpen || !panelRef.current) return;
    const focusable = panelRef.current.querySelectorAll<HTMLElement>(
      "button, [href], [tabindex]:not([tabindex='-1'])"
    );
    if (focusable.length > 0) focusable[0].focus();
  }, [isOpen]);

  const handleNotificationClick = (notification: NotificationItem) => {
    markAsRead(notification.id);
    closePanel();
    if (notification.actionUrl) {
      navigate(notification.actionUrl);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Mobile backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/40 z-40 md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: durations.small }}
            onClick={closePanel}
          />

          {/* Panel */}
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-label="Notifications"
            initial={{ opacity: 0, scale: 0.95, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -8 }}
            transition={{ duration: durations.small, ease: easings.snappy }}
            className={cn(
              "z-50 bg-surface border border-white/8 shadow-heavy overflow-hidden",
              // Desktop: dropdown panel
              "hidden md:block absolute right-0 top-full mt-2 w-[400px] rounded-radius-lg",
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/4">
              <h3 className="text-body font-semibold text-primary">Notifications</h3>
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="flex items-center gap-1.5 text-micro text-cyan hover:text-primary transition-colors"
                >
                  <Check size={14} weight="bold" />
                  Mark All Read
                </button>
              )}
            </div>

            {/* Notification list */}
            <div className="max-h-[480px] overflow-y-auto">
              {groups.length === 0 ? (
                <div className="px-4 py-12 text-center">
                  <p className="text-caption text-secondary">No notifications yet</p>
                </div>
              ) : (
                groups.map((group) => (
                  <div key={group.label}>
                    <div className="px-4 py-2 bg-canvas/50">
                      <span className="text-micro text-secondary uppercase tracking-wider font-medium">
                        {group.label}
                      </span>
                    </div>
                    {group.items.map((notification) => (
                      <NotificationItemRow
                        key={notification.id}
                        notification={notification}
                        onClick={() => handleNotificationClick(notification)}
                      />
                    ))}
                  </div>
                ))
              )}
            </div>
          </motion.div>

          {/* Mobile: full-width slide-over from right */}
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-label="Notifications"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-surface border-l border-white/8 shadow-heavy md:hidden flex flex-col"
          >
            {/* Mobile header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/4 shrink-0">
              <h3 className="text-body font-semibold text-primary">Notifications</h3>
              <div className="flex items-center gap-3">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="flex items-center gap-1.5 text-micro text-cyan hover:text-primary transition-colors"
                  >
                    <Check size={14} weight="bold" />
                    Mark All
                  </button>
                )}
                <button
                  onClick={closePanel}
                  className="text-secondary hover:text-primary transition-colors text-caption font-medium"
                >
                  Done
                </button>
              </div>
            </div>

            {/* Mobile notification list */}
            <div className="flex-1 overflow-y-auto">
              {groups.length === 0 ? (
                <div className="px-4 py-12 text-center">
                  <p className="text-caption text-secondary">No notifications yet</p>
                </div>
              ) : (
                groups.map((group) => (
                  <div key={group.label}>
                    <div className="px-4 py-2 bg-canvas/50">
                      <span className="text-micro text-secondary uppercase tracking-wider font-medium">
                        {group.label}
                      </span>
                    </div>
                    {group.items.map((notification) => (
                      <NotificationItemRow
                        key={notification.id}
                        notification={notification}
                        onClick={() => handleNotificationClick(notification)}
                      />
                    ))}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
