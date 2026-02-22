import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { BookOpen, Clock, ArrowRight, Lightning } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { Display } from "@/components/shared/Display";
import { PageTransition } from "@/components/shared/PageTransition";
import { cn } from "@/lib/utils";
import {
  staggerContainer,
  staggerItem,
  durations,
  easings,
  springs,
} from "@/lib/animation";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useAuthStore } from "@/stores/authStore";
import { useUserStore } from "@/stores/userStore";
import { useToastStore } from "@/stores/toastStore";
import { tracks, getTrackProgress } from "@/mocks/education";
import type { Track } from "@/mocks/education";

/* ── Track Card ── */
interface TrackCardProps {
  track: Track;
  index: number;
  isAuthenticated: boolean;
  progress: number;
  isCompleted: boolean;
  onStart: (trackId: string) => void;
  reducedMotion: boolean;
}

function TrackCard({
  track,
  index,
  isAuthenticated,
  progress,
  isCompleted,
  onStart,
  reducedMotion,
}: TrackCardProps) {
  const status = isCompleted
    ? "completed"
    : progress > 0
      ? "in-progress"
      : "not-started";

  return (
    <motion.div
      variants={staggerItem}
      whileHover={reducedMotion ? undefined : { y: -2 }}
      className={cn(
        "relative rounded-radius-lg overflow-hidden",
        "bg-elevated border transition-all duration-300",
        isCompleted
          ? "border-gold/30 hover:border-gold/50"
          : "border-white/6 hover:border-white/12"
      )}
      transition={{
        duration: durations.small,
        ease: easings.gentle,
      }}
    >
      <div className="p-6">
        {/* Track number badge */}
        <div className="flex items-start justify-between mb-4">
          <div
            className={cn(
              "flex items-center justify-center w-10 h-10 rounded-full",
              "text-body font-bold",
              isCompleted
                ? "bg-green/15 text-green"
                : "bg-bitcoin/15 text-bitcoin"
            )}
          >
            {isCompleted ? "\u2713" : index + 1}
          </div>

          {isCompleted && (
            <motion.span
              className="text-caption font-medium text-green bg-green/10 px-2.5 py-1 rounded-full"
              initial={reducedMotion ? false : { scale: 0 }}
              animate={{ scale: 1 }}
              transition={springs.bouncy}
            >
              Completed
            </motion.span>
          )}
        </div>

        {/* Track title */}
        <h3 className="text-headline font-semibold text-primary mb-2">
          {track.title}
        </h3>

        {/* Description */}
        <p className="text-body text-secondary leading-relaxed mb-4">
          {track.description}
        </p>

        {/* Meta: lessons + time */}
        <div className="flex items-center gap-4 mb-5 text-caption text-secondary">
          <span className="flex items-center gap-1.5">
            <BookOpen size={14} weight="duotone" />
            {track.lessonCount} lessons
          </span>
          <span className="flex items-center gap-1.5">
            <Clock size={14} weight="duotone" />
            ~{track.estimatedMinutes} min
          </span>
        </div>

        {/* Progress bar (authenticated only) */}
        {isAuthenticated && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-micro text-secondary uppercase tracking-wider">
                Progress
              </span>
              <span className="text-micro text-primary font-medium">
                {progress}%
              </span>
            </div>
            <div className="h-1.5 bg-white/6 rounded-full overflow-hidden">
              <motion.div
                className={cn(
                  "h-full rounded-full",
                  isCompleted
                    ? "bg-green"
                    : "bg-bitcoin"
                )}
                initial={reducedMotion ? false : { width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{
                  duration: durations.large,
                  ease: easings.gentle,
                  delay: 0.2 + index * 0.1,
                }}
              />
            </div>
          </div>
        )}

        {/* CTA button */}
        <Button
          variant={isCompleted ? "ghost" : "primary"}
          size="md"
          fullWidth
          onClick={() => onStart(track.id)}
          disabled={isCompleted}
          rightIcon={
            !isCompleted ? <ArrowRight size={16} weight="bold" /> : undefined
          }
        >
          {status === "completed"
            ? "Completed \u2713"
            : status === "in-progress"
              ? "Continue"
              : "Start"}
        </Button>
      </div>
    </motion.div>
  );
}

/* ── Main Component ── */
export default function EducationLanding() {
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();
  const { isAuthenticated } = useAuthStore();
  const { profile } = useUserStore();
  const { addToast } = useToastStore();

  const handleStart = (trackId: string) => {
    if (!isAuthenticated) {
      addToast({
        type: "info",
        title: "Sign in to track your progress",
        message: "Connect your wallet to save your learning progress.",
      });
      navigate("/connect");
      return;
    }

    // Find the first incomplete lesson in this track
    const track = tracks.find((t) => t.id === trackId);
    if (!track) return;

    const nextLesson = track.lessons.find(
      (l) => !profile.completedLessons.includes(l.id)
    );

    if (nextLesson) {
      navigate(`/learn/${trackId}/${nextLesson.id}`);
    } else {
      // All complete, go to first lesson
      navigate(`/learn/${trackId}/${track.lessons[0].id}`);
    }
  };

  return (
    <PageTransition>
      <div className="min-h-screen">
        {/* ── Hero Section ── */}
        <motion.section
          className="text-center pt-16 sm:pt-24 pb-12 sm:pb-16 px-4"
          initial={reducedMotion ? false : { opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: durations.large,
            ease: easings.gentle,
          }}
        >
          <div className="flex items-center justify-center gap-2 mb-6">
            <Lightning size={24} weight="duotone" className="text-bitcoin" />
            <span className="text-caption font-medium text-bitcoin uppercase tracking-widest">
              Bitcoin Education
            </span>
          </div>

          <Display
            as="h1"
            className="text-display-lg sm:text-hero font-bold text-primary mb-4"
          >
            Learn Bitcoin
          </Display>

          <p className="text-body-lg text-secondary max-w-lg mx-auto leading-relaxed">
            From mining basics to running your own node — everything you need to
            understand Bitcoin, one lesson at a time.
          </p>
        </motion.section>

        {/* ── Track Grid ── */}
        <section className="max-w-4xl mx-auto px-4 pb-16">
          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 gap-6"
            variants={staggerContainer}
            initial="initial"
            animate="animate"
          >
            {tracks.map((track, i) => {
              const progress = isAuthenticated
                ? getTrackProgress(track.id, profile.completedLessons)
                : 0;
              const isCompleted =
                isAuthenticated &&
                profile.completedTracks.includes(track.id);

              return (
                <TrackCard
                  key={track.id}
                  track={track}
                  index={i}
                  isAuthenticated={isAuthenticated}
                  progress={progress}
                  isCompleted={isCompleted}
                  onStart={handleStart}
                  reducedMotion={reducedMotion}
                />
              );
            })}
          </motion.div>
        </section>

        {/* ── Bottom CTA ── */}
        <motion.section
          className="text-center pb-20 px-4"
          initial={reducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{
            duration: durations.medium,
            ease: easings.gentle,
            delay: 0.6,
          }}
        >
          <div className="bg-surface border border-white/6 rounded-radius-lg p-8 sm:p-12 max-w-2xl mx-auto">
            <Display
              as="h2"
              className="text-title sm:text-headline font-semibold text-primary mb-3"
            >
              Start mining and learning today
            </Display>
            <p className="text-body text-secondary mb-6">
              Connect your Bitaxe and begin your Bitcoin journey.
            </p>
            <Link to="/connect">
              <Button
                variant="primary"
                size="lg"
                rightIcon={<ArrowRight size={18} weight="bold" />}
              >
                Get Started
              </Button>
            </Link>
          </div>
        </motion.section>
      </div>
    </PageTransition>
  );
}
