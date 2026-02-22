import { useRef } from "react";
import { motion, useInView, useScroll, useTransform } from "framer-motion";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Hammer,
  Desktop,
  Gift,
  TShirt,
  Lightning,
  Tag as TagIcon,
  Star,
  Storefront,
  ShieldCheck,
  Package,
  CurrencyBtc,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { Mono } from "@/components/shared/Mono";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cn } from "@/lib/utils";
import {
  shopCategories,
  getFeaturedProducts,
  specialOffer,
  type Product,
} from "@/mocks/shop";

/* ══════════════════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════════════════ */

function ScrollSection({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const prefersReduced = useReducedMotion();
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <motion.div
      ref={ref}
      initial={prefersReduced ? {} : { opacity: 0, y: 60 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={
        prefersReduced
          ? { duration: 0 }
          : { duration: 0.9, delay, ease: [0.22, 1, 0.36, 1] }
      }
      className={className}
    >
      {children}
    </motion.div>
  );
}

function FloatingParticles({ count = 20, color = "bitcoin" }: { count?: number; color?: string }) {
  const prefersReduced = useReducedMotion();
  if (prefersReduced) return null;

  const colorMap: Record<string, string> = {
    cyan: "bg-cyan/30",
    bitcoin: "bg-bitcoin/30",
    white: "bg-white/10",
  };

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {Array.from({ length: count }).map((_, i) => {
        const size = 1 + Math.random() * 3;
        const x = Math.random() * 100;
        const y = Math.random() * 100;
        const dur = 4 + Math.random() * 8;
        const particleDelay = Math.random() * 5;

        return (
          <motion.div
            key={i}
            className={cn("absolute rounded-full", colorMap[color] || colorMap.bitcoin)}
            style={{ width: size, height: size, left: `${x}%`, top: `${y}%` }}
            animate={{ y: [0, -30, 0], opacity: [0, 0.8, 0] }}
            transition={{
              duration: dur,
              delay: particleDelay,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        );
      })}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   CATEGORY SHOWCASE
   ══════════════════════════════════════════════════════ */

const categoryConfig: Record<
  string,
  {
    icon: React.ReactNode;
    iconLarge: React.ReactNode;
    gradient: string;
    glowColor: string;
    accentText: string;
    accentBorder: string;
    path: string;
    tagline: string;
  }
> = {
  miners: {
    icon: <Hammer size={22} weight="duotone" />,
    iconLarge: <Hammer size={80} weight="duotone" className="text-bitcoin/40" />,
    gradient: "from-bitcoin/[0.12] via-orange-900/[0.06] to-transparent",
    glowColor: "rgba(247,147,26,0.08)",
    accentText: "text-bitcoin",
    accentBorder: "border-bitcoin/20",
    path: "/shop/bitaxe",
    tagline: "Solo mining hardware",
  },
  nodes: {
    icon: <Desktop size={22} weight="duotone" />,
    iconLarge: <Desktop size={80} weight="duotone" className="text-cyan/40" />,
    gradient: "from-cyan/[0.12] via-blue-900/[0.06] to-transparent",
    glowColor: "rgba(6,182,212,0.08)",
    accentText: "text-cyan",
    accentBorder: "border-cyan/20",
    path: "/shop/nodes",
    tagline: "Sovereignty starts here",
  },
  bundles: {
    icon: <Gift size={22} weight="duotone" />,
    iconLarge: <Gift size={80} weight="duotone" className="text-purple/40" />,
    gradient: "from-purple/[0.12] via-purple-900/[0.06] to-transparent",
    glowColor: "rgba(163,113,247,0.08)",
    accentText: "text-purple",
    accentBorder: "border-purple/20",
    path: "/shop/bundles",
    tagline: "Everything in one box",
  },
  merch: {
    icon: <TShirt size={22} weight="duotone" />,
    iconLarge: <TShirt size={80} weight="duotone" className="text-green/40" />,
    gradient: "from-green/[0.12] via-emerald-900/[0.06] to-transparent",
    glowColor: "rgba(74,222,128,0.08)",
    accentText: "text-green",
    accentBorder: "border-green/20",
    path: "/shop/merch",
    tagline: "Wear your identity",
  },
};

function CategoryShowcase({
  category,
  index,
  featured,
}: {
  category: (typeof shopCategories)[0];
  index: number;
  featured: boolean;
}) {
  const prefersReduced = useReducedMotion();
  const config = categoryConfig[category.slug];

  return (
    <motion.div
      initial={prefersReduced ? {} : { opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={
        prefersReduced
          ? { duration: 0 }
          : { delay: index * 0.1, duration: 0.7, ease: [0.22, 1, 0.36, 1] }
      }
      className={featured ? "sm:col-span-2 lg:col-span-1" : ""}
    >
      <Link to={config.path} className="block group h-full">
        <motion.div
          className="relative h-full rounded-2xl overflow-hidden border border-white/[0.06] hover:border-white/[0.12] transition-all duration-500"
          whileHover={prefersReduced ? {} : { y: -6 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Background gradient fill — the "image" area */}
          <div
            className={cn(
              "relative h-52 bg-gradient-to-br overflow-hidden",
              config.gradient
            )}
          >
            {/* Grid pattern overlay */}
            <div
              className="absolute inset-0 opacity-[0.04]"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)",
                backgroundSize: "32px 32px",
              }}
            />

            {/* Center icon — large, atmospheric */}
            <div className="absolute inset-0 flex items-center justify-center">
              <motion.div
                className="relative"
                whileHover={prefersReduced ? {} : { scale: 1.1, rotate: 3 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              >
                {config.iconLarge}
              </motion.div>
            </div>

            {/* Radial glow behind icon */}
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200px] h-[200px] rounded-full opacity-60 group-hover:opacity-100 transition-opacity duration-700"
              style={{
                background: `radial-gradient(circle, ${config.glowColor} 0%, transparent 70%)`,
              }}
            />

            {/* Floating particles inside card */}
            <FloatingParticles count={6} color={category.slug === "miners" ? "bitcoin" : category.slug === "nodes" ? "cyan" : "white"} />

            {/* Top-left badge */}
            <div className={cn(
              "absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-full border backdrop-blur-sm",
              config.accentBorder,
              "bg-black/30"
            )}>
              <span className={config.accentText}>{config.icon}</span>
              <span className={cn("text-[11px] font-semibold uppercase tracking-wider", config.accentText)}>
                {category.name}
              </span>
            </div>

            {/* Product count pill — bottom right */}
            <div className="absolute bottom-4 right-4 px-2.5 py-1 rounded-full bg-black/40 backdrop-blur-sm border border-white/[0.08]">
              <span className="text-[11px] text-white/50 font-medium">
                {category.productCount} products
              </span>
            </div>
          </div>

          {/* Content area */}
          <div className="relative p-6 bg-gradient-to-b from-white/[0.03] to-transparent">
            <p className="text-[13px] text-white/40 leading-relaxed mb-4 line-clamp-2">
              {category.description}
            </p>

            <div className="flex items-center justify-between">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[11px] text-white/25 uppercase tracking-wider">From</span>
                <Mono className="text-lg font-bold text-primary">
                  ${category.startingPrice}
                </Mono>
              </div>
              <span
                className={cn(
                  "flex items-center gap-1.5 text-[13px] font-medium group-hover:gap-2.5 transition-all duration-300",
                  config.accentText
                )}
              >
                Browse
                <ArrowRight size={14} weight="bold" className="group-hover:translate-x-0.5 transition-transform duration-300" />
              </span>
            </div>
          </div>

          {/* Bottom accent line */}
          <div
            className={cn(
              "absolute bottom-0 left-0 right-0 h-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-500",
              category.slug === "miners"
                ? "bg-gradient-to-r from-transparent via-bitcoin/60 to-transparent"
                : category.slug === "nodes"
                  ? "bg-gradient-to-r from-transparent via-cyan/60 to-transparent"
                  : category.slug === "bundles"
                    ? "bg-gradient-to-r from-transparent via-purple/60 to-transparent"
                    : "bg-gradient-to-r from-transparent via-green/60 to-transparent"
            )}
          />
        </motion.div>
      </Link>
    </motion.div>
  );
}

/* ══════════════════════════════════════════════════════
   FEATURED PRODUCT CARD
   ══════════════════════════════════════════════════════ */

function FeaturedCard({ product, index }: { product: Product; index: number }) {
  const prefersReduced = useReducedMotion();
  const config = categoryConfig[product.category];

  const categorySlugMap: Record<string, string> = {
    miners: "bitaxe",
    nodes: "nodes",
    bundles: "bundles",
    merch: "merch",
  };

  return (
    <motion.div
      initial={prefersReduced ? {} : { opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={
        prefersReduced
          ? { duration: 0 }
          : { delay: index * 0.08, duration: 0.6, ease: [0.22, 1, 0.36, 1] }
      }
      className="snap-start min-w-[300px] md:min-w-0"
    >
      <Link to={`/shop/${categorySlugMap[product.category] || product.category}/${product.slug}`}>
        <motion.div
          className="relative bg-gradient-to-b from-white/[0.04] to-white/[0.01] border border-white/[0.06] rounded-2xl overflow-hidden group hover:border-white/[0.12] transition-all duration-500 h-full"
          whileHover={prefersReduced ? {} : { y: -4 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Image area */}
          <div
            className={cn(
              "relative h-44 bg-gradient-to-br flex items-center justify-center overflow-hidden",
              config.gradient
            )}
          >
            {/* Grid overlay */}
            <div
              className="absolute inset-0 opacity-[0.03]"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)",
                backgroundSize: "24px 24px",
              }}
            />

            <motion.div
              whileHover={prefersReduced ? {} : { scale: 1.08 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              {config.iconLarge}
            </motion.div>

            {/* Glow */}
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[160px] h-[160px] rounded-full"
              style={{
                background: `radial-gradient(circle, ${config.glowColor} 0%, transparent 70%)`,
              }}
            />

            {/* Badge */}
            {product.badge && (
              <span
                className={cn(
                  "absolute top-3 right-3 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full border backdrop-blur-sm",
                  product.badge === "BEST SELLER" && "bg-bitcoin/15 text-bitcoin border-bitcoin/20",
                  product.badge === "NEW" && "bg-cyan/15 text-cyan border-cyan/20",
                  product.badge === "SALE" && "bg-red/15 text-red border-red/20",
                  product.badge === "LIMITED" && "bg-purple/15 text-purple border-purple/20"
                )}
              >
                {product.badge}
              </span>
            )}
          </div>

          {/* Content */}
          <div className="p-5">
            {/* Category tag */}
            <div className="flex items-center gap-1.5 mb-2">
              <span className={cn("text-[10px] font-semibold uppercase tracking-wider", config.accentText)}>
                {product.category === "miners" ? "Miner" : product.category === "nodes" ? "Node" : product.category === "bundles" ? "Starter Kit" : "Merch"}
              </span>
            </div>

            <h4 className="text-body-lg font-semibold text-primary mb-1.5 group-hover:text-white transition-colors">
              {product.name}
            </h4>

            {/* Specs preview for miners */}
            {product.category === "miners" && product.specs.length > 0 && (
              <Mono className="text-micro text-white/25 mb-2 block">
                {product.specs[0].value}
                {product.specs[1] && ` · ${product.specs[1].value}`}
              </Mono>
            )}

            <p className="text-caption text-white/30 mb-4 line-clamp-2">
              {product.shortDescription}
            </p>

            {/* Price + Rating */}
            <div className="flex items-center justify-between pt-3 border-t border-white/[0.04]">
              <div className="flex items-center gap-2">
                <Mono className="text-lg font-bold text-primary">
                  ${product.price}
                </Mono>
                {product.originalPrice && (
                  <Mono className="text-caption text-white/20 line-through">
                    ${product.originalPrice}
                  </Mono>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      size={11}
                      weight="fill"
                      className={i < Math.round(product.rating) ? "text-bitcoin/70" : "text-white/[0.06]"}
                    />
                  ))}
                </div>
                <span className="text-micro text-white/20">({product.reviewCount})</span>
              </div>
            </div>
          </div>
        </motion.div>
      </Link>
    </motion.div>
  );
}

/* ══════════════════════════════════════════════════════
   SPECIAL OFFER BANNER
   ══════════════════════════════════════════════════════ */

function SpecialOfferBanner() {
  const prefersReduced = useReducedMotion();

  return (
    <Link to={`/shop/bundles/${specialOffer.slug}`}>
      <motion.div
        className="relative rounded-2xl overflow-hidden group"
        whileHover={prefersReduced ? {} : { scale: 1.005 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Full background gradient */}
        <div className="absolute inset-0 bg-gradient-to-r from-red/[0.08] via-red/[0.04] to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent" />

        {/* Border */}
        <div className="absolute inset-0 rounded-2xl border border-red/15 group-hover:border-red/25 transition-colors duration-500" />

        {/* Left accent */}
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-red via-red/60 to-red/20 rounded-full" />

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-5 p-6 sm:p-8">
          {/* Left — info */}
          <div className="flex items-center gap-4 flex-1">
            {/* Pulsing indicator */}
            <div className="relative flex-shrink-0">
              <div className="w-3 h-3 rounded-full bg-red" />
              {!prefersReduced && (
                <div className="absolute inset-0 w-3 h-3 rounded-full bg-red animate-ping opacity-75" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <TagIcon size={14} weight="fill" className="text-red" />
                <span className="text-[10px] font-bold text-red uppercase tracking-[0.15em]">
                  Limited Time Offer
                </span>
              </div>
              <h3 className="text-lg font-bold text-primary leading-tight">
                {specialOffer.title}
              </h3>
              <p className="text-[13px] text-white/35 mt-1">
                {specialOffer.description}
              </p>
            </div>
          </div>

          {/* Right — price + CTA */}
          <div className="flex items-center gap-5 sm:flex-shrink-0">
            <div className="text-right">
              <Mono className="text-2xl font-bold text-primary">
                ${specialOffer.price}
              </Mono>
              <div className="flex items-center gap-2 justify-end">
                <Mono className="text-caption text-white/25 line-through">
                  ${specialOffer.originalPrice}
                </Mono>
                <span className="text-micro font-bold text-green">
                  Save ${specialOffer.savings}
                </span>
              </div>
            </div>
            <Button
              variant="danger"
              size="sm"
              rightIcon={<ArrowRight size={14} weight="bold" />}
              className="whitespace-nowrap"
            >
              Grab Deal
            </Button>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}

/* ══════════════════════════════════════════════════════
   TRUST BADGES
   ══════════════════════════════════════════════════════ */

const trustItems = [
  {
    icon: <Lightning size={20} weight="duotone" className="text-bitcoin" />,
    title: "Lightning Checkout",
    desc: "Pay with Bitcoin over Lightning Network",
  },
  {
    icon: <ShieldCheck size={20} weight="duotone" className="text-cyan" />,
    title: "Pre-Configured",
    desc: "Ships ready for TheBitcoinGame.com",
  },
  {
    icon: <Package size={20} weight="duotone" className="text-green" />,
    title: "Free Shipping",
    desc: "On all orders over $100",
  },
  {
    icon: <Star size={20} weight="duotone" className="text-purple" />,
    title: "Community Tested",
    desc: "Reviewed by real solo miners",
  },
];

/* ══════════════════════════════════════════════════════
   MAIN PAGE
   ══════════════════════════════════════════════════════ */

export default function ShopPage() {
  const prefersReduced = useReducedMotion();
  const featured = getFeaturedProducts();
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const heroOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);
  const heroY = useTransform(scrollYProgress, [0, 1], [0, -60]);

  return (
    <div className="min-h-screen bg-canvas overflow-hidden">
      {/* ─── HERO ─── */}
      <section
        ref={heroRef}
        className="relative pt-20 pb-12 px-6 min-h-[40vh] flex flex-col items-center justify-center"
      >
        {/* Background effects */}
        <div className="absolute inset-0">
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px]"
            style={{
              background: "radial-gradient(ellipse at center, rgba(247,147,26,0.05) 0%, transparent 70%)",
            }}
          />
          {/* Grid */}
          <div
            className="absolute inset-0 opacity-[0.02]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
              backgroundSize: "60px 60px",
            }}
          />
          <FloatingParticles count={18} color="bitcoin" />
        </div>

        <motion.div
          style={prefersReduced ? {} : { opacity: heroOpacity, y: heroY }}
          className="relative z-10 max-w-3xl text-center"
        >
          {/* Eyebrow */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] mb-8"
          >
            <Storefront size={14} weight="fill" className="text-bitcoin" />
            <span className="text-[11px] text-white/40 uppercase tracking-[0.2em] font-semibold">
              The Bitcoin Game Store
            </span>
          </motion.div>

          <motion.h1
            className="text-4xl sm:text-5xl md:text-6xl font-bold text-white leading-[1.1] tracking-tight"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            Everything You Need
            <br />
            to{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-bitcoin via-yellow-400 to-bitcoin">
              Start Mining
            </span>
          </motion.h1>

          <motion.p
            className="text-lg text-white/40 mt-6 max-w-lg mx-auto leading-relaxed"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
          >
            Hardware, nodes, starter kits, and gear — curated for solo miners.
          </motion.p>

          {/* Trust strip */}
          <motion.div
            className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mt-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.6 }}
          >
            {trustItems.map((item) => (
              <div key={item.title} className="flex items-center gap-2">
                {item.icon}
                <span className="text-[12px] text-white/30 font-medium">{item.title}</span>
              </div>
            ))}
          </motion.div>
        </motion.div>
      </section>

      {/* ─── SPECIAL OFFER ─── */}
      <section className="relative max-w-[1200px] mx-auto px-6 pb-6">
        <ScrollSection>
          <SpecialOfferBanner />
        </ScrollSection>
      </section>

      {/* ─── CATEGORIES — 2x2 grid of showcase cards ─── */}
      <section className="relative max-w-[1200px] mx-auto px-6 py-12">
        <ScrollSection>
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-primary">
                Shop by Category
              </h2>
              <p className="text-[13px] text-white/30 mt-1.5">
                {shopCategories.reduce((sum, c) => sum + c.productCount, 0)} products across {shopCategories.length} categories
              </p>
            </div>
          </div>
        </ScrollSection>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {shopCategories.map((cat, i) => (
            <CategoryShowcase
              key={cat.slug}
              category={cat}
              index={i}
              featured={i === 0}
            />
          ))}
        </div>
      </section>

      {/* ─── FEATURED PRODUCTS ─── */}
      <section className="relative max-w-[1200px] mx-auto px-6 py-12">
        {/* Section divider glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />

        <ScrollSection>
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-primary">
                Featured
              </h2>
              <p className="text-[13px] text-white/30 mt-1.5">
                Most popular with our community
              </p>
            </div>
            <Link to="/shop/bitaxe" className="hidden sm:block">
              <Button
                variant="ghost"
                size="sm"
                rightIcon={<ArrowRight size={14} />}
              >
                View All
              </Button>
            </Link>
          </div>
        </ScrollSection>

        <div className="flex gap-5 overflow-x-auto pb-4 snap-x snap-mandatory md:grid md:grid-cols-3 md:overflow-visible md:pb-0 scrollbar-hide">
          {featured.map((product, i) => (
            <FeaturedCard key={product.slug} product={product} index={i} />
          ))}
        </div>
      </section>

      {/* ─── BITCOIN PAYMENT CTA ─── */}
      <section className="relative max-w-[1200px] mx-auto px-6 py-16 pb-24">
        <ScrollSection>
          <div className="relative rounded-2xl overflow-hidden">
            {/* Background */}
            <div className="absolute inset-0 bg-gradient-to-r from-bitcoin/[0.06] via-bitcoin/[0.03] to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent" />
            <div className="absolute inset-0 rounded-2xl border border-bitcoin/10" />

            {/* Grid */}
            <div
              className="absolute inset-0 opacity-[0.02]"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)",
                backgroundSize: "40px 40px",
              }}
            />

            {/* Floating BTC icon */}
            <div className="absolute right-8 top-1/2 -translate-y-1/2 hidden lg:block">
              <motion.div
                animate={prefersReduced ? {} : { y: [0, -8, 0], rotate: [0, 3, 0] }}
                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              >
                <CurrencyBtc size={120} weight="duotone" className="text-bitcoin/[0.08]" />
              </motion.div>
            </div>

            <div className="relative z-10 p-8 sm:p-12 max-w-xl">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-bitcoin/10 border border-bitcoin/15 mb-5">
                <Lightning size={12} weight="fill" className="text-bitcoin" />
                <span className="text-[10px] font-bold text-bitcoin uppercase tracking-[0.15em]">
                  Bitcoin Native
                </span>
              </div>

              <h3 className="text-2xl sm:text-3xl font-bold text-primary leading-tight mb-3">
                Pay with Bitcoin.
                <br />
                <span className="text-white/50">No banks. No middlemen.</span>
              </h3>
              <p className="text-[13px] text-white/35 leading-relaxed mb-6">
                Every purchase settles instantly over Lightning Network. Your miner ships pre-configured
                and ready for TheBitcoinGame.com — plug in and start playing.
              </p>
              <Link to="/shop/bitaxe">
                <Button
                  variant="primary"
                  rightIcon={<ArrowRight size={16} weight="bold" />}
                  className="shadow-lg shadow-bitcoin/15"
                >
                  Browse Miners
                </Button>
              </Link>
            </div>
          </div>
        </ScrollSection>
      </section>
    </div>
  );
}
