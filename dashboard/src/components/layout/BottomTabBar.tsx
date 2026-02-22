import { NavLink, useLocation } from "react-router-dom";
import {
  GameController,
  Trophy,
  Medal,
  UserCircle,
  Hammer,
} from "@phosphor-icons/react";
import { TAB_ITEMS } from "../../lib/constants";

const iconMap = {
  Hammer,
  GameController,
  Trophy,
  Medal,
  UserCircle,
};

export function BottomTabBar() {
  const location = useLocation();

  const isActive = (matchPaths: readonly string[]) => {
    return matchPaths.some((path) => location.pathname.startsWith(path));
  };

  return (
    <nav role="navigation" aria-label="Main navigation" className="fixed bottom-0 left-0 right-0 h-14 bg-surface border-t border-white/4 z-30 md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="flex items-center justify-around h-full">
        {TAB_ITEMS.map((item) => {
          const Icon = iconMap[item.icon] || Hammer;
          const active = isActive(item.matchPaths);

          return (
            <NavLink
              key={item.path}
              to={item.path}
              className="flex flex-col items-center justify-center flex-1 h-full gap-1"
              aria-current={active ? "page" : undefined}
              aria-label={item.label}
            >
              <Icon
                weight={active ? "fill" : "regular"}
                className={`w-6 h-6 ${active ? "text-bitcoin" : "text-secondary"}`}
                aria-hidden="true"
              />
              {active && (
                <span className="text-xs font-medium text-bitcoin">{item.label}</span>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
