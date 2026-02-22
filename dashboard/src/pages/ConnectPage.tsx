import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Copy, Lightning } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import { Display } from "@/components/shared/Display";
import { Mono } from "@/components/shared/Mono";
import { NoCoinersWizard } from "@/components/onboarding/NoCoinersWizard";
import { useAuthStore } from "@/stores/authStore";
import { useToastStore } from "@/stores/toastStore";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cn } from "@/lib/utils";
import { springs } from "@/lib/animation";

/* ── Types ── */
interface Particle {
  id: number;
  angle: number;
  distance: number;
  size: number;
  delay: number;
}

/* ── Helpers ── */
function generateNonce(): string {
  const chars = "0123456789abcdef";
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

function isValidBitcoinAddress(address: string): boolean {
  if (address.length < 26) return false;
  if (
    address.startsWith("bc1q") ||
    address.startsWith("1") ||
    address.startsWith("3")
  ) {
    return true;
  }
  return false;
}

/* ── Step spring animation ── */
const stepVariants = {
  hidden: { opacity: 0, y: 40, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1 },
};

/* ── ConnectPage ── */
export default function ConnectPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const login = useAuthStore((s) => s.login);
  const addToast = useToastStore((s) => s.addToast);
  const reduced = useReducedMotion();

  // Gift mode redirect
  const isGift = searchParams.get("gift") === "true";

  // Steps state
  const [currentStep, setCurrentStep] = useState(1);
  const [address, setAddress] = useState("");
  const [addressError, setAddressError] = useState("");
  const [challenge, setChallenge] = useState("");
  const [signature, setSignature] = useState("");
  const [signatureError, setSignatureError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Success animation state
  const [showSuccess, setShowSuccess] = useState(false);
  const [showParticles, setShowParticles] = useState(false);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [cardCompressed, setCardCompressed] = useState(false);
  const [cardHidden, setCardHidden] = useState(false);

  // Clipboard feedback
  const [copiedChallenge, setCopiedChallenge] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // NoCoiners wizard state for gift mode
  const [showNoCoiners, setShowNoCoiners] = useState(isGift);

  // Cleanup timeout
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  /* ── Step 1: Generate Challenge ── */
  const handleGenerateChallenge = useCallback(() => {
    setAddressError("");

    if (!isValidBitcoinAddress(address.trim())) {
      setAddressError(
        "Enter a valid Bitcoin address starting with bc1q, 1, or 3 (min 26 chars)"
      );
      return;
    }

    setIsGenerating(true);
    const nonce = generateNonce();
    const timestamp = Math.floor(Date.now() / 1000);
    const challengeText = `Sign in to TheBitcoinGame\nNonce: ${nonce}\nTimestamp: ${timestamp}`;

    // Mock slight delay for generating challenge
    setTimeout(() => {
      setChallenge(challengeText);
      setCurrentStep(2);
      setIsGenerating(false);
    }, 400);
  }, [address]);

  /* ── Copy challenge ── */
  const handleCopyChallenge = useCallback(() => {
    navigator.clipboard.writeText(challenge).then(() => {
      setCopiedChallenge(true);
      addToast({ type: "success", title: "Challenge copied to clipboard" });
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopiedChallenge(false), 2000);
    });
  }, [challenge, addToast]);

  /* ── Step 2 -> 3 transition ── */
  const handleProceedToSignature = useCallback(() => {
    setCurrentStep(3);
  }, []);

  /* ── Step 3: Verify signature ── */
  const handleVerify = useCallback(() => {
    setSignatureError("");

    if (signature.trim().length < 10) {
      setSignatureError("Please paste a valid signature");
      return;
    }

    setIsVerifying(true);

    // Mock verification with 1.5s delay
    setTimeout(() => {
      setIsVerifying(false);

      // Generate particles for success
      const newParticles: Particle[] = Array.from({ length: 24 }, (_, i) => ({
        id: i,
        angle: (i / 24) * Math.PI * 2 + (Math.random() - 0.5) * 0.5,
        distance: 120 + Math.random() * 180,
        size: 4 + Math.random() * 8,
        delay: Math.random() * 0.2,
      }));
      setParticles(newParticles);

      // Success sequence
      setShowSuccess(true);

      // Step 1: green border flash (immediate)
      // Step 2: compress card (0.3s later)
      setTimeout(() => setCardCompressed(true), 300);

      // Step 3: explode particles (0.6s later)
      setTimeout(() => setShowParticles(true), 600);

      // Step 4: hide card, swirl particles (1s later)
      setTimeout(() => setCardHidden(true), 1000);

      // Step 5: Login + redirect (1.5s later)
      setTimeout(() => {
        login(address.trim());
        addToast({
          type: "success",
          title: "Welcome back, SatoshiHunter",
          message: "Your wallet has been connected successfully",
        });
        navigate("/dashboard");
      }, 1500);
    }, 1500);
  }, [signature, address, login, addToast, navigate]);

  /* ── Reduced motion shortcut ── */
  const springTransition = reduced
    ? { duration: 0.01 }
    : { ...springs.bouncy };

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-[480px]">
        {/* Header */}
        <motion.div
          initial={reduced ? false : { opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="text-center mb-8"
        >
          <div className="w-14 h-14 bg-bitcoin/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Lightning weight="fill" className="w-7 h-7 text-bitcoin" />
          </div>
          <Display as="h1" className="text-display-md text-primary mb-2">
            Connect Wallet
          </Display>
          <p className="text-body text-secondary">
            Sign in with your Bitcoin address to start mining
          </p>
        </motion.div>

        {/* Main Card */}
        <AnimatePresence mode="wait">
          {!cardHidden && (
            <motion.div
              animate={{
                scale: cardCompressed ? 0.95 : 1,
                borderColor: showSuccess
                  ? "rgba(63, 185, 80, 0.6)"
                  : "rgba(255, 255, 255, 0.06)",
              }}
              transition={{
                scale: { duration: 0.3 },
                borderColor: { duration: 0.3 },
              }}
              className={cn(
                "relative bg-surface rounded-radius-lg border border-white/6 shadow-medium p-6 sm:p-8 overflow-visible",
                showSuccess && "shadow-[0_0_30px_rgba(63,185,80,0.15)]"
              )}
            >
              {/* ── Step 1: Bitcoin Address ── */}
              <motion.div
                initial={reduced ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <div className="flex items-center gap-3 mb-4">
                  {currentStep > 1 ? (
                    <div className="w-7 h-7 rounded-full bg-green/20 flex items-center justify-center flex-shrink-0">
                      <Check weight="bold" className="w-4 h-4 text-green" />
                    </div>
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-cyan/10 border border-cyan/30 flex items-center justify-center flex-shrink-0">
                      <Mono className="text-micro text-cyan font-bold">1</Mono>
                    </div>
                  )}
                  <span className="text-body font-medium text-primary">
                    Enter Bitcoin Address
                  </span>
                </div>

                <TextInput
                  label="Your Bitcoin Address"
                  placeholder="bc1q... or 1... or 3..."
                  value={address}
                  onChange={(v) => {
                    setAddress(v);
                    if (addressError) setAddressError("");
                  }}
                  error={addressError}
                  success={currentStep > 1}
                  disabled={currentStep > 1}
                />

                {currentStep === 1 && (
                  <div className="mt-4">
                    <Button
                      variant="primary"
                      fullWidth
                      onClick={handleGenerateChallenge}
                      loading={isGenerating}
                    >
                      Generate Challenge
                    </Button>
                  </div>
                )}
              </motion.div>

              {/* ── Step 2: Sign Challenge ── */}
              <AnimatePresence>
                {currentStep >= 2 && (
                  <motion.div
                    initial={reduced ? false : stepVariants.hidden}
                    animate={stepVariants.visible}
                    exit={stepVariants.hidden}
                    transition={springTransition}
                    className="mt-6 pt-6 border-t border-white/6"
                  >
                    <div className="flex items-center gap-3 mb-4">
                      {currentStep > 2 ? (
                        <div className="w-7 h-7 rounded-full bg-green/20 flex items-center justify-center flex-shrink-0">
                          <Check weight="bold" className="w-4 h-4 text-green" />
                        </div>
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-cyan/10 border border-cyan/30 flex items-center justify-center flex-shrink-0">
                          <Mono className="text-micro text-cyan font-bold">2</Mono>
                        </div>
                      )}
                      <span className="text-body font-medium text-primary">
                        Sign the Challenge
                      </span>
                    </div>

                    <p className="text-caption text-secondary mb-3">
                      Copy this challenge and sign it with your Bitcoin wallet
                    </p>

                    {/* Challenge code block */}
                    <div className="relative bg-elevated rounded-radius-md border border-white/6 p-4">
                      <Mono
                        as="p"
                        className="text-caption text-cyan whitespace-pre-wrap break-all pr-10"
                      >
                        {challenge}
                      </Mono>
                      <button
                        type="button"
                        onClick={handleCopyChallenge}
                        className={cn(
                          "absolute top-3 right-3 w-8 h-8 rounded-radius-sm",
                          "flex items-center justify-center",
                          "text-secondary hover:text-primary hover:bg-spotlight",
                          "transition-colors duration-150"
                        )}
                        aria-label="Copy challenge"
                      >
                        {copiedChallenge ? (
                          <Check weight="bold" className="w-4 h-4 text-green" />
                        ) : (
                          <Copy weight="bold" className="w-4 h-4" />
                        )}
                      </button>
                    </div>

                    {currentStep === 2 && (
                      <div className="mt-4">
                        <Button
                          variant="primary"
                          fullWidth
                          onClick={handleProceedToSignature}
                        >
                          I've Signed It
                        </Button>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── Step 3: Paste Signature ── */}
              <AnimatePresence>
                {currentStep >= 3 && (
                  <motion.div
                    initial={reduced ? false : stepVariants.hidden}
                    animate={stepVariants.visible}
                    exit={stepVariants.hidden}
                    transition={springTransition}
                    className="mt-6 pt-6 border-t border-white/6"
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-7 h-7 rounded-full bg-cyan/10 border border-cyan/30 flex items-center justify-center flex-shrink-0">
                        <Mono className="text-micro text-cyan font-bold">3</Mono>
                      </div>
                      <span className="text-body font-medium text-primary">
                        Paste Signature
                      </span>
                    </div>

                    <TextInput
                      label="Your Signature"
                      placeholder="Paste your signed message here..."
                      value={signature}
                      onChange={(v) => {
                        setSignature(v);
                        if (signatureError) setSignatureError("");
                      }}
                      error={signatureError}
                      disabled={isVerifying || showSuccess}
                    />

                    <div className="mt-4">
                      <Button
                        variant="primary"
                        fullWidth
                        onClick={handleVerify}
                        loading={isVerifying}
                        disabled={showSuccess}
                      >
                        Verify &amp; Enter
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Success Particles ── */}
        <AnimatePresence>
          {showParticles && (
            <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center">
              {particles.map((p) => (
                <motion.div
                  key={p.id}
                  initial={{
                    x: 0,
                    y: 0,
                    scale: 1,
                    opacity: 1,
                  }}
                  animate={
                    reduced
                      ? { opacity: 0 }
                      : {
                          x: Math.cos(p.angle) * p.distance,
                          y: Math.sin(p.angle) * p.distance,
                          scale: 0,
                          opacity: 0,
                        }
                  }
                  transition={{
                    duration: reduced ? 0.01 : 0.8,
                    delay: p.delay,
                    ease: [0.25, 0.1, 0.25, 1],
                  }}
                  style={{ width: p.size, height: p.size }}
                  className="absolute rounded-full bg-bitcoin"
                />
              ))}
            </div>
          )}
        </AnimatePresence>

        {/* ── Bottom link ── */}
        {!showSuccess && (
          <motion.p
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.3 }}
            className="text-center mt-6 text-caption text-secondary"
          >
            Don't have a wallet?{" "}
            <Link
              to="/education"
              className="text-cyan hover:text-cyan/80 transition-colors underline underline-offset-2"
            >
              Start here
            </Link>
          </motion.p>
        )}
      </div>

      {/* NoCoiners wizard for gift mode */}
      <NoCoinersWizard
        open={showNoCoiners}
        onClose={() => setShowNoCoiners(false)}
      />
    </div>
  );
}
