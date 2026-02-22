import { motion } from "framer-motion";
import { Cube, ArrowRight, Trophy } from "@phosphor-icons/react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Tag } from "@/components/ui/Tag";
import { Mono } from "@/components/shared/Mono";
import { cn } from "@/lib/utils";
import {
  staggerContainer,
  staggerItem,
  durations,
  easings,
} from "@/lib/animation";
import {
  mockBlocks,
  formatBTC,
  formatNumber,
  formatTimeAgo,
} from "@/mocks/data";

/* ── Helpers ── */
function truncateHash(hash: string): string {
  return `${hash.slice(0, 12)}...${hash.slice(-8)}`;
}

/* ── Empty State (User's Blocks) ── */
function UserBlocksEmptyState() {
  const navigate = useNavigate();

  return (
    <Card variant="standard" padding="lg">
      <motion.div
        className="flex flex-col items-center text-center py-8 md:py-12"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: durations.medium, ease: easings.gentle }}
      >
        {/* Pulsing cube icon */}
        <motion.div
          className="relative mb-6"
          animate={{ y: [0, -6, 0] }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          <div className="absolute inset-0 rounded-full bg-gold/10 blur-xl scale-150" />
          <div className="relative w-20 h-20 rounded-full bg-elevated border border-white/8 flex items-center justify-center">
            <Cube size={40} weight="duotone" className="text-gold" />
          </div>
        </motion.div>

        <h3 className="text-title text-primary font-semibold mb-2">
          No blocks yet — but every share gets you closer
        </h3>
        <p className="text-body text-secondary max-w-md mb-1">
          Solo mining is a game of patience. Each hash you submit is another
          lottery ticket.
        </p>
        <p className="text-caption text-subtle mb-8">
          Based on your hashrate, estimated time to block:{" "}
          <Mono className="text-secondary">~2,847 days</Mono>
        </p>

        <Button
          variant="primary"
          size="lg"
          rightIcon={<ArrowRight size={18} />}
          onClick={() => navigate("/mining/difficulty")}
        >
          Keep mining!
        </Button>
      </motion.div>
    </Card>
  );
}

/* ── Global Block Card ── */
function BlockCard({
  block,
  index,
}: {
  block: (typeof mockBlocks)[number];
  index: number;
}) {
  return (
    <motion.div
      variants={{
        initial: { opacity: 0, x: 40 },
        animate: {
          opacity: 1,
          x: 0,
          transition: {
            duration: durations.medium,
            ease: easings.gentle,
            delay: index * 0.08,
          },
        },
      }}
      initial="initial"
      animate="animate"
    >
      <Card
        variant="standard"
        padding="md"
        className="border-l-2 border-l-gold"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Left: Block info */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Trophy size={16} weight="fill" className="text-gold" />
                <Mono className="text-headline font-semibold text-primary">
                  #{formatNumber(block.height)}
                </Mono>
              </div>
              <Tag variant="country" countryCode={block.finderCountry}>
                {block.finder}
              </Tag>
            </div>

            <div className="flex items-center gap-4 text-caption text-secondary">
              <span>
                Hash:{" "}
                <Mono className="text-subtle">{truncateHash(block.hash)}</Mono>
              </span>
            </div>
          </div>

          {/* Right: Reward + time */}
          <div className="flex flex-col items-start sm:items-end gap-1">
            <Mono className="text-body-lg font-semibold text-bitcoin">
              {formatBTC(block.reward)}
            </Mono>
            <div className="flex items-center gap-3 text-caption text-secondary">
              <span>{formatTimeAgo(block.timestamp)}</span>
              <span className="text-subtle">|</span>
              <Mono>{formatNumber(block.confirmations)} conf.</Mono>
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

/* ── Main Page ── */
export default function BlocksPage() {
  const userBlocks = mockBlocks.filter((b) => b.isOurs);
  const globalBlocks = mockBlocks;

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: durations.medium, ease: easings.gentle }}
      >
        <h1 className="text-display-md font-bold text-primary">
          Blocks Found
        </h1>
        <p className="text-body-lg text-secondary mt-1">
          Track blocks mined by you and the community
        </p>
      </motion.div>

      {/* User's Blocks Section */}
      <section>
        <h2 className="text-headline font-semibold text-primary mb-4">
          Your Blocks
        </h2>
        {userBlocks.length === 0 ? (
          <UserBlocksEmptyState />
        ) : (
          <div className="space-y-3">
            {userBlocks.map((block, i) => (
              <BlockCard key={block.id} block={block} index={i} />
            ))}
          </div>
        )}
      </section>

      {/* Global Blocks Section */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-headline font-semibold text-primary">
            Blocks Found by Our Miners
          </h2>
          <span
            className={cn(
              "inline-flex items-center justify-center",
              "h-6 min-w-6 px-2 rounded-full",
              "bg-gold/10 text-gold text-caption font-semibold"
            )}
          >
            <Mono>{globalBlocks.length}</Mono>
          </span>
        </div>

        <motion.div
          className="space-y-3"
          variants={staggerContainer}
          initial="initial"
          animate="animate"
        >
          {globalBlocks.map((block, i) => (
            <motion.div key={block.id} variants={staggerItem}>
              <BlockCard block={block} index={i} />
            </motion.div>
          ))}
        </motion.div>
      </section>
    </div>
  );
}
