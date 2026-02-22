import { useState, useEffect, useCallback } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { BottomTabBar } from "./BottomTabBar";
import { PageTransition } from "../shared/PageTransition";
import { ToastProvider } from "../ui/ToastProvider";
import BlockFoundCelebration from "../celebrations/BlockFoundCelebration";
import { useSidebarStore } from "../../stores/sidebarStore";
import { SIDEBAR_WIDTH, SIDEBAR_COLLAPSED } from "../../lib/constants";

export function AppLayout() {
  const { collapsed } = useSidebarStore();
  const [showCelebration, setShowCelebration] = useState(false);
  const navigate = useNavigate();

  // Dev-mode block celebration trigger (Ctrl+Shift+B)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (import.meta.env.DEV && e.ctrlKey && e.shiftKey && e.key === "B") {
        e.preventDefault();
        setShowCelebration(true);
      }
    }

    function handleCustomEvent() {
      setShowCelebration(true);
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("trigger-block-celebration", handleCustomEvent);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("trigger-block-celebration", handleCustomEvent);
    };
  }, []);

  const handleCelebrationClose = useCallback(() => setShowCelebration(false), []);
  const handleViewDetails = useCallback(() => {
    setShowCelebration(false);
    navigate("/mining/blocks");
  }, [navigate]);

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[9999] focus:bg-bitcoin focus:text-canvas focus:px-4 focus:py-2 focus:rounded-radius-md focus:text-caption focus:font-semibold"
      >
        Skip to main content
      </a>

      <div className="flex min-h-screen bg-canvas">
        {/* Sidebar - Hidden on mobile, visible on tablet+ */}
        <div className="hidden md:block">
          <Sidebar />
        </div>

        {/* Main Content Area */}
        <main
          id="main-content"
          className="flex-1 overflow-y-auto"
          style={{
            marginLeft: 0,
            paddingLeft: 0,
          }}
        >
          <div
            className="hidden md:block"
            style={{
              marginLeft: collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_WIDTH,
              transition: "margin-left 0.3s cubic-bezier(0.2, 0, 0, 1)",
            }}
          >
            <div className="max-w-[1280px] mx-auto px-6">
              <TopBar />
              <PageTransition>
                <div className="py-6">
                  <Outlet />
                </div>
              </PageTransition>
            </div>
          </div>

          {/* Mobile Layout - No sidebar, full width */}
          <div className="md:hidden">
            <div className="px-4">
              <TopBar />
              <PageTransition>
                <div className="py-6 pb-24">
                  <Outlet />
                </div>
              </PageTransition>
            </div>
          </div>
        </main>
      </div>

      {/* Bottom Tab Bar - Only on mobile */}
      <BottomTabBar />

      {/* Toast Provider */}
      <ToastProvider />

      {/* Block Found Celebration Overlay */}
      <BlockFoundCelebration
        isOpen={showCelebration}
        onClose={handleCelebrationClose}
        blockHeight={891234}
        reward={3.125}
        fiatValue={312500}
        isFirstBlock={false}
        onShareClick={handleCelebrationClose}
        onViewDetailsClick={handleViewDetails}
      />
    </>
  );
}
