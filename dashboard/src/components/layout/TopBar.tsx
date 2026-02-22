import { useState, useEffect } from "react";
import { BellSimple } from "@phosphor-icons/react";
import { useAuthStore } from "../../stores/authStore";
import { useNotificationStore } from "../../stores/notificationStore";
import { NotificationPanel } from "../notifications/NotificationPanel";
import { cn } from "@/lib/utils";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function TopBar() {
  const { user } = useAuthStore();
  const { unreadCount, togglePanel, isOpen } = useNotificationStore();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 h-16 flex items-center justify-between px-6 z-10 transition-all duration-300",
        scrolled ? "glass border-b border-white/8" : "bg-transparent"
      )}
    >
      {/* Left: Greeting */}
      <div>
        <h1 className="text-lg font-semibold text-primary">
          {getGreeting()}, {user?.displayName}
        </h1>
        <p className="text-sm text-secondary mt-0.5">
          Decentralizing hashrate, one game at a time
        </p>
      </div>

      {/* Right: Actions */}
      <div className="relative flex items-center gap-3">
        {/* Notification Bell */}
        <button
          id="notification-bell"
          onClick={togglePanel}
          className={cn(
            "relative w-10 h-10 flex items-center justify-center rounded-lg transition-colors",
            "border border-white/6",
            isOpen
              ? "bg-floating text-primary"
              : "bg-elevated hover:bg-floating text-secondary"
          )}
          aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
          aria-expanded={isOpen}
          aria-haspopup="dialog"
        >
          <BellSimple weight={isOpen ? "fill" : "regular"} className="w-5 h-5" />
          {unreadCount > 0 && (
            <span
              className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center px-1 bg-bitcoin text-canvas text-[10px] font-bold rounded-full"
              aria-live="polite"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>

        {/* Notification Panel */}
        <NotificationPanel />
      </div>
    </header>
  );
}
