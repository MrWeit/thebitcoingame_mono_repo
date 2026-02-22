import { useState, useEffect } from "react";
import { Outlet, Link } from "react-router-dom";
import { Lightning, List, X, Storefront } from "@phosphor-icons/react";
import { ToastProvider } from "../ui/ToastProvider";

export function PublicLayout() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <>
      <div className="min-h-screen bg-canvas flex flex-col">
        {/* Header */}
        <header
          className={`
            sticky top-0 h-16 z-30 transition-all duration-300
            ${scrolled ? "glass border-b border-white/8" : "bg-transparent"}
          `}
        >
          <div className="max-w-[1440px] mx-auto px-6 h-full flex items-center justify-between">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-3">
              <div className="w-10 h-10 bg-bitcoin rounded-lg flex items-center justify-center">
                <Lightning weight="fill" className="w-6 h-6 text-canvas" />
              </div>
              <span className="font-display font-bold text-lg text-primary hidden sm:block">
                TheBitcoinGame
              </span>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-8">
              <Link
                to="/how-it-works"
                className="text-sm font-medium text-secondary hover:text-primary transition-colors"
              >
                How It Works
              </Link>
              <Link
                to="/leaderboard"
                className="text-sm font-medium text-secondary hover:text-primary transition-colors"
              >
                Leaderboard
              </Link>
              <Link
                to="/world-cup"
                className="text-sm font-medium text-secondary hover:text-primary transition-colors"
              >
                World Cup
              </Link>
              <Link
                to="/education"
                className="text-sm font-medium text-secondary hover:text-primary transition-colors"
              >
                Education
              </Link>
              <Link
                to="/stats"
                className="text-sm font-medium text-secondary hover:text-primary transition-colors"
              >
                Stats
              </Link>
            </nav>

            {/* Desktop CTA + Mobile Menu Toggle */}
            <div className="flex items-center gap-3">
              {/* Shop CTA — standout red button */}
              <Link
                to="/shop"
                className="hidden md:flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-red-600/80 to-red-500/80 hover:from-red-500/90 hover:to-red-400/90 text-white font-semibold text-sm rounded-lg transition-all hover:scale-[1.03] hover:shadow-[0_0_16px_rgba(248,81,73,0.25)] relative"
              >
                <Storefront size={16} weight="fill" />
                Shop
                {/* Pulsing notification dot */}
                <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red" />
                </span>
              </Link>

              <Link
                to="/connect"
                className="px-5 py-2.5 bg-bitcoin hover:bg-bitcoin/90 text-canvas font-semibold text-sm rounded-lg transition-colors"
              >
                Connect Wallet
              </Link>

              {/* Mobile Menu Toggle */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden w-10 h-10 flex items-center justify-center bg-elevated border border-white/6 rounded-lg"
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? (
                  <X weight="bold" className="w-5 h-5 text-secondary" />
                ) : (
                  <List weight="bold" className="w-5 h-5 text-secondary" />
                )}
              </button>
            </div>
          </div>

          {/* Mobile Menu Dropdown */}
          {mobileMenuOpen && (
            <div className="md:hidden border-t border-white/4 bg-surface">
              <nav className="px-6 py-4 space-y-3">
                <Link
                  to="/how-it-works"
                  className="block text-sm font-medium text-secondary hover:text-primary transition-colors py-2"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  How It Works
                </Link>
                <Link
                  to="/leaderboard"
                  className="block text-sm font-medium text-secondary hover:text-primary transition-colors py-2"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Leaderboard
                </Link>
                <Link
                  to="/world-cup"
                  className="block text-sm font-medium text-secondary hover:text-primary transition-colors py-2"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  World Cup
                </Link>
                <Link
                  to="/education"
                  className="block text-sm font-medium text-secondary hover:text-primary transition-colors py-2"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Education
                </Link>
                <Link
                  to="/stats"
                  className="block text-sm font-medium text-secondary hover:text-primary transition-colors py-2"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Stats
                </Link>
                <Link
                  to="/shop"
                  className="flex items-center gap-2 text-sm font-medium text-red hover:text-red/80 transition-colors py-2"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Storefront size={16} weight="fill" />
                  Shop
                  <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase bg-red/15 text-red rounded-full leading-none">
                    New
                  </span>
                </Link>
              </nav>
            </div>
          )}
        </header>

        {/* Main Content */}
        <main className="flex-1">
          <Outlet />
        </main>

        {/* Footer */}
        <footer className="bg-surface border-t border-white/4 py-12">
          <div className="max-w-[1440px] mx-auto px-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
              <div>
                <h3 className="text-sm font-semibold text-primary mb-3">Play</h3>
                <ul className="space-y-2">
                  <li>
                    <Link to="/games" className="text-sm text-secondary hover:text-primary">
                      Games
                    </Link>
                  </li>
                  <li>
                    <Link to="/world-cup" className="text-sm text-secondary hover:text-primary">
                      World Cup
                    </Link>
                  </li>
                  <li>
                    <Link to="/leaderboard" className="text-sm text-secondary hover:text-primary">
                      Leaderboard
                    </Link>
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-primary mb-3">Learn</h3>
                <ul className="space-y-2">
                  <li>
                    <Link to="/how-it-works" className="text-sm text-secondary hover:text-primary">
                      How It Works
                    </Link>
                  </li>
                  <li>
                    <Link to="/education" className="text-sm text-secondary hover:text-primary">
                      Education
                    </Link>
                  </li>
                  <li>
                    <Link to="/stats" className="text-sm text-secondary hover:text-primary">
                      Stats
                    </Link>
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-primary mb-3">Shop</h3>
                <ul className="space-y-2">
                  <li>
                    <Link to="/shop/bitaxe" className="text-sm text-secondary hover:text-primary">
                      Bitaxe
                    </Link>
                  </li>
                  <li>
                    <Link to="/shop/nodes" className="text-sm text-secondary hover:text-primary">
                      Nodes
                    </Link>
                  </li>
                  <li>
                    <Link to="/shop/merch" className="text-sm text-secondary hover:text-primary">
                      Merch
                    </Link>
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-primary mb-3">Community</h3>
                <ul className="space-y-2">
                  <li>
                    <a
                      href="https://github.com/thebitcoingame"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-secondary hover:text-primary"
                    >
                      GitHub
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://twitter.com/thebitcoingame"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-secondary hover:text-primary"
                    >
                      Twitter
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://discord.gg/thebitcoingame"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-secondary hover:text-primary"
                    >
                      Discord
                    </a>
                  </li>
                </ul>
              </div>
            </div>

            <div className="pt-8 border-t border-white/4 flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-sm text-subtle font-mono">
                Open source mining. Proprietary fun.
              </p>
              <p className="text-sm text-subtle">
                © 2026 The Bitcoin Game. All rights reserved.
              </p>
            </div>
          </div>
        </footer>
      </div>

      {/* Toast Provider */}
      <ToastProvider />
    </>
  );
}
