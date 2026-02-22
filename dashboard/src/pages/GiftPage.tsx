import { motion } from "framer-motion";
import {
  ShoppingCart,
  Gear,
  Gift,
  GameController,
  GraduationCap,
  Medal,
  ArrowRight,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { Display } from "@/components/shared/Display";
import { PageTransition } from "@/components/shared/PageTransition";
import { cn } from "@/lib/utils";
import { staggerContainer, staggerItem, durations, easings } from "@/lib/animation";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useToastStore } from "@/stores/toastStore";

const steps = [
  { icon: ShoppingCart, title: "Buy", description: "Get a pre-configured Bitaxe" },
  { icon: Gear, title: "Configure", description: "Set up the mining config" },
  { icon: Gift, title: "Gift", description: "Give it to someone special" },
  { icon: GameController, title: "They Play", description: "They plug in and start playing" },
  { icon: GraduationCap, title: "They Learn", description: "They discover Bitcoin naturally" },
];

const kits = [
  { name: "Bitaxe Solo", price: "$59", description: "Basic miner — everything they need to start" },
  { name: "Bitaxe + Wallet Bundle", price: "$129", description: "Miner + hardware wallet for self-custody" },
  { name: "Full Stack Kit", price: "$199", description: "Miner + wallet + metal seed backup" },
];

export default function GiftPage() {
  const reducedMotion = useReducedMotion();
  const { addToast } = useToastStore();

  const handleCTA = () => {
    addToast({ type: "info", title: "Coming soon!", message: "The shop is being built." });
  };

  return (
    <PageTransition>
      <div className="min-h-screen">
        {/* Hero */}
        <motion.section
          className="text-center pt-16 sm:pt-24 pb-12 sm:pb-16 px-4"
          initial={reducedMotion ? false : { opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: durations.large, ease: easings.gentle }}
        >
          <Display as="h1" className="text-display-lg sm:text-hero font-bold text-primary mb-4 max-w-3xl mx-auto">
            Give Someone Their First Bitcoin Experience
          </Display>
          <p className="text-body-lg text-secondary max-w-xl mx-auto leading-relaxed">
            A Bitaxe is more than a miner — it's a gateway to understanding Bitcoin through play and discovery.
          </p>
        </motion.section>

        {/* Step Flow */}
        <section className="max-w-4xl mx-auto px-4 pb-16">
          <motion.div
            className="flex flex-col md:flex-row items-stretch gap-4 md:gap-2"
            variants={staggerContainer}
            initial="initial"
            animate="animate"
          >
            {steps.map((step, i) => {
              const Icon = step.icon;
              return (
                <motion.div key={i} variants={staggerItem} className="flex-1 flex flex-col items-center text-center">
                  <div className="relative">
                    <div className="w-14 h-14 rounded-full bg-bitcoin/15 flex items-center justify-center mb-3">
                      <Icon size={24} weight="duotone" className="text-bitcoin" />
                    </div>
                    <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-bitcoin text-canvas text-micro font-bold flex items-center justify-center">
                      {i + 1}
                    </div>
                  </div>
                  <h3 className="text-body font-semibold text-primary mb-1">{step.title}</h3>
                  <p className="text-caption text-secondary">{step.description}</p>
                  {i < steps.length - 1 && (
                    <div className="hidden md:block mt-4">
                      <ArrowRight size={16} className="text-subtle" />
                    </div>
                  )}
                </motion.div>
              );
            })}
          </motion.div>
        </section>

        {/* Badge Callout */}
        <motion.section
          className="max-w-2xl mx-auto px-4 pb-16"
          initial={reducedMotion ? false : { opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: durations.medium, delay: 0.4 }}
        >
          <div className="bg-elevated border border-gold/30 rounded-radius-lg p-6 sm:p-8 text-center">
            <Medal size={40} weight="duotone" className="text-gold mx-auto mb-3" />
            <h3 className="text-headline font-semibold text-primary mb-2">
              You'll earn the "Orange Piller" badge!
            </h3>
            <p className="text-body text-secondary">
              One of the rarest achievements on the platform. Only 8.9% of miners have it.
            </p>
          </div>
        </motion.section>

        {/* CTAs */}
        <section className="max-w-xl mx-auto px-4 pb-16 flex flex-col sm:flex-row gap-4 justify-center">
          <Button variant="primary" size="lg" onClick={handleCTA} leftIcon={<ShoppingCart size={18} />}>
            Buy a Pre-Configured Bitaxe
          </Button>
          <Button variant="secondary" size="lg" onClick={handleCTA} leftIcon={<Gear size={18} />}>
            Configuration Guide
          </Button>
        </section>

        {/* Starter Kits */}
        <section className="max-w-4xl mx-auto px-4 pb-20">
          <motion.h2
            className="text-title font-semibold text-primary text-center mb-8"
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            Starter Kits
          </motion.h2>

          <motion.div
            className="grid grid-cols-1 sm:grid-cols-3 gap-6"
            variants={staggerContainer}
            initial="initial"
            animate="animate"
          >
            {kits.map((kit, i) => (
              <motion.div
                key={i}
                variants={staggerItem}
                whileHover={reducedMotion ? undefined : { y: -2 }}
                className={cn(
                  "bg-elevated border border-white/6 rounded-radius-lg p-6 text-center",
                  "hover:border-white/12 transition-all duration-300"
                )}
              >
                <h3 className="text-headline font-semibold text-primary mb-2">{kit.name}</h3>
                <div className="text-display-md font-bold text-gold font-mono mb-3">{kit.price}</div>
                <p className="text-caption text-secondary mb-4">{kit.description}</p>
                <Button variant="secondary" size="sm" fullWidth onClick={handleCTA}>
                  View
                </Button>
              </motion.div>
            ))}
          </motion.div>
        </section>
      </div>
    </PageTransition>
  );
}
