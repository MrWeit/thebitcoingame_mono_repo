import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { BookOpen, Clock, ArrowRight, CheckCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { Display } from "@/components/shared/Display";
import { PageTransition } from "@/components/shared/PageTransition";
import { cn } from "@/lib/utils";
import { staggerContainer, staggerItem, durations, easings, springs } from "@/lib/animation";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useUserStore } from "@/stores/userStore";
import { tracks, getTrackProgress } from "@/mocks/education";

export default function LearnHub() {
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();
  const { profile } = useUserStore();

  const handleContinue = (trackId: string) => {
    const track = tracks.find((t) => t.id === trackId);
    if (!track) return;
    const nextLesson = track.lessons.find((l) => !profile.completedLessons.includes(l.id));
    if (nextLesson) {
      navigate(`/learn/${trackId}/${nextLesson.id}`);
    } else {
      navigate(`/learn/${trackId}/${track.lessons[0].id}`);
    }
  };

  const lastCompleted = profile.completedLessons[profile.completedLessons.length - 1];
  const lastTrack = lastCompleted ? tracks.find((t) => t.lessons.some((l) => l.id === lastCompleted)) : null;
  const lastLesson = lastTrack?.lessons.find((l) => l.id === lastCompleted);

  return (
    <PageTransition>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <motion.div
          initial={reducedMotion ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: durations.medium, ease: easings.gentle }}
          className="mb-8"
        >
          <Display as="h1" className="text-display-md font-bold text-primary mb-2">
            Learn
          </Display>
          <p className="text-body-lg text-secondary">
            Track your progress across Bitcoin education tracks.
          </p>
        </motion.div>

        {lastLesson && lastTrack && (
          <motion.div
            initial={reducedMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: durations.small, delay: 0.1 }}
            className="bg-elevated border border-white/6 rounded-radius-lg p-4 mb-8 flex items-center gap-3"
          >
            <CheckCircle size={20} weight="fill" className="text-green flex-shrink-0" />
            <span className="text-body text-secondary">
              Recently completed:{" "}
              <span className="text-primary font-medium">
                Lesson {lastLesson.order} — {lastLesson.title}
              </span>
            </span>
          </motion.div>
        )}

        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 gap-6"
          variants={staggerContainer}
          initial="initial"
          animate="animate"
        >
          {tracks.map((track, i) => {
            const progress = getTrackProgress(track.id, profile.completedLessons);
            const isCompleted = profile.completedTracks.includes(track.id);

            return (
              <motion.div
                key={track.id}
                variants={staggerItem}
                whileHover={reducedMotion ? undefined : { y: -2 }}
                className={cn(
                  "rounded-radius-lg overflow-hidden bg-elevated border transition-all duration-300",
                  isCompleted ? "border-gold/30" : "border-white/6 hover:border-white/12"
                )}
              >
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div
                      className={cn(
                        "flex items-center justify-center w-10 h-10 rounded-full text-body font-bold",
                        isCompleted ? "bg-green/15 text-green" : "bg-bitcoin/15 text-bitcoin"
                      )}
                    >
                      {isCompleted ? "\u2713" : i + 1}
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

                  <h3 className="text-headline font-semibold text-primary mb-2">{track.title}</h3>
                  <p className="text-body text-secondary leading-relaxed mb-4">{track.description}</p>

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

                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-micro text-secondary uppercase tracking-wider">Progress</span>
                      <span className="text-micro text-primary font-medium">{progress}%</span>
                    </div>
                    <div className="h-1.5 bg-white/6 rounded-full overflow-hidden">
                      <motion.div
                        className={cn("h-full rounded-full", isCompleted ? "bg-green" : "bg-bitcoin")}
                        initial={reducedMotion ? false : { width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: durations.large, ease: easings.gentle, delay: 0.2 + i * 0.1 }}
                      />
                    </div>
                  </div>

                  <Button
                    variant={isCompleted ? "ghost" : "primary"}
                    size="md"
                    fullWidth
                    onClick={() => handleContinue(track.id)}
                    rightIcon={!isCompleted ? <ArrowRight size={16} weight="bold" /> : undefined}
                  >
                    {isCompleted ? "Review" : progress > 0 ? "Continue" : "Start"}
                  </Button>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </PageTransition>
  );
}
