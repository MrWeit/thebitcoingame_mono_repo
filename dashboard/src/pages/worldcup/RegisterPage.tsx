import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Check, Globe } from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { staggerContainer, staggerItem } from "@/lib/animation";
import { getCountryFlag, getCountryName, mockCountryRankings } from "@/mocks/competition";
import { cn } from "@/lib/utils";

const REGISTERABLE_COUNTRIES = mockCountryRankings.map((c) => ({
  code: c.countryCode,
  name: c.countryName,
  registeredMiners: Math.max(1, Math.floor(c.minerCount / 100)),
  qualified: c.minerCount >= 500,
}));

export default function RegisterPage() {
  const navigate = useNavigate();
  const [selectedCountry, setSelectedCountry] = useState("PT");
  const [registered, setRegistered] = useState(false);

  const country = REGISTERABLE_COUNTRIES.find((c) => c.code === selectedCountry);
  const minRequired = 5;
  const progress = country ? Math.min((country.registeredMiners / minRequired) * 100, 100) : 0;

  if (registered) {
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
          <Check size={48} weight="bold" className="text-green" />
        </motion.div>
        <h2 className="text-display-md font-bold">You're Registered!</h2>
        <p className="text-body text-secondary max-w-md mx-auto">
          You're now representing {getCountryFlag(selectedCountry)}{" "}
          {getCountryName(selectedCountry)} in the World Cup.
          {country && country.registeredMiners < minRequired && (
            <span className="block mt-2 text-bitcoin">
              {minRequired - country.registeredMiners} more miners needed to qualify!
            </span>
          )}
        </p>
        <div className="flex gap-3 justify-center">
          <Button variant="ghost" onClick={() => navigate("/world-cup")}>
            Back to World Cup
          </Button>
          <Button variant="primary" onClick={() => navigate("/world-cup/my-team")}>
            View My Team
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
      <motion.div variants={staggerItem}>
        <button
          onClick={() => navigate("/world-cup")}
          className="flex items-center gap-2 text-caption text-secondary hover:text-primary transition-colors"
        >
          <ArrowLeft size={16} />
          Back to World Cup
        </button>
      </motion.div>

      <motion.div variants={staggerItem}>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-radius-md bg-gold/10">
            <Globe size={24} weight="duotone" className="text-gold" />
          </div>
          <div>
            <h1 className="text-title font-bold">Register for World Cup</h1>
            <p className="text-caption text-secondary">
              Represent your country in the mining competition
            </p>
          </div>
        </div>
      </motion.div>

      {/* Country selector */}
      <motion.div variants={staggerItem}>
        <Card padding="md">
          <label className="text-caption font-semibold text-secondary uppercase tracking-wider block mb-3">
            Select Your Country
          </label>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[300px] overflow-y-auto pr-2">
            {REGISTERABLE_COUNTRIES.map((c) => (
              <button
                key={c.code}
                onClick={() => setSelectedCountry(c.code)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2.5 rounded-radius-md text-left transition-all border",
                  selectedCountry === c.code
                    ? "border-bitcoin bg-bitcoin/10 text-primary"
                    : "border-white/4 hover:border-white/8 text-secondary hover:text-primary"
                )}
              >
                <span className="text-lg">{getCountryFlag(c.code)}</span>
                <span className="text-caption font-medium truncate">{c.name}</span>
              </button>
            ))}
          </div>
        </Card>
      </motion.div>

      {/* Registration progress */}
      {country && (
        <motion.div variants={staggerItem}>
          <Card padding="md">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl">{getCountryFlag(selectedCountry)}</span>
              <div>
                <span className="font-semibold text-primary">{country.name}</span>
                <p className="text-caption text-secondary">
                  {country.registeredMiners}/{minRequired} miners registered
                  {country.qualified && " — Qualified!"}
                </p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="h-2 bg-elevated rounded-full overflow-hidden">
              <motion.div
                className={cn(
                  "h-full rounded-full",
                  progress >= 100 ? "bg-green" : "bg-bitcoin"
                )}
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
            </div>

            {progress < 100 && (
              <p className="text-micro text-secondary mt-2">
                {minRequired - country.registeredMiners} more miners needed to qualify
              </p>
            )}
          </Card>
        </motion.div>
      )}

      {/* Register button */}
      <motion.div variants={staggerItem}>
        <Button
          variant="primary"
          className="w-full"
          onClick={() => setRegistered(true)}
        >
          Register for {getCountryName(selectedCountry)}
        </Button>
      </motion.div>
    </motion.div>
  );
}
