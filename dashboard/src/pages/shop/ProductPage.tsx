import { useState, useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Hammer,
  Desktop,
  Gift,
  TShirt,
  Star,
  ShoppingCart,
  Lightning,
  Check,
  Truck,
  ShieldCheck,
  Package,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { Mono } from "@/components/shared/Mono";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useToast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";
import {
  getProductBySlug,
  getRelatedProducts,
  type Product,
  type ProductCategory,
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

/* ── Tab types ── */
type TabKey = "description" | "specs" | "reviews" | "setup";

const TABS: { key: TabKey; label: string }[] = [
  { key: "description", label: "Description" },
  { key: "specs", label: "Specs" },
  { key: "reviews", label: "Reviews" },
  { key: "setup", label: "Setup Guide" },
];

/* ── Category visual configs ── */
const gradientMap: Record<ProductCategory, string> = {
  miners: "from-bitcoin/30 via-orange-800/20 to-bitcoin/10",
  nodes: "from-cyan/30 via-blue-800/20 to-cyan/10",
  bundles: "from-purple/30 via-purple-800/20 to-purple/10",
  merch: "from-green/30 via-emerald-800/20 to-green/10",
};

const iconMap: Record<ProductCategory, React.ReactNode> = {
  miners: <Hammer size={80} weight="duotone" className="text-bitcoin/40" />,
  nodes: <Desktop size={80} weight="duotone" className="text-cyan/40" />,
  bundles: <Gift size={80} weight="duotone" className="text-purple/40" />,
  merch: <TShirt size={80} weight="duotone" className="text-green/40" />,
};

const smallIconMap: Record<ProductCategory, React.ReactNode> = {
  miners: <Hammer size={48} weight="duotone" className="text-bitcoin/40" />,
  nodes: <Desktop size={48} weight="duotone" className="text-cyan/40" />,
  bundles: <Gift size={48} weight="duotone" className="text-purple/40" />,
  merch: <TShirt size={48} weight="duotone" className="text-green/40" />,
};

const categorySlugPaths: Record<string, string> = {
  miners: "bitaxe",
  nodes: "nodes",
  bundles: "bundles",
  merch: "merch",
};

/* ══════════════════════════════════════════════════════
   STAR RATING
   ══════════════════════════════════════════════════════ */

function StarRating({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={size}
          weight="fill"
          className={i < Math.round(rating) ? "text-bitcoin" : "text-white/10"}
        />
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   PRODUCT IMAGE GALLERY
   ══════════════════════════════════════════════════════ */

function ProductGallery({ product }: { product: Product }) {
  const [activeThumb, setActiveThumb] = useState(0);
  const thumbCount = 3;

  return (
    <div>
      {/* Main image */}
      <div
        className={cn(
          "aspect-square rounded-2xl bg-gradient-to-br flex items-center justify-center relative overflow-hidden border border-white/[0.06]",
          gradientMap[product.category]
        )}
      >
        {iconMap[product.category]}
        {product.badge && (
          <span
            className={cn(
              "absolute top-4 right-4 px-3 py-1 text-[11px] font-bold uppercase tracking-wider rounded-full",
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

      {/* Thumbnails */}
      <div className="flex gap-3 mt-3">
        {Array.from({ length: thumbCount }).map((_, i) => (
          <button
            key={i}
            onClick={() => setActiveThumb(i)}
            className={cn(
              "w-20 h-20 rounded-xl bg-gradient-to-br flex items-center justify-center border transition-all",
              gradientMap[product.category],
              activeThumb === i
                ? "border-white/20 ring-1 ring-white/10"
                : "border-white/[0.06] opacity-50 hover:opacity-70"
            )}
          >
            {smallIconMap[product.category]}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   TAB CONTENT
   ══════════════════════════════════════════════════════ */

function DescriptionTab({ product }: { product: Product }) {
  return (
    <div className="space-y-6">
      <p className="text-base text-white/50 leading-relaxed">
        {product.longDescription}
      </p>

      {product.whatsIncluded && product.whatsIncluded.length > 0 && (
        <div>
          <h4 className="text-body font-semibold text-primary mb-3">What's Included</h4>
          <ul className="space-y-2">
            {product.whatsIncluded.map((item) => (
              <li key={item} className="flex items-center gap-2.5 text-caption text-white/40">
                <Check size={14} weight="bold" className="text-green flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function SpecsTab({ product }: { product: Product }) {
  return (
    <div className="rounded-xl overflow-hidden border border-white/[0.06]">
      {product.specs.map((spec, i) => (
        <div
          key={spec.label}
          className={cn(
            "flex items-center justify-between px-5 py-3",
            i % 2 === 0 ? "bg-white/[0.02]" : "bg-transparent"
          )}
        >
          <span className="text-caption text-white/40">{spec.label}</span>
          <Mono className="text-caption font-medium text-primary">{spec.value}</Mono>
        </div>
      ))}
    </div>
  );
}

function ReviewsTab({ product }: { product: Product }) {
  const avgRating = product.reviews.reduce((sum, r) => sum + r.rating, 0) / product.reviews.length;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="flex items-center gap-4 p-5 rounded-xl bg-white/[0.02] border border-white/[0.04]">
        <div className="text-center">
          <Mono className="text-3xl font-bold text-primary">{avgRating.toFixed(1)}</Mono>
          <StarRating rating={avgRating} size={12} />
          <p className="text-micro text-white/30 mt-1">{product.reviewCount} reviews</p>
        </div>
        <div className="flex-1 space-y-1">
          {[5, 4, 3, 2, 1].map((stars) => {
            const count = product.reviews.filter((r) => r.rating === stars).length;
            const pct = (count / product.reviews.length) * 100;
            return (
              <div key={stars} className="flex items-center gap-2">
                <span className="text-micro text-white/30 w-3">{stars}</span>
                <div className="flex-1 h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-bitcoin/40 rounded-full"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Individual reviews */}
      {product.reviews.map((review) => (
        <div
          key={`${review.author}-${review.date}`}
          className="p-5 rounded-xl bg-white/[0.02] border border-white/[0.04]"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-body font-medium text-primary">{review.author}</span>
              <StarRating rating={review.rating} size={11} />
            </div>
            <span className="text-micro text-white/20">
              {new Date(review.date).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </div>
          <p className="text-caption text-white/40 leading-relaxed">{review.text}</p>
        </div>
      ))}
    </div>
  );
}

function SetupTab({ product }: { product: Product }) {
  if (!product.setupGuide || product.setupGuide.length === 0) {
    return (
      <p className="text-caption text-white/30 text-center py-8">
        No setup guide available for this product.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {product.setupGuide.map((step, i) => (
        <div key={i} className="flex gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-bitcoin/10 border border-bitcoin/20 flex items-center justify-center">
            <Mono className="text-micro font-bold text-bitcoin">{i + 1}</Mono>
          </div>
          <p className="text-caption text-white/50 leading-relaxed pt-1.5">{step}</p>
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   RELATED PRODUCT CARD
   ══════════════════════════════════════════════════════ */

function RelatedCard({ product }: { product: Product }) {
  const prefersReduced = useReducedMotion();
  const categoryPath = categorySlugPaths[product.category] || product.category;

  return (
    <Link to={`/shop/${categoryPath}/${product.slug}`}>
      <motion.div
        className="bg-gradient-to-b from-white/[0.04] to-transparent border border-white/[0.06] rounded-2xl overflow-hidden group hover:border-white/10 transition-colors h-full"
        whileHover={prefersReduced ? {} : { y: -4 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      >
        <div
          className={cn(
            "h-32 bg-gradient-to-br flex items-center justify-center",
            gradientMap[product.category]
          )}
        >
          {smallIconMap[product.category]}
        </div>
        <div className="p-4">
          <h4 className="text-caption font-semibold text-primary mb-1 group-hover:text-white transition-colors">
            {product.name}
          </h4>
          <div className="flex items-center justify-between">
            <Mono className="text-body font-bold text-primary">${product.price}</Mono>
            <div className="flex items-center gap-1 text-bitcoin">
              <Star size={10} weight="fill" />
              <span className="text-micro">{product.rating}</span>
            </div>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}

/* ══════════════════════════════════════════════════════
   MAIN PAGE
   ══════════════════════════════════════════════════════ */

export default function ProductPage() {
  const { productSlug, category: categoryParam } = useParams<{
    productSlug: string;
    category: string;
  }>();
  const [activeTab, setActiveTab] = useState<TabKey>("description");
  const { toast } = useToast();

  const product = productSlug ? getProductBySlug(productSlug) : undefined;

  const handleAddToCart = () => {
    toast({
      type: "info",
      title: "Shop launching soon!",
      message: "Join the waitlist to be notified when the shop goes live.",
    });
  };

  const handleBuyNow = () => {
    toast({
      type: "info",
      title: "Shop launching soon!",
      message: "Lightning checkout coming soon. Join the waitlist!",
    });
  };

  if (!product) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center px-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-primary mb-4">Product not found</h1>
          <Link to="/shop">
            <Button variant="ghost" leftIcon={<ArrowLeft size={16} />}>
              Back to Shop
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const related = getRelatedProducts(product);
  const backPath = `/shop/${categoryParam || categorySlugPaths[product.category] || product.category}`;

  return (
    <div className="min-h-screen bg-canvas overflow-hidden">
      {/* ─── BREADCRUMB ─── */}
      <section className="relative max-w-[1200px] mx-auto px-6 pt-8 pb-2">
        <ScrollSection>
          <div className="flex items-center gap-2 text-caption text-secondary">
            <Link to="/shop" className="hover:text-primary transition-colors">
              Shop
            </Link>
            <span className="text-white/20">/</span>
            <Link to={backPath} className="hover:text-primary transition-colors">
              {product.category === "miners"
                ? "Miners"
                : product.category === "nodes"
                  ? "Nodes"
                  : product.category === "bundles"
                    ? "Starter Kits"
                    : "Merchandise"}
            </Link>
            <span className="text-white/20">/</span>
            <span className="text-primary">{product.name}</span>
          </div>
        </ScrollSection>
      </section>

      {/* ─── PRODUCT HERO ─── */}
      <section className="relative max-w-[1200px] mx-auto px-6 py-8">
        <ScrollSection>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
            {/* Left: Gallery */}
            <ProductGallery product={product} />

            {/* Right: Info */}
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-primary mb-3">
                {product.name}
              </h1>

              {/* Rating */}
              <div className="flex items-center gap-3 mb-5">
                <StarRating rating={product.rating} size={16} />
                <span className="text-caption text-white/40">
                  {product.rating} ({product.reviewCount} reviews)
                </span>
              </div>

              {/* Price */}
              <div className="flex items-center gap-3 mb-5">
                <Mono className="text-3xl font-bold text-primary">${product.price}</Mono>
                {product.originalPrice && (
                  <>
                    <Mono className="text-lg text-white/20 line-through">
                      ${product.originalPrice}
                    </Mono>
                    <span className="px-2 py-0.5 text-micro font-bold text-green bg-green/10 rounded-full">
                      Save ${product.originalPrice - product.price}
                    </span>
                  </>
                )}
              </div>

              {/* Stock status */}
              <div className="flex items-center gap-2 mb-6">
                <div className={cn("w-2 h-2 rounded-full", product.inStock ? "bg-green" : "bg-red")} />
                <span className={cn("text-caption font-medium", product.inStock ? "text-green" : "text-red")}>
                  {product.inStock ? "In Stock" : "Out of Stock"}
                </span>
              </div>

              {/* Short description */}
              <p className="text-base text-white/40 leading-relaxed mb-8">
                {product.shortDescription}. {product.longDescription.split(".").slice(0, 2).join(".")}.
              </p>

              {/* Quick specs */}
              {product.specs.length > 0 && (
                <div className="grid grid-cols-2 gap-3 mb-8">
                  {product.specs.slice(0, 6).map((spec) => (
                    <div
                      key={spec.label}
                      className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04]"
                    >
                      <span className="text-micro text-white/30">{spec.label}</span>
                      <Mono className="text-micro font-medium text-white/60">{spec.value}</Mono>
                    </div>
                  ))}
                </div>
              )}

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 mb-8">
                <Button
                  variant="primary"
                  size="lg"
                  fullWidth
                  leftIcon={<ShoppingCart size={18} weight="bold" />}
                  onClick={handleAddToCart}
                >
                  Add to Cart
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  fullWidth
                  leftIcon={<Lightning size={18} weight="fill" />}
                  onClick={handleBuyNow}
                >
                  Buy Now — LN
                </Button>
              </div>

              {/* Trust badges */}
              <div className="flex flex-wrap gap-4">
                {[
                  { icon: <Truck size={16} />, label: "Free shipping" },
                  { icon: <ShieldCheck size={16} />, label: "1-year warranty" },
                  { icon: <Package size={16} />, label: "30-day returns" },
                ].map((badge) => (
                  <div key={badge.label} className="flex items-center gap-1.5 text-micro text-white/20">
                    {badge.icon}
                    {badge.label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ScrollSection>
      </section>

      {/* ─── TAB CONTENT ─── */}
      <section className="relative max-w-[1200px] mx-auto px-6 py-10">
        <ScrollSection>
          {/* Tab bar */}
          <div className="flex items-center border-b border-white/[0.06] mb-8">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.key;
              // Hide setup tab for products without setup guide
              if (tab.key === "setup" && (!product.setupGuide || product.setupGuide.length === 0)) {
                return null;
              }
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    "relative px-5 py-3 text-caption font-medium transition-colors",
                    isActive ? "text-primary" : "text-secondary hover:text-primary"
                  )}
                >
                  {tab.label}
                  {tab.key === "reviews" && (
                    <span className="ml-1.5 text-micro text-white/20">
                      ({product.reviews.length})
                    </span>
                  )}
                  {isActive && (
                    <motion.div
                      layoutId="product-tab"
                      className="absolute bottom-0 left-0 right-0 h-[2px] bg-bitcoin"
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Tab panels */}
          <div className="max-w-3xl">
            {activeTab === "description" && <DescriptionTab product={product} />}
            {activeTab === "specs" && <SpecsTab product={product} />}
            {activeTab === "reviews" && <ReviewsTab product={product} />}
            {activeTab === "setup" && <SetupTab product={product} />}
          </div>
        </ScrollSection>
      </section>

      {/* ─── RELATED PRODUCTS ─── */}
      {related.length > 0 && (
        <section className="relative max-w-[1200px] mx-auto px-6 py-10 pb-20">
          <ScrollSection>
            <h2 className="text-xl font-bold text-primary mb-6">You May Also Like</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {related.slice(0, 3).map((p) => (
                <RelatedCard key={p.slug} product={p} />
              ))}
            </div>
          </ScrollSection>

          {/* Back to shop */}
          <ScrollSection className="mt-10 text-center">
            <Link to="/shop">
              <Button
                variant="ghost"
                size="sm"
                rightIcon={<ArrowRight size={14} />}
              >
                Back to All Products
              </Button>
            </Link>
          </ScrollSection>
        </section>
      )}
    </div>
  );
}
