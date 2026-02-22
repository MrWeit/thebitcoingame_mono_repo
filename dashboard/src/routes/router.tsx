import { lazy, Suspense } from "react";
import { createBrowserRouter } from "react-router-dom";
import { PublicLayout } from "../components/layout/PublicLayout";
import { AppLayout } from "../components/layout/AppLayout";
import { AuthGuard } from "./components/AuthGuard";
import { Placeholder } from "./pages/Placeholder";
import Dashboard from "../pages/Dashboard";
import WorkersPage from "../pages/mining/WorkersPage";
import SharesPage from "../pages/mining/SharesPage";
import DifficultyPage from "../pages/mining/DifficultyPage";
import BlocksPage from "../pages/mining/BlocksPage";
import SetupPage from "../pages/mining/SetupPage";
import GameHub from "../pages/games/GameHub";
import ConnectPage from "../pages/ConnectPage";
import BadgesPage from "../pages/profile/BadgesPage";
import StreaksPage from "../pages/profile/StreaksPage";
import LevelPage from "../pages/profile/LevelPage";
import EducationLanding from "../pages/education/EducationLanding";
import LearnHub from "../pages/education/LearnHub";
import GiftPage from "../pages/GiftPage";

// Phase 7: Competition & Social (non-lazy)
import LeaderboardPage from "../pages/leaderboard/LeaderboardPage";
import RegisterPage from "../pages/worldcup/RegisterPage";
import MyTeamPage from "../pages/worldcup/MyTeamPage";
import CreateCoopPage from "../pages/coop/CreateCoopPage";
import JoinCoopPage from "../pages/coop/JoinCoopPage";

// Phase 11: Secondary Pages
import ProfilePage from "../pages/profile/ProfilePage";
import SettingsPage from "../pages/settings/SettingsPage";
import PublicLeaderboardPage from "../pages/public/PublicLeaderboardPage";
import HowItWorksPage from "../pages/public/HowItWorksPage";
import PublicMinerPage from "../pages/public/PublicMinerPage";
import StatsPage from "../pages/public/StatsPage";
import PublicBlocksPage from "../pages/public/PublicBlocksPage";

// Shop Pages
import ShopPage from "../pages/shop/ShopPage";
import CategoryPage from "../pages/shop/CategoryPage";
import ProductPage from "../pages/shop/ProductPage";

// Lazy-loaded routes (code-split)
const HammerGame = lazy(() => import("../pages/games/HammerGame"));
const HorseRace = lazy(() => import("../pages/games/HorseRace"));
const SlotMachine = lazy(() => import("../pages/games/SlotMachine"));
const ScratchCard = lazy(() => import("../pages/games/ScratchCard"));
const LessonPage = lazy(() => import("../pages/education/LessonPage"));
const WorldCupPage = lazy(() => import("../pages/worldcup/WorldCupPage"));
const MatchDetailPage = lazy(() => import("../pages/worldcup/MatchDetailPage"));
const LeaguesPage = lazy(() => import("../pages/leagues/LeaguesPage"));
const CoopDashboard = lazy(() => import("../pages/coop/CoopDashboard"));

function LazyFallback() {
  return (
    <div className="flex items-center justify-center min-h-[200px]">
      <div className="w-8 h-8 border-2 border-bitcoin/30 border-t-bitcoin rounded-full animate-spin" />
    </div>
  );
}

export const router = createBrowserRouter([
  // Public Routes
  {
    path: "/",
    element: <PublicLayout />,
    children: [
      {
        index: true,
        element: <HowItWorksPage />,
      },
      {
        path: "about",
        element: <Placeholder name="About" />,
      },
      {
        path: "how-it-works",
        element: <HowItWorksPage />,
      },
      {
        path: "connect",
        element: <ConnectPage />,
      },
      {
        path: "leaderboard",
        element: <PublicLeaderboardPage />,
      },
      {
        path: "blocks",
        element: <PublicBlocksPage />,
      },
      {
        path: "stats",
        element: <StatsPage />,
      },
      {
        path: "gift",
        element: <GiftPage />,
      },
      {
        path: "world-cup",
        element: <Suspense fallback={<LazyFallback />}><WorldCupPage /></Suspense>,
      },
      {
        path: "world-cup/:competitionId",
        element: <Suspense fallback={<LazyFallback />}><WorldCupPage /></Suspense>,
      },
      {
        path: "world-cup/:competitionId/match/:matchId",
        element: <Suspense fallback={<LazyFallback />}><MatchDetailPage /></Suspense>,
      },
      {
        path: "education",
        element: <EducationLanding />,
      },
      {
        path: "miner/:address",
        element: <PublicMinerPage />,
      },

      // Shop Routes (public)
      {
        path: "shop",
        element: <ShopPage />,
      },
      {
        path: "shop/bitaxe",
        element: <CategoryPage />,
      },
      {
        path: "shop/nodes",
        element: <CategoryPage />,
      },
      {
        path: "shop/bundles",
        element: <CategoryPage />,
      },
      {
        path: "shop/merch",
        element: <CategoryPage />,
      },
      {
        path: "shop/:category/:productSlug",
        element: <ProductPage />,
      },
    ],
  },

  // Authenticated Routes
  {
    path: "/",
    element: (
      <AuthGuard>
        <AppLayout />
      </AuthGuard>
    ),
    children: [
      // Dashboard
      {
        path: "dashboard",
        element: <Dashboard />,
      },

      // Mining Routes
      {
        path: "mining/workers",
        element: <WorkersPage />,
      },
      {
        path: "mining/workers/:workerId",
        element: <WorkersPage />,
      },
      {
        path: "mining/shares",
        element: <SharesPage />,
      },
      {
        path: "mining/difficulty",
        element: <DifficultyPage />,
      },
      {
        path: "mining/blocks",
        element: <BlocksPage />,
      },
      {
        path: "mining/setup",
        element: <SetupPage />,
      },

      // Games Routes
      {
        path: "games",
        element: <GameHub />,
      },
      {
        path: "games/hammer",
        element: <Suspense fallback={<LazyFallback />}><HammerGame /></Suspense>,
      },
      {
        path: "games/horse-race",
        element: <Suspense fallback={<LazyFallback />}><HorseRace /></Suspense>,
      },
      {
        path: "games/slots",
        element: <Suspense fallback={<LazyFallback />}><SlotMachine /></Suspense>,
      },
      {
        path: "games/scratch",
        element: <Suspense fallback={<LazyFallback />}><ScratchCard /></Suspense>,
      },
      {
        path: "games/lottery-history",
        element: <Placeholder name="Lottery History" />,
      },

      // World Cup Authenticated Routes
      {
        path: "world-cup/my-team",
        element: <MyTeamPage />,
      },
      {
        path: "world-cup/register",
        element: <RegisterPage />,
      },
      {
        path: "world-cup/:id/live",
        element: <Suspense fallback={<LazyFallback />}><MatchDetailPage /></Suspense>,
      },

      // Leagues Routes
      {
        path: "leagues",
        element: <Suspense fallback={<LazyFallback />}><LeaguesPage /></Suspense>,
      },
      {
        path: "leagues/:leagueId",
        element: <Suspense fallback={<LazyFallback />}><LeaguesPage /></Suspense>,
      },

      // Profile Routes
      {
        path: "profile",
        element: <ProfilePage />,
      },
      {
        path: "profile/badges",
        element: <BadgesPage />,
      },
      {
        path: "profile/stats",
        element: <ProfilePage />,
      },
      {
        path: "profile/streaks",
        element: <StreaksPage />,
      },
      {
        path: "profile/level",
        element: <LevelPage />,
      },
      {
        path: "profile/history",
        element: <ProfilePage />,
      },

      // Cooperative Routes
      {
        path: "coop",
        element: <Suspense fallback={<LazyFallback />}><CoopDashboard /></Suspense>,
      },
      {
        path: "coop/create",
        element: <CreateCoopPage />,
      },
      {
        path: "coop/:coopId",
        element: <Suspense fallback={<LazyFallback />}><CoopDashboard /></Suspense>,
      },
      {
        path: "coop/:coopId/settings",
        element: <Placeholder name="Coop Settings" />,
      },
      {
        path: "coop/join/:inviteCode",
        element: <JoinCoopPage />,
      },

      // Leaderboard Routes (Authenticated)
      {
        path: "leaderboard/weekly",
        element: <LeaderboardPage />,
      },
      {
        path: "leaderboard/monthly",
        element: <LeaderboardPage />,
      },
      {
        path: "leaderboard/alltime",
        element: <LeaderboardPage />,
      },
      {
        path: "leaderboard/country",
        element: <LeaderboardPage />,
      },

      // Learn Routes
      {
        path: "learn",
        element: <LearnHub />,
      },
      {
        path: "learn/:trackId/:lessonId",
        element: <Suspense fallback={<LazyFallback />}><LessonPage /></Suspense>,
      },

      // Settings Routes
      {
        path: "settings",
        element: <SettingsPage />,
      },
      {
        path: "settings/notifications",
        element: <SettingsPage />,
      },
      {
        path: "settings/mining",
        element: <SettingsPage />,
      },
      {
        path: "settings/privacy",
        element: <SettingsPage />,
      },
      {
        path: "settings/api-keys",
        element: <SettingsPage />,
      },

    ],
  },
]);
