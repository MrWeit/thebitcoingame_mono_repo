import { motion } from "framer-motion";
import { useLocation, Link } from "react-router-dom";
import {
  House,
  GameController,
  Trophy,
  ShieldStar,
  HardDrives,
  ChartBar,
  Diamond,
  Cube,
  ListNumbers,
  UsersThree,
  GraduationCap,
  Medal,
  UserCircle,
  Gear,
  CaretLeft,
  CaretRight,
  Fire,
  Lightning,
} from "@phosphor-icons/react";
import { NAV_SECTIONS, SIDEBAR_WIDTH, SIDEBAR_COLLAPSED } from "../../lib/constants";
import { useSidebarStore } from "../../stores/sidebarStore";
import { useAuthStore } from "../../stores/authStore";
import { springs } from "../../lib/animation";

const iconMap = {
  House,
  GameController,
  Trophy,
  ShieldStar,
  HardDrives,
  ChartBar,
  Diamond,
  Cube,
  ListNumbers,
  UsersThree,
  GraduationCap,
  Medal,
  UserCircle,
  Gear,
};

export function Sidebar() {
  const location = useLocation();
  const { collapsed, toggle } = useSidebarStore();
  const { user } = useAuthStore();

  return (
    <motion.aside
      animate={{ width: collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_WIDTH }}
      transition={springs.stiff}
      className="fixed left-0 top-0 h-screen bg-surface border-r border-white/4 flex flex-col z-20"
    >
      {/* Logo Area */}
      <div className="h-20 flex items-center px-4 border-b border-white/4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 bg-bitcoin rounded-lg flex items-center justify-center flex-shrink-0">
            <Lightning weight="fill" className="w-6 h-6 text-canvas" aria-hidden="true" />
          </div>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="overflow-hidden"
            >
              <h1 className="font-display font-bold text-sm text-primary whitespace-nowrap">
                THE BITCOIN GAME
              </h1>
            </motion.div>
          )}
        </div>
      </div>

      {/* Collapse Toggle */}
      <button
        onClick={toggle}
        className="mx-4 my-3 h-9 bg-elevated hover:bg-floating border border-white/6 rounded-lg flex items-center justify-center transition-colors"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? (
          <CaretRight weight="bold" className="w-5 h-5 text-secondary" />
        ) : (
          <CaretLeft weight="bold" className="w-5 h-5 text-secondary" />
        )}
      </button>

      {/* Navigation Sections */}
      <nav role="navigation" aria-label="Sidebar navigation" className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-2">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="mb-6">
            {!collapsed && (
              <h2 className="px-3 mb-2 text-xs font-semibold text-subtle tracking-wide">
                {section.label}
              </h2>
            )}
            <ul className="space-y-1">
              {section.items.map((item) => {
                const Icon = iconMap[item.icon];
                const isActive = location.pathname.startsWith(item.path);

                return (
                  <li key={item.path} className="relative">
                    {isActive && (
                      <motion.div
                        layoutId="sidebar-indicator"
                        transition={springs.stiff}
                        className="absolute left-0 top-0 bottom-0 w-[3px] bg-bitcoin rounded-r-full"
                      />
                    )}
                    <Link
                      to={item.path}
                      aria-current={isActive ? "page" : undefined}
                      className={`
                        relative flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors
                        ${isActive ? "bg-spotlight text-primary" : "text-secondary hover:bg-elevated hover:text-primary"}
                        ${collapsed ? "justify-center" : ""}
                      `}
                    >
                      <Icon
                        weight={isActive ? "fill" : "regular"}
                        className="w-5 h-5 flex-shrink-0"
                        aria-hidden="true"
                      />
                      {!collapsed && (
                        <span className="text-sm font-medium truncate">{item.label}</span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Bottom Status Section */}
      {user && (
        <div className="border-t border-white/4 p-4 space-y-3">
          {/* XP Progress */}
          <div className={collapsed ? "px-0" : ""}>
            {!collapsed && (
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-secondary font-medium">Level {user.level}</span>
                <span className="text-xs text-subtle font-mono">
                  {user.xp}/{user.xpToNext}
                </span>
              </div>
            )}
            <div className="h-1.5 bg-elevated rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(user.xp / user.xpToNext) * 100}%` }}
                transition={springs.gentle}
                className="h-full bg-bitcoin rounded-full"
              />
            </div>
          </div>

          {/* Streak Indicator */}
          <div
            className={`flex items-center gap-2 ${collapsed ? "justify-center" : "justify-between"}`}
          >
            <div className="flex items-center gap-1.5">
              <Fire weight="fill" className="w-4 h-4 text-bitcoin" aria-hidden="true" />
              {!collapsed && (
                <span className="text-xs text-secondary font-medium">
                  {user.streak} week{user.streak !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>

          {/* Workers Status */}
          <div
            className={`flex items-center gap-2 ${collapsed ? "justify-center" : "justify-between"}`}
          >
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green rounded-full animate-pulse" />
              {!collapsed && (
                <span className="text-xs text-secondary font-medium">
                  {user.workersOnline}/{user.workersTotal} workers
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </motion.aside>
  );
}
