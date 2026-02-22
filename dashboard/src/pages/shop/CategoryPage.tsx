import { useState, useMemo, useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Link, useLocation } from "react-router-dom";
import {
  ArrowLeft,
  Hammer,
  Desktop,
  Gift,
  TShirt,
  Star,
  SortAscending,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { Mono } from "@/components/shared/Mono";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cn } from "@/lib/utils";
import {
  getProductsByCategory,
  sortProducts,
  shopCategories,
  resolveCategorySlug,
  type Product,
  type ProductCategory,
  type SortOption,
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

/* ── Category metadata ── */
const categoryDisplayNames: Record<ProductCategory, string> = {
  miners: "Miners",
  nodes: "Nodes",
  bundles: "Starter Kits",
  merch: "Merchandise",
};

const categoryDescriptions: Record<ProductCategory, string> = {
  miners: "Solo mining hardware for home use",
  nodes: "Run your own Bitcoin full node",
  bundles: "Everything you need to get started",
  merch: "Represent your mining identity",
};

const gradientMap: Record<ProductCategory, string> = {
  miners: "from-bitcoin/30 via-orange-800/20 to-bitcoin/10",
  nodes: "from-cyan/30 via-blue-800/20 to-cyan/10",
  bundles: "from-purple/30 via-purple-800/20 to-purple/10",
  merch: "from-green/30 via-emerald-800/20 to-green/10",
};

const iconMap: Record<ProductCategory, React.ReactNode> = {
  miners: <Hammer size={48} weight="duotone" className="text-bitcoin/60" />,
  nodes: <Desktop size={48} weight="duotone" className="text-cyan/60" />,
  bundles: <Gift size={48} weight="duotone" className="text-purple/60" />,
  merch: <TShirt size={48} weight="duotone" className="text-green/60" />,
};

const categorySlugPaths: Record<string, string> = {
  miners: "bitaxe",
  nodes: "nodes",
  bundles: "bundles",
  merch: "merch",
};

const SORT_OPTIONS: { key: SortOption; label: string }[] = [
  { key: "popular", label: "Popular" },
  { key: "price-asc", label: "Price ↑" },
  { key: "price-desc", label: "Price ↓" },
  { key: "new", label: "New" },
];

/* ══════════════════════════════════════════════════════
   PRODUCT CARD
   ══════════════════════════════════════════════════════ */

function ProductCard({
  product,
  index,
}: {
  product: Product;
  index: number;
}) {
  const prefersReduced = useReducedMotion();
  const categoryPath = categorySlugPaths[product.category] || product.category;

  return (
    <motion.div
      initial={prefersReduced ? {} : { opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={
        prefersReduced
          ? { duration: 0 }
          : { delay: index * 0.06, duration: 0.5, ease: [0.22, 1, 0.36, 1] }
      }
    >
      <Link to={`/shop/${categoryPath}/${product.slug}`}>
        <motion.div
          className="relative bg-gradient-to-b from-white/[0.04] to-transparent border border-white/[0.06] rounded-2xl overflow-hidden group hover:border-white/10 transition-colors h-full"
          whileHover={prefersReduced ? {} : { y: -4 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Image placeholder */}
          <div
            className={cn(
              "h-48 bg-gradient-to-br flex items-center justify-center relative",
              gradientMap[product.category]
            )}
          >
            {iconMap[product.category]}
            {product.badge && (
              <span
                className={cn(
                  "absolute top-3 right-3 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full",
                  product.badge === "BEST SELLER" && "bg-bitcoin/20 text-bitcoin border border-bitcoin/20",
                  product.badge === "NEW" && "bg-cyan/20 text-cyan border border-cyan/20",
                  product.badge === "SALE" && "bg-red/20 text-red border border-red/20",
                  product.badge === "LIMITED" && "bg-purple/20 text-purple border border-purple/20"
                )}
              >
                {product.badge}
              </span>
            )}
          </div>

          <div className="p-5">
            <h3 className="text-body-lg font-semibold text-primary mb-1 group-hover:text-white transition-colors">
              {product.name}
            </h3>

            {/* Show hashrate/power for miners */}
            {product.category === "miners" && product.specs.length > 0 && (
              <Mono className="text-micro text-white/30 mb-2 block">
                {product.specs[0].value}
                {product.specs[1] && ` · ${product.specs[1].value}`}
              </Mono>
            )}

            <p className="text-caption text-white/30 mb-4 line-clamp-2">
              {product.shortDescription}
            </p>

            {/* Price + Rating */}
            <div className="flex items-center justify-between">
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
                      size={12}
                      weight="fill"
                      className={i < Math.round(product.rating) ? "text-bitcoin" : "text-white/10"}
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
   MAIN PAGE
   ══════════════════════════════════════════════════════ */

export default function CategoryPage() {
  const location = useLocation();
  const [sort, setSort] = useState<SortOption>("popular");

  // Resolve category from URL path
  const pathSegment = location.pathname.split("/").pop() || "";
  const category = resolveCategorySlug(pathSegment);

  const products = useMemo(() => {
    if (!category) return [];
    return sortProducts(getProductsByCategory(category), sort);
  }, [category, sort]);

  const categoryInfo = shopCategories.find(
    (c) => c.slug === category || (category === "miners" && c.slug === "miners")
  );

  if (!category) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center px-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-primary mb-4">Category not found</h1>
          <Link to="/shop">
            <Button variant="ghost" leftIcon={<ArrowLeft size={16} />}>
              Back to Shop
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas overflow-hidden">
      {/* ─── HEADER ─── */}
      <section className="relative pt-12 pb-6 px-6">
        <div className="relative z-10 max-w-[1200px] mx-auto">
          <ScrollSection>
            <Link to="/shop" className="inline-flex items-center gap-2 text-caption text-secondary hover:text-primary transition-colors mb-6">
              <ArrowLeft size={14} />
              Back to Shop
            </Link>

            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
              <div>
                <h1 className="text-3xl sm:text-4xl font-bold text-primary mb-2">
                  {categoryDisplayNames[category]}
                </h1>
                <p className="text-base text-white/40">
                  {categoryDescriptions[category]}
                  <span className="ml-2 text-white/20">·</span>
                  <span className="ml-2 text-white/30">{products.length} products</span>
                </p>
              </div>

              {/* Sort control */}
              <div className="flex items-center gap-2 bg-elevated rounded-radius-sm p-0.5 border border-white/4 self-start">
                <SortAscending size={14} className="text-secondary ml-2" />
                {SORT_OPTIONS.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setSort(key)}
                    className={cn(
                      "relative px-3 py-1.5 text-micro font-medium rounded-radius-sm transition-colors",
                      sort === key ? "text-primary" : "text-secondary hover:text-primary"
                    )}
                  >
                    {sort === key && (
                      <motion.div
                        layoutId="category-sort"
                        className="absolute inset-0 bg-surface border border-white/8 rounded-radius-sm shadow-subtle"
                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                      />
                    )}
                    <span className="relative z-10">{label}</span>
                  </button>
                ))}
              </div>
            </div>
          </ScrollSection>
        </div>
      </section>

      {/* ─── PRODUCT GRID ─── */}
      <section className="relative max-w-[1200px] mx-auto px-6 py-8 pb-20">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {products.map((product, i) => (
            <ProductCard key={product.slug} product={product} index={i} />
          ))}
        </div>

        {/* Category cross-sell */}
        {categoryInfo && (
          <ScrollSection className="mt-16">
            <div className="text-center">
              <p className="text-caption text-white/30 mb-4">
                Looking for something else?
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                {shopCategories
                  .filter((c) => c.slug !== category)
                  .map((c) => (
                    <Link
                      key={c.slug}
                      to={`/shop/${categorySlugPaths[c.slug] || c.slug}`}
                    >
                      <Button variant="ghost" size="sm">
                        {c.name}
                      </Button>
                    </Link>
                  ))}
              </div>
            </div>
          </ScrollSection>
        )}
      </section>
    </div>
  );
}
