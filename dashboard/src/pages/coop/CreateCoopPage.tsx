import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  UsersThree,
  Check,
  Confetti,
} from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { staggerContainer, staggerItem } from "@/lib/animation";

export default function CreateCoopPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [motto, setMotto] = useState("");
  const [payoutAddress, setPayoutAddress] = useState("");
  const [created, setCreated] = useState(false);
  const [nameAvailable, setNameAvailable] = useState<boolean | null>(null);

  const handleNameChange = (value: string) => {
    setName(value);
    if (value.length >= 3) {
      // Mock availability check
      setNameAvailable(!["Mining Vikings", "Hash Samurai", "Block Busters"].includes(value));
    } else {
      setNameAvailable(null);
    }
  };

  const canCreate = name.length >= 3 && nameAvailable && payoutAddress.length > 10;

  if (created) {
    return (
      <motion.div
        className="text-center py-20 space-y-6"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.2 }}
          className="inline-flex p-4 rounded-full bg-green/10"
        >
          <Confetti size={48} weight="duotone" className="text-green" />
        </motion.div>
        <h2 className="text-display-md font-bold">{name} Created!</h2>
        <p className="text-body text-secondary max-w-md mx-auto">
          Your cooperative is ready. Share the invite link to get your first members.
        </p>
        <div className="flex gap-3 justify-center">
          <Button variant="primary" onClick={() => navigate("/coop")}>
            Go to Dashboard
          </Button>
        </div>
      </motion.div>
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

      {/* Header */}
      <motion.div variants={staggerItem} className="flex items-center gap-3">
        <div className="p-2 rounded-radius-md bg-elevated">
          <UsersThree size={24} weight="duotone" className="text-bitcoin" />
        </div>
        <div>
          <h1 className="text-title font-bold">Create a Cooperative</h1>
          <p className="text-caption text-secondary">Build your mining team</p>
        </div>
      </motion.div>

      {/* Form */}
      <motion.div variants={staggerItem}>
        <Card padding="md" className="space-y-5">
          {/* Name */}
          <div>
            <label className="text-caption font-semibold text-secondary block mb-2">
              Cooperative Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Mining Vikings"
              className="w-full bg-elevated border border-white/6 rounded-radius-md px-3 py-2.5 text-body text-primary placeholder:text-secondary/50 focus:outline-none focus:border-bitcoin/50 transition-colors"
            />
            {nameAvailable === true && name.length >= 3 && (
              <span className="text-micro text-green flex items-center gap-1 mt-1">
                <Check size={12} /> Available
              </span>
            )}
            {nameAvailable === false && (
              <span className="text-micro text-red mt-1 block">Name already taken</span>
            )}
          </div>

          {/* Motto */}
          <div>
            <label className="text-caption font-semibold text-secondary block mb-2">
              Motto / Description
            </label>
            <textarea
              value={motto}
              onChange={(e) => setMotto(e.target.value)}
              placeholder="e.g. Raiding the blockchain since 2026"
              rows={2}
              className="w-full bg-elevated border border-white/6 rounded-radius-md px-3 py-2.5 text-body text-primary placeholder:text-secondary/50 focus:outline-none focus:border-bitcoin/50 transition-colors resize-none"
            />
          </div>

          {/* Payout Address */}
          <div>
            <label className="text-caption font-semibold text-secondary block mb-2">
              Payout Address (BTC)
            </label>
            <input
              type="text"
              value={payoutAddress}
              onChange={(e) => setPayoutAddress(e.target.value)}
              placeholder="bc1q..."
              className="w-full bg-elevated border border-white/6 rounded-radius-md px-3 py-2.5 font-mono text-caption text-primary placeholder:text-secondary/50 focus:outline-none focus:border-bitcoin/50 transition-colors"
            />
            <p className="text-micro text-secondary mt-1">
              Multisig address recommended for cooperatives
            </p>
          </div>
        </Card>
      </motion.div>

      {/* Create button */}
      <motion.div variants={staggerItem}>
        <Button
          variant="primary"
          className="w-full"
          onClick={() => setCreated(true)}
          disabled={!canCreate}
        >
          Create Cooperative
        </Button>
      </motion.div>
    </motion.div>
  );
}
