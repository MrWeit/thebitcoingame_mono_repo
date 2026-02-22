import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  UsersThree,
  Fire,
  Confetti,
  Cpu,
} from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { staggerContainer, staggerItem } from "@/lib/animation";
import { mockCooperative } from "@/mocks/competition";
import { formatHashrate } from "@/mocks/data";

export default function JoinCoopPage() {
  const navigate = useNavigate();
  const { inviteCode } = useParams();
  const [joined, setJoined] = useState(false);

  // Mock: find coop by invite code
  const coop = mockCooperative;
  const isValid = inviteCode === coop.inviteCode || inviteCode != null;

  if (joined) {
    return (
      <motion.div
        className="text-center py-20 space-y-6"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.2 }}
          className="inline-flex p-4 rounded-full bg-bitcoin/10"
        >
          <Confetti size={48} weight="duotone" className="text-bitcoin" />
        </motion.div>
        <h2 className="text-display-md font-bold">Welcome to {coop.name}!</h2>
        <p className="text-body text-secondary max-w-md mx-auto">
          You're now part of the team. Your hashrate will contribute to the cooperative's combined stats.
        </p>
        <Button variant="primary" onClick={() => navigate("/coop")}>
          Go to Cooperative
        </Button>
      </motion.div>
    );
  }

  if (!isValid) {
    return (
      <div className="text-center py-20 space-y-4">
        <p className="text-body text-secondary">Invalid invite code</p>
        <Button variant="ghost" onClick={() => navigate("/coop")}>
          Back to Cooperatives
        </Button>
      </div>
    );
  }

  return (
    <motion.div
      className="space-y-6 pb-8 max-w-xl mx-auto"
      variants={staggerContainer}
      initial="initial"
      animate="animate"
    >
      {/* Back */}
      <motion.div variants={staggerItem}>
        <button
          onClick={() => navigate("/coop")}
          className="flex items-center gap-2 text-caption text-secondary hover:text-primary transition-colors"
        >
          <ArrowLeft size={16} />
          Back
        </button>
      </motion.div>

      {/* Coop preview */}
      <motion.div variants={staggerItem}>
        <Card padding="lg" className="text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-elevated border border-white/6 flex items-center justify-center mx-auto">
            <UsersThree size={32} weight="duotone" className="text-bitcoin" />
          </div>

          <div>
            <h1 className="text-title font-bold">{coop.name}</h1>
            <p className="text-caption text-secondary italic mt-1">"{coop.motto}"</p>
          </div>

          <div className="flex items-center justify-center gap-4 text-caption text-secondary">
            <span className="flex items-center gap-1">
              <UsersThree size={16} />
              {coop.memberCount} members
            </span>
            <span className="flex items-center gap-1">
              <Cpu size={16} />
              {formatHashrate(coop.combinedHashrate)}
            </span>
            <span className="flex items-center gap-1 text-bitcoin">
              <Fire size={16} weight="fill" />
              {coop.weeklyStreak}w streak
            </span>
          </div>

          {/* Top members preview */}
          <div className="flex justify-center -space-x-2 mt-4">
            {coop.members.slice(0, 5).map((m) => (
              <div
                key={m.userId}
                className="w-8 h-8 rounded-full bg-elevated border-2 border-surface flex items-center justify-center"
              >
                <span className="text-micro font-bold text-primary">
                  {m.displayName.charAt(0)}
                </span>
              </div>
            ))}
            {coop.memberCount > 5 && (
              <div className="w-8 h-8 rounded-full bg-elevated border-2 border-surface flex items-center justify-center">
                <span className="text-micro text-secondary">+{coop.memberCount - 5}</span>
              </div>
            )}
          </div>
        </Card>
      </motion.div>

      {/* Join button */}
      <motion.div variants={staggerItem}>
        <Button
          variant="primary"
          className="w-full"
          onClick={() => setJoined(true)}
        >
          Join {coop.name}
        </Button>
      </motion.div>
    </motion.div>
  );
}
