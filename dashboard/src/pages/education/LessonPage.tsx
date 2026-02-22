import { useState, useCallback, type ReactNode } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, Check } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { Display } from "@/components/shared/Display";
import { PageTransition } from "@/components/shared/PageTransition";
import { durations, easings } from "@/lib/animation";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useUserStore } from "@/stores/userStore";
import { useToastStore } from "@/stores/toastStore";
import { getTrack, getLesson, getNextLesson, getPreviousLesson } from "@/mocks/education";

function parseContent(raw: string, replacements: Record<string, string>): ReactNode[] {
  let text = raw;
  for (const [key, value] of Object.entries(replacements)) {
    text = text.replace(new RegExp(`\\{${key}\\}`, "g"), value);
  }

  const lines = text.split("\n");
  const elements: ReactNode[] = [];
  let listItems: string[] = [];
  let inCodeBlock = false;
  let codeLines: string[] = [];

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`ul-${elements.length}`} className="space-y-2 mb-4 pl-4">
          {listItems.map((item, j) => (
            <li key={j} className="text-body text-secondary leading-relaxed flex items-start gap-2">
              <span className="text-bitcoin mt-1.5 flex-shrink-0">&#8226;</span>
              <span>{parseBold(item)}</span>
            </li>
          ))}
        </ul>
      );
      listItems = [];
    }
  };

  const flushCode = () => {
    if (codeLines.length > 0) {
      elements.push(
        <div key={`code-${elements.length}`} className="bg-elevated rounded-radius-md p-4 mb-4 font-mono text-caption text-secondary overflow-x-auto">
          {codeLines.map((line, j) => (
            <div key={j}>{line || "\u00A0"}</div>
          ))}
        </div>
      );
      codeLines = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("```")) {
      if (inCodeBlock) {
        flushCode();
        inCodeBlock = false;
      } else {
        flushList();
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    if (line.startsWith("## ")) {
      flushList();
      elements.push(
        <h2 key={`h2-${i}`} className="text-title font-semibold text-primary mt-8 mb-4">
          {parseBold(line.slice(3))}
        </h2>
      );
    } else if (line.startsWith("### ")) {
      flushList();
      elements.push(
        <h3 key={`h3-${i}`} className="text-headline font-semibold text-primary mt-6 mb-3">
          {parseBold(line.slice(4))}
        </h3>
      );
    } else if (line.startsWith("- ")) {
      listItems.push(line.slice(2));
    } else if (line.trim() === "") {
      flushList();
    } else {
      flushList();
      elements.push(
        <p key={`p-${i}`} className="text-body text-secondary leading-relaxed mb-4">
          {parseBold(line)}
        </p>
      );
    }
  }

  flushList();
  flushCode();
  return elements;
}

function parseBold(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  if (parts.length === 1) return text;
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={i} className="text-primary font-semibold">
              {part.slice(2, -2)}
            </strong>
          );
        }
        return part;
      })}
    </>
  );
}

export default function LessonPage() {
  const { trackId, lessonId } = useParams<{ trackId: string; lessonId: string }>();
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();
  const { profile, completeLesson, completeTrack, addXP } = useUserStore();
  const { addToast } = useToastStore();
  const [completing, setCompleting] = useState(false);
  const [showCheck, setShowCheck] = useState(false);

  const track = trackId ? getTrack(trackId) : undefined;
  const lesson = trackId && lessonId ? getLesson(trackId, lessonId) : undefined;
  const prevLesson = trackId && lessonId ? getPreviousLesson(trackId, lessonId) : undefined;
  const nextLesson = trackId && lessonId ? getNextLesson(trackId, lessonId) : undefined;

  const isCompleted = lessonId ? profile.completedLessons.includes(lessonId) : false;
  const isLastLesson = !nextLesson;

  const replacements: Record<string, string> = {
    hashrate: "475 GH/s",
    shareDiff: "1,024",
    networkDiff: "100.8T",
    ratio: "98 billion",
  };

  const handleMarkComplete = useCallback(() => {
    if (!lessonId || !trackId || completing) return;
    setCompleting(true);
    setShowCheck(true);

    completeLesson(lessonId);
    addXP(100);
    addToast({ type: "success", title: "Lesson completed!", message: "+100 XP" });

    setTimeout(() => {
      if (isLastLesson) {
        completeTrack(trackId);
        addToast({ type: "badge", title: "Track completed!", message: "You earned the Rabbit Hole badge!" });
        navigate("/learn");
      } else if (nextLesson) {
        navigate(`/learn/${trackId}/${nextLesson.id}`);
      }
      setCompleting(false);
      setShowCheck(false);
    }, 1500);
  }, [lessonId, trackId, completing, completeLesson, addXP, addToast, isLastLesson, completeTrack, navigate, nextLesson]);

  if (!track || !lesson) {
    return (
      <PageTransition>
        <div className="max-w-3xl mx-auto px-4 py-16 text-center">
          <Display as="h1" className="text-title font-bold text-primary mb-4">
            Lesson Not Found
          </Display>
          <p className="text-body text-secondary mb-6">This lesson doesn't exist.</p>
          <Link to="/learn">
            <Button variant="secondary">Back to Learn</Button>
          </Link>
        </div>
      </PageTransition>
    );
  }

  const lessonIndex = track.lessons.findIndex((l) => l.id === lesson.id);
  const totalLessons = track.lessons.length;
  const progressPercent = Math.round(((lessonIndex + (isCompleted ? 1 : 0)) / totalLessons) * 100);

  return (
    <PageTransition>
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <motion.div
          initial={reducedMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: durations.small }}
          className="flex items-center gap-2 text-caption text-secondary mb-6"
        >
          <Link to="/learn" className="hover:text-primary transition-colors">Learn</Link>
          <span>/</span>
          <span>Track {track.id}</span>
          <span>/</span>
          <span className="text-primary">Lesson {lesson.order}</span>
        </motion.div>

        {/* Title */}
        <motion.div
          initial={reducedMotion ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: durations.medium, ease: easings.gentle }}
          className="mb-6"
        >
          <Display as="h1" className="text-display-md font-bold text-primary mb-2">
            {lesson.title}
          </Display>
          <p className="text-body text-secondary">
            Lesson {lesson.order} of {totalLessons} — ~{lesson.estimatedMinutes} min
          </p>
        </motion.div>

        {/* Progress bar */}
        <div className="mb-8">
          <div className="h-1.5 bg-white/6 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-bitcoin rounded-full"
              initial={reducedMotion ? false : { width: 0 }}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: durations.large, ease: easings.gentle }}
            />
          </div>
        </div>

        {/* Content */}
        <motion.article
          initial={reducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: durations.medium, delay: 0.2 }}
          className="mb-12"
        >
          {parseContent(lesson.content, replacements)}
        </motion.article>

        {/* Bottom navigation */}
        <div className="flex items-center justify-between gap-4 py-6 border-t border-white/6">
          {prevLesson ? (
            <Link to={`/learn/${trackId}/${prevLesson.id}`}>
              <Button variant="ghost" size="md" leftIcon={<ArrowLeft size={16} weight="bold" />}>
                Previous
              </Button>
            </Link>
          ) : (
            <div />
          )}

          <div className="relative">
            <AnimatePresence>
              {showCheck && (
                <motion.div
                  initial={{ opacity: 1, y: 0 }}
                  animate={{ opacity: 0, y: -40 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 1.2, ease: easings.gentle }}
                  className="absolute -top-8 left-1/2 -translate-x-1/2 text-bitcoin font-mono font-bold text-body whitespace-nowrap"
                >
                  +100 XP
                </motion.div>
              )}
            </AnimatePresence>

            {isCompleted ? (
              <Button variant="ghost" size="md" disabled leftIcon={<Check size={16} weight="bold" />}>
                Completed
              </Button>
            ) : (
              <Button
                variant="primary"
                size="md"
                loading={completing}
                onClick={handleMarkComplete}
                rightIcon={!completing ? <Check size={16} weight="bold" /> : undefined}
              >
                {isLastLesson ? "Complete Track" : "Mark Complete"}
              </Button>
            )}
          </div>

          {nextLesson ? (
            <Link to={`/learn/${trackId}/${nextLesson.id}`}>
              <Button variant="ghost" size="md" rightIcon={<ArrowRight size={16} weight="bold" />}>
                Next
              </Button>
            </Link>
          ) : (
            <div />
          )}
        </div>
      </div>
    </PageTransition>
  );
}
