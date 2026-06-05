import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { MdClose, MdCheckCircle, MdOutlineFace } from "react-icons/md";
import { useLiveness } from "../hooks/useLiveness";
import { DEFAULT_CONFIG } from "../core/types";
import type {
  LivenessCheckResult,
  LivenessEngineConfig,
  ChallengeType,
  DebugMetrics,
  DebugLogLevel,
} from "../core/types";
import { DebugOverlay } from "./DebugOverlay";
import { normalizeEnabledChallenges } from "../utils/challengeDetector";
import { getModelInfo } from "../utils/reportGenerator";

// ── Types ─────────────────────────────────────────────────────────────────────

interface LivenessCameraProps {
  config?: Partial<LivenessEngineConfig>;
  onResult?: (result: LivenessCheckResult) => void;
  /** Called once after a PASSED verification, with the captured JPEG data-URL. */
  onCapture?: (photo: string, result: LivenessCheckResult) => void;
}

type ChallengeOption = { type: ChallengeType; label: string; icon: string };

// ── Constants ─────────────────────────────────────────────────────────────────

const INTRO_CHECKLIST = [
  "Posisikan wajah Anda di dalam frame",
  "Pastikan pencahayaan cukup",
  "Ikuti gerakan yang diminta",
  "Jaga wajah tetap terlihat jelas",
] as const;

const CHALLENGE_OPTIONS: ChallengeOption[] = [
  { type: "blink", label: "Kedip", icon: "👁️" },
  { type: "nod_top", label: "Angguk ↑", icon: "⬆️" },
  { type: "nod_bottom", label: "Angguk ↓", icon: "⬇️" },
  { type: "yaw_left", label: "Yaw ←", icon: "⬅️" },
  { type: "yaw_right", label: "Yaw →", icon: "➡️" },
  { type: "smile", label: "Senyum", icon: "😊" },
  { type: "open_mouth", label: "Buka Mulut", icon: "😮" },
  { type: "gaze_target", label: "Lihat Titik", icon: "🎯" },
];

// ── Animated progress ─────────────────────────────────────────────────────

function AnimatedProgress({ value }: { value: number }) {
  const clamped = Math.min(100, Math.max(0, Math.round(value)));
  const [display, setDisplay] = useState(clamped);
  const rafRef = useRef(0);
  const displayRef = useRef(clamped);

  useEffect(() => {
    const from = displayRef.current;
    const to = clamped;
    if (from === to) return;

    const duration = 520;
    const startTime = performance.now();

    const animate = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      const eased = 1 - (1 - t) ** 3;
      const next = Math.round(from + (to - from) * eased);
      setDisplay(next);
      displayRef.current = next;
      if (t < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setDisplay(to);
        displayRef.current = to;
      }
    };

    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [clamped]);

  return (
    <span className="inline-block tabular-nums transition-[transform,opacity] duration-300 ease-out">
      {display}%
    </span>
  );
}

// ── Corner Markers Component ──────────────────────────────────────────────

function CornerMarkers({ color = "#05b169" }: { color?: string }) {
  const cornerClass =
    "absolute w-[14%] min-w-[32px] max-w-[48px] aspect-square";

  const cornerPath = (d: string) => (
    <svg className="h-full w-full" viewBox="0 0 60 60" aria-hidden>
      <path
        d={d}
        stroke={color}
        strokeWidth="5"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 10 }}
    >
      <div className={`${cornerClass} left-[10%] top-[10%]`}>
        {cornerPath("M 60,0 L 0,0 L 0,60")}
      </div>
      <div className={`${cornerClass} right-[10%] top-[10%]`}>
        {cornerPath("M 0,0 L 60,0 L 60,60")}
      </div>
      <div className={`${cornerClass} bottom-[10%] left-[10%]`}>
        {cornerPath("M 0,0 L 0,60 L 60,60")}
      </div>
      <div className={`${cornerClass} bottom-[10%] right-[10%]`}>
        {cornerPath("M 60,0 L 60,60 L 0,60")}
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function LivenessCamera({
  config: configProp,
  onResult,
  onCapture,
}: LivenessCameraProps) {
  // Load config from localStorage first, then merge with props
  const loadConfigFromStorage = () => {
    const stored = localStorage.getItem("liveness_challenge_config");
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        console.error("Failed to load challenge config:", e);
      }
    }
    return {};
  };

  const storedConfig = loadConfigFromStorage();
  const base = { ...DEFAULT_CONFIG, ...storedConfig, ...configProp };

  // ── Settings state ─────────────────────────────────────────────────────────
  const [enabledChallenges, setEnabledChallenges] = useState<ChallengeType[]>(
    () => normalizeEnabledChallenges(base.enabledChallenges),
  );
  const [challengeCount, setChallengeCount] = useState(base.challengeCount);
  const [challengeTimeoutMs, setChallengeTimeoutMs] = useState(
    base.challengeTimeoutMs,
  );
  const [timeoutInputValue, setTimeoutInputValue] = useState(
    String(base.challengeTimeoutMs / 1000),
  );
  const [isUnlimitedTimeout, setIsUnlimitedTimeout] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Quality settings
  const [minBlurScore, setMinBlurScore] = useState(base.minBlurScore);
  const [minBrightness, setMinBrightness] = useState(base.minBrightness);
  const [maxBrightness, setMaxBrightness] = useState(base.maxBrightness);
  const [minFaceSize, setMinFaceSize] = useState(base.minFaceSize);
  const [maxFaceSize, setMaxFaceSize] = useState(base.maxFaceSize);
  const [antiSpoofThreshold, setAntiSpoofThreshold] = useState(base.antiSpoofThreshold);

  // ── Intro screen state ─────────────────────────────────────────────────────
  const [showIntro, setShowIntro] = useState(true);

  // ── Debug state ────────────────────────────────────────────────────────────
  const [debugEnabled] = useState(false);
  const [debugMetrics, setDebugMetrics] = useState<DebugMetrics | null>(null);
  const [debugLogs, setDebugLogs] = useState<
    Array<{
      timestamp: string;
      level: "info" | "warn" | "error";
      message: string;
    }>
  >([]);
  const debugLogSinkRef = useRef<
    (message: string, level?: DebugLogLevel) => void
  >(() => {});
  const handleDebug = useCallback((m: DebugMetrics) => setDebugMetrics(m), []);
  const handleDebugLog = useCallback(
    (message: string, level?: DebugLogLevel) => {
      const logEntry = {
        timestamp: new Date().toISOString(),
        level: (level || "info") as "info" | "warn" | "error",
        message,
      };
      setDebugLogs((prev) => [...prev, logEntry]);
      debugLogSinkRef.current(message, level);
    },
    [],
  );
  const handleRegisterLogSink = useCallback(
    (sink: (message: string, level?: DebugLogLevel) => void) => {
      debugLogSinkRef.current = sink;
    },
    [],
  );

  // ── Report state ───────────────────────────────────────────────────────────
  const [challengeScreenshots, setChallengeScreenshots] = useState<
    Array<{
      challengeType: string;
      timestamp: string;
      image: string;
    }>
  >([]);

  // ── Capture screenshot per challenge ───────────────────────────────────────
  const handleChallengeComplete = useCallback(
    (challengeType: ChallengeType, video: HTMLVideoElement) => {
      if (!video || video.videoWidth === 0) return;

      const c = document.createElement("canvas");
      c.width = video.videoWidth;
      c.height = video.videoHeight;
      const ctx = c.getContext("2d");
      if (!ctx) return;

      // Mirror to match displayed video
      ctx.translate(c.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0);
      const screenshot = c.toDataURL("image/jpeg", 0.88);

      setChallengeScreenshots((prev) => [
        ...prev,
        {
          challengeType,
          timestamp: new Date().toISOString(),
          image: screenshot,
        },
      ]);
    },
    [],
  );

  // ── Floating panel drag state ──────────────────────────────────────────────
  const [panelPos, setPanelPos] = useState({ x: 16, y: 80 });
  const panelRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{
    active: boolean;
    startClientX: number;
    startClientY: number;
    startPanelX: number;
    startPanelY: number;
  } | null>(null);

  // Initialise panel position to near-center after mount
  useEffect(() => {
    setPanelPos({
      x: Math.max(16, window.innerWidth / 2 - 160),
      y: Math.max(80, window.innerHeight / 4),
    });
  }, []);

  // Global pointer move / up for drag
  useEffect(() => {
    const move = (cx: number, cy: number) => {
      const d = dragState.current;
      if (!d?.active) return;
      const panelW = panelRef.current?.offsetWidth ?? 320;
      const panelH = panelRef.current?.offsetHeight ?? 480;
      setPanelPos({
        x: Math.max(
          0,
          Math.min(
            window.innerWidth - panelW,
            d.startPanelX + cx - d.startClientX,
          ),
        ),
        y: Math.max(
          0,
          Math.min(
            window.innerHeight - panelH,
            d.startPanelY + cy - d.startClientY,
          ),
        ),
      });
    };
    const onMouseMove = (e: MouseEvent) => move(e.clientX, e.clientY);
    const onTouchMove = (e: TouchEvent) =>
      move(e.touches[0].clientX, e.touches[0].clientY);
    const onEnd = () => {
      if (dragState.current) dragState.current.active = false;
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onEnd);
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onEnd);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, []);

  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    const cx = "touches" in e ? e.touches[0].clientX : e.clientX;
    const cy = "touches" in e ? e.touches[0].clientY : e.clientY;
    dragState.current = {
      active: true,
      startClientX: cx,
      startClientY: cy,
      startPanelX: panelPos.x,
      startPanelY: panelPos.y,
    };
  };

  // ── useLiveness wiring ────────────────────────────────────────────────────
  const mergedConfig: Partial<LivenessEngineConfig> = {
    ...configProp,
    enabledChallenges,
    challengeCount: Math.min(challengeCount, enabledChallenges.length),
    challengeTimeoutMs,
    minBlurScore,
    minBrightness,
    maxBrightness,
    minFaceSize,
    maxFaceSize,
    antiSpoofThreshold,
  };

  const latestResultRef = useRef<LivenessCheckResult | null>(null);

  const handleResult = useCallback(
    (result: LivenessCheckResult) => {
      latestResultRef.current = result;
      onResult?.(result);
    },
    [onResult],
  );

  const {
    status,
    videoRef,
    canvasRef,
    currentChallenge,
    challengeProgress,
    completedChallenges,
    totalChallenges,
    qualityWarning,
    start,
    reset,
  } = useLiveness({
    config: mergedConfig,
    onResult: handleResult,
    onChallengeComplete: handleChallengeComplete,
    debug: debugEnabled,
    onDebug: handleDebug,
    onDebugLog: handleDebugLog,
  });

  // ── Capture screenshot when verification passes or fails ─────────────────
  useEffect(() => {
    if (status !== "passed" && status !== "failed") return;
    const video = videoRef.current;
    const result = latestResultRef.current;
    if (!video || !result || video.videoWidth === 0) return;

    const c = document.createElement("canvas");
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    // Mirror to match displayed video
    ctx.translate(c.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);
    const screenshot = c.toDataURL("image/jpeg", 0.88);

    // Call onCapture if provided
    if (onCapture) {
      onCapture(screenshot, result);
    }

    // Save to history
    const modelInfo = getModelInfo();

    // Map challenge types to instructions
    const getChallengeInstruction = (type: ChallengeType): string => {
      const map: Record<ChallengeType, string> = {
        blink: "Kedip 2x",
        nod_top: "Angguk ke atas",
        nod_bottom: "Angguk ke bawah",
        yaw_left: "Toleh ke kiri",
        yaw_right: "Toleh ke kanan",
        smile: "Senyum",
        open_mouth: "Buka mulut",
        gaze_target: "Lihat titik merah",
      };
      return map[type] || type;
    };

    const historyEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      status: result.status,
      score: result.score,
      duration: (Date.now() - (result.timestamp || Date.now())) / 1000,
      challenges: (result.challengesPassed || []).map((ch) => ({
        type: ch.type,
        instruction: getChallengeInstruction(ch.type),
        completed: ch.passed,
        duration: ch.duration / 1000, // convert ms to seconds
      })),
      failReason: result.failReason,
      antiSpoofScore: result.antiSpoof?.score,
      qualityChecks: {
        brightness: result.quality?.brightness > 0,
        sharpness: result.quality?.blurScore > 0,
        faceSize: result.quality?.faceSize > 0,
      },
      screenshot: screenshot,
      screenshots:
        challengeScreenshots.length > 0 ? challengeScreenshots : undefined,
      logs: debugLogs,
      modelInfo: {
        faceDetection: "MediaPipe Face Mesh",
        antiSpoof: modelInfo.antiSpoof.modelName || "Heuristic",
        blinkDetection: modelInfo.challenges.blink.modelName || "EAR Heuristic",
        smileDetection:
          modelInfo.challenges.smile.modelName || "Corner-lift Heuristic",
      },
    };

    try {
      const stored = localStorage.getItem("liveness_history");
      const history = stored ? JSON.parse(stored) : [];
      history.unshift(historyEntry);
      // Keep only last 20 entries to avoid quota issues
      while (history.length > 20) history.pop();
      localStorage.setItem("liveness_history", JSON.stringify(history));
    } catch (error) {
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        console.warn('localStorage quota exceeded, clearing old history');
        try {
          localStorage.setItem("liveness_history", JSON.stringify([historyEntry]));
        } catch {
          console.error('Failed to save history even after clearing');
        }
      } else {
        console.error('Failed to save liveness history:', error);
      }
    }
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Settings helpers ──────────────────────────────────────────────────────
  const handleToggleChallenge = (type: ChallengeType) => {
    setEnabledChallenges((prev) => {
      if (prev.includes(type))
        return prev.length === 1 ? prev : prev.filter((t) => t !== type);
      return [...prev, type];
    });
  };

  const handleTimeoutInputChange = (value: string) => {
    setTimeoutInputValue(value);
    const seconds = parseFloat(value);
    if (!isNaN(seconds) && seconds > 0) {
      setChallengeTimeoutMs(Math.round(seconds * 1000));
    }
  };

  const handleToggleUnlimited = () => {
    setIsUnlimitedTimeout((prev) => {
      const newValue = !prev;
      if (newValue) {
        // Set ke nilai sangat besar (10 menit) untuk unlimited
        setChallengeTimeoutMs(600000);
      } else {
        // Kembali ke nilai input atau default 6 detik
        const seconds = parseFloat(timeoutInputValue);
        setChallengeTimeoutMs(
          isNaN(seconds) || seconds <= 0 ? 6000 : Math.round(seconds * 1000),
        );
      }
      return newValue;
    });
  };

  const maxCount = enabledChallenges.length;

  const handleStart = () => {
    setShowSettings(false);
    setChallengeScreenshots([]); // Reset screenshots
    setShowIntro(false); // Hide intro screen
    start();
  };

  const handleReset = () => {
    reset();
    setShowIntro(true);
    setShowSettings(false);
    setChallengeScreenshots([]);
  };

  const isIntroIdle = showIntro && status === "idle";
  const isResultIdle = status === "passed" || status === "failed";
  const isCardLayout = isIntroIdle || isResultIdle;

  const progressPercent = useMemo(() => {
    // When not actively in a challenge — show completed-only percentage, not climbing
    if (status !== "challenge" || totalChallenges === 0 || !currentChallenge) {
      return completedChallenges > 0
        ? Math.round((completedChallenges / Math.max(totalChallenges, 1)) * 100)
        : 0;
    }
    const baseProgress = (completedChallenges / totalChallenges) * 100;
    if (challengeProgress > 0) {
      const currentChallengeWeight = 100 / totalChallenges;
      const currentProgress =
        (challengeProgress / 100) * currentChallengeWeight;
      return Math.min(Math.round(baseProgress + currentProgress), 100);
    }
    return Math.round(baseProgress);
  }, [
    totalChallenges,
    completedChallenges,
    status,
    challengeProgress,
    currentChallenge,
  ]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-[calc(100dvh-4rem)] w-full flex-col items-center justify-center bg-gradient-to-b from-canvas via-surface-soft/30 to-canvas px-4 py-4 sm:px-6 sm:py-6">
      <div
        className={`flex w-full flex-col ${
          isCardLayout
            ? "max-w-[320px] sm:max-w-[340px]"
            : "max-w-[min(100%,380px)] sm:max-w-[min(100%,420px)] md:max-w-[min(100%,460px)]"
        }`}
      >
        {/* Header */}
        <div className={`text-center ${isCardLayout ? "mb-6 sm:mb-8" : "mb-4 sm:mb-5"}`}>
          <h1
            className={`font-semibold tracking-tight text-ink ${
              isCardLayout
                ? "mb-2 text-[clamp(1.5rem,5vw,2rem)]"
                : "mb-1.5 text-[clamp(1.25rem,4vw,1.75rem)]"
            }`}
          >
            Verifikasi Wajah
          </h1>
          {isIntroIdle && (
            <p className="text-[clamp(0.8125rem,2.5vw,0.875rem)] text-body">
              Siap untuk memulai verifikasi
            </p>
          )}
        </div>

        {/* Result screen — glass card with brand shadow */}
        {isResultIdle ? (
          <div className="flex flex-col">
            <div className="liveness-glass-surface flex flex-col items-center gap-4 rounded-2xl px-6 pb-8 pt-10">
              {status === "passed" ? (
                <>
                  <div className="flex h-20 w-20 items-center justify-center rounded-full border border-white/60 bg-semantic-up/15 backdrop-blur-sm">
                    <svg
                      className="h-12 w-12 text-semantic-up"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                  <p className="text-center text-[clamp(1.125rem,3.5vw,1.5rem)] font-semibold text-ink">
                    Verifikasi Berhasil
                  </p>
                </>
              ) : (
                <>
                  <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/60 bg-semantic-down/15 backdrop-blur-sm sm:h-20 sm:w-20">
                    <MdClose className="h-10 w-10 text-semantic-down sm:h-12 sm:w-12" />
                  </div>
                  <p className="text-center text-[clamp(1.125rem,3.5vw,1.5rem)] font-semibold text-ink">
                    Verifikasi Gagal
                  </p>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={handleReset}
              className="mt-8 w-full rounded-pill bg-primary py-3.5 text-title-sm font-semibold text-on-primary transition-colors hover:bg-primary-active focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              {status === "passed" ? "Verifikasi Lagi" : "Coba Lagi"}
            </button>
          </div>
        ) : isIntroIdle ? (
          <div className="flex flex-col">
            <div className="liveness-glass-surface rounded-2xl px-6 pt-8 pb-6">
              <div className="flex justify-center mb-5" aria-hidden>
                <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 ring-2 ring-primary/25">
                  <MdOutlineFace className="w-8 h-8 text-primary" />
                </div>
              </div>

              <p className="text-caption text-muted text-center mb-5">
                Ikuti instruksi berikut untuk memulai:
              </p>

              <ul
                className="space-y-4 rounded-xl border border-white/60 bg-white/45 p-5 backdrop-blur-md"
                aria-label="Instruksi verifikasi wajah"
              >
                {INTRO_CHECKLIST.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <MdCheckCircle
                      className="text-primary text-xl flex-shrink-0"
                      aria-hidden
                    />
                    <span className="text-body-sm text-ink">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <button
              type="button"
              onClick={handleStart}
              className="w-full mt-8 py-3.5 bg-primary hover:bg-primary-active text-on-primary rounded-pill text-title-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              Mulai Verifikasi
            </button>
          </div>
        ) : (
        /* Camera View */
        <div className="mb-4 flex w-full justify-center">
          <div className="liveness-glass-camera relative mx-auto aspect-[3/4] h-[min(58dvh,520px)] w-auto max-w-full rounded-2xl sm:h-[min(62dvh,560px)]">
          <div className="absolute inset-0 overflow-hidden rounded-2xl bg-gradient-to-br from-white/25 via-white/10 to-primary/5">
          {/* Loading spinner */}
          {(status === "initializing" || status === "processing") && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/40 backdrop-blur-md">
              <div
                className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent"
                aria-label={status === "initializing" ? "Memuat" : "Memproses"}
              />
            </div>
          )}

          {/* Video — always in DOM so videoRef is set before start() is called */}
          <video
            ref={videoRef}
            className={`absolute inset-0 h-full w-full scale-x-[-1] bg-surface-soft object-cover ${
              status === "ready" ||
              status === "detecting" ||
              status === "challenge"
                ? "block"
                : "hidden"
            }`}
            playsInline
            muted
          />

          {/* Active session overlays */}
          {(status === "ready" ||
            status === "detecting" ||
            status === "challenge") && (
            <>
              {/* Corner markers instead of oval guide */}
              <CornerMarkers color="#05b169" />

              {/* Gaze target dot */}
              {status === "challenge" &&
                currentChallenge?.type === "gaze_target" &&
                currentChallenge.gazeTarget && (
                  <div
                    className="absolute w-7 h-7 rounded-full bg-semantic-down border-4 border-white shadow-lg animate-pulse pointer-events-none"
                    style={{
                      left: `${currentChallenge.gazeTarget.x * 100}%`,
                      top: `${currentChallenge.gazeTarget.y * 100}%`,
                      transform: "translate(-50%, -50%)",
                    }}
                    aria-hidden="true"
                  />
                )}

              {/* Quality warning */}
              {qualityWarning && (
                <div className="absolute left-1/2 top-3 z-20 max-w-[92%] -translate-x-1/2 rounded-pill border border-white/60 bg-accent-yellow/85 px-3 py-1.5 text-[clamp(0.75rem,2.2vw,0.875rem)] font-semibold text-ink shadow-lg backdrop-blur-md sm:top-4 sm:px-4 sm:py-2">
                  {qualityWarning}
                </div>
              )}
            </>
          )}

          {/* Hidden canvas for quality processing */}
          <canvas ref={canvasRef} className="hidden" />
          </div>
          </div>
        </div>
        )}

        {/* Progress Indicator - shown during active verification */}
        {(status === "ready" ||
          status === "detecting" ||
          status === "challenge" ||
          status === "processing") && (
          <div className="mt-3 bg-transparent px-2 py-2 text-center sm:mt-4">
            <div className="mb-0.5 font-semibold tracking-tight text-ink text-[clamp(1.75rem,7vw,2.75rem)]">
              <AnimatedProgress value={progressPercent} />
            </div>
            {status === "challenge" && currentChallenge?.instruction && (
              <p className="text-[clamp(0.9375rem,2.8vw,1.0625rem)] font-medium text-body transition-opacity duration-300">
                {currentChallenge.instruction}
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Floating Settings Modal ──────────────────────────────────────── */}
      {showSettings && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-surface-dark/40 backdrop-blur-sm"
            onClick={() => setShowSettings(false)}
            aria-hidden="true"
          />

          {/* Draggable panel */}
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Pengaturan Challenge"
            className="fixed z-50 w-80 bg-canvas border border-hairline rounded-xl shadow-2xl select-none"
            style={{ left: panelPos.x, top: panelPos.y, touchAction: "none" }}
          >
            {/* Drag handle */}
            <div
              className="flex items-center justify-between px-4 pt-4 pb-2 cursor-grab active:cursor-grabbing"
              onMouseDown={handleDragStart}
              onTouchStart={handleDragStart}
            >
              <div className="flex items-center gap-2">
                <span className="text-base">⚙️</span>
                <span className="text-ink font-semibold text-sm">
                  Pengaturan Challenge
                </span>
              </div>
              <button
                onClick={() => setShowSettings(false)}
                aria-label="Tutup pengaturan"
                className="text-muted hover:text-ink w-7 h-7 flex items-center justify-center rounded-full hover:bg-surface-soft transition-colors text-lg"
              >
                ✕
              </button>
            </div>
            {/* Visual drag indicator */}
            <div className="w-10 h-1 bg-hairline rounded-pill mx-auto mb-3" />

            <div className="px-4 pb-5 space-y-5">
              {/* Challenge types */}
              <div>
                <p className="text-muted text-xs font-semibold uppercase tracking-wider mb-2">
                  Pilih Challenge
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {CHALLENGE_OPTIONS.map(({ type, label, icon }) => {
                    const active = enabledChallenges.includes(type);
                    return (
                      <button
                        key={type}
                        onClick={() => handleToggleChallenge(type)}
                        aria-pressed={active}
                        aria-label={label}
                        className={`flex flex-col items-center gap-1 rounded-xl py-2.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-primary ${
                          active
                            ? "bg-primary text-on-primary"
                            : "bg-surface-strong text-body hover:bg-hairline"
                        }`}
                      >
                        <span className="text-lg leading-none">{icon}</span>
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Challenge count */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-muted text-xs font-semibold uppercase tracking-wider">
                    Jumlah Challenge
                  </p>
                  <span className="text-primary font-bold text-sm">
                    {Math.min(challengeCount, maxCount)}
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={maxCount}
                  value={Math.min(challengeCount, maxCount)}
                  onChange={(e) => setChallengeCount(Number(e.target.value))}
                  className="w-full accent-primary"
                  aria-label="Jumlah challenge"
                />
                <div className="flex justify-between text-muted text-xs mt-1">
                  <span>1</span>
                  <span>{maxCount}</span>
                </div>
              </div>

              {/* Timeout */}
              <div>
                <p className="text-muted text-xs font-semibold uppercase tracking-wider mb-2">
                  Waktu per Challenge
                </p>

                {/* Unlimited toggle */}
                <label className="flex items-center gap-2 mb-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isUnlimitedTimeout}
                    onChange={handleToggleUnlimited}
                    className="w-4 h-4 accent-primary cursor-pointer"
                  />
                  <span className="text-body text-sm">
                    Unlimited (tanpa batas waktu)
                  </span>
                </label>

                {/* Input field */}
                {!isUnlimitedTimeout && (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max="60"
                      step="0.5"
                      value={timeoutInputValue}
                      onChange={(e) => handleTimeoutInputChange(e.target.value)}
                      placeholder="6"
                      className="flex-1 bg-surface-soft text-ink px-3 py-2 rounded-lg text-sm border border-hairline focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                      aria-label="Waktu timeout dalam detik"
                    />
                    <span className="text-body text-sm">detik</span>
                  </div>
                )}

                {isUnlimitedTimeout && (
                  <p className="text-primary text-xs mt-1">
                    ⏱️ Challenge tidak akan timeout otomatis
                  </p>
                )}
              </div>

              {/* Quality Settings */}
              <div className="border-t border-hairline pt-4 space-y-4">
                <p className="text-muted text-xs font-semibold uppercase tracking-wider">
                  Kualitas Gambar
                </p>

                {/* Sharpness */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-body text-xs flex items-center gap-1">
                      Ketajaman Min
                      <span className="group relative cursor-help">
                        <span className="text-muted">ⓘ</span>
                        <span className="invisible group-hover:visible absolute left-0 top-5 z-50 w-56 bg-surface-dark text-white text-[10px] leading-relaxed p-2 rounded shadow-lg">
                          Mengukur ketajaman gambar (0-255). Nilai rendah = toleran terhadap blur, nilai tinggi = butuh gambar sangat tajam. Rekomendasi: 15-20 untuk webcam standar.
                        </span>
                      </span>
                    </label>
                    <span className="text-primary font-mono text-xs">{minBlurScore}</span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={50}
                    step={1}
                    value={minBlurScore}
                    onChange={(e) => setMinBlurScore(Number(e.target.value))}
                    className="w-full accent-primary"
                  />
                  <div className="flex justify-between text-muted text-[10px] mt-0.5">
                    <span>10 (blur ok)</span>
                    <span>50 (sangat tajam)</span>
                  </div>
                </div>

                {/* Brightness */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-body text-xs flex items-center gap-1">
                      Kecerahan
                      <span className="group relative cursor-help">
                        <span className="text-muted">ⓘ</span>
                        <span className="invisible group-hover:visible absolute left-0 top-5 z-50 w-56 bg-surface-dark text-white text-[10px] leading-relaxed p-2 rounded shadow-lg">
                          Range kecerahan yang diterima (0-255). Min terlalu tinggi = reject ruangan gelap. Max terlalu rendah = reject cahaya terang. Rekomendasi: 40-220.
                        </span>
                      </span>
                    </label>
                    <span className="text-primary font-mono text-xs">{minBrightness}–{maxBrightness}</span>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <input
                        type="range"
                        min={20}
                        max={100}
                        value={minBrightness}
                        onChange={(e) => setMinBrightness(Number(e.target.value))}
                        className="w-full accent-primary"
                      />
                      <p className="text-[10px] text-muted mt-0.5">Min</p>
                    </div>
                    <div className="flex-1">
                      <input
                        type="range"
                        min={180}
                        max={240}
                        value={maxBrightness}
                        onChange={(e) => setMaxBrightness(Number(e.target.value))}
                        className="w-full accent-primary"
                      />
                      <p className="text-[10px] text-muted mt-0.5">Max</p>
                    </div>
                  </div>
                </div>

                {/* Face Size */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-body text-xs flex items-center gap-1">
                      Ukuran Wajah
                      <span className="group relative cursor-help">
                        <span className="text-muted">ⓘ</span>
                        <span className="invisible group-hover:visible absolute left-0 top-5 z-50 w-56 bg-surface-dark text-white text-[10px] leading-relaxed p-2 rounded shadow-lg">
                          Persentase area wajah terhadap frame (0-100%). Min terlalu tinggi = user harus terlalu dekat. Max terlalu rendah = user harus terlalu jauh. Rekomendasi: 10%-80%.
                        </span>
                      </span>
                    </label>
                    <span className="text-primary font-mono text-xs">{(minFaceSize * 100).toFixed(0)}%–{(maxFaceSize * 100).toFixed(0)}%</span>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <input
                        type="range"
                        min={0.05}
                        max={0.30}
                        step={0.01}
                        value={minFaceSize}
                        onChange={(e) => setMinFaceSize(Number(e.target.value))}
                        className="w-full accent-primary"
                      />
                      <p className="text-[10px] text-muted mt-0.5">Min</p>
                    </div>
                    <div className="flex-1">
                      <input
                        type="range"
                        min={0.50}
                        max={0.95}
                        step={0.01}
                        value={maxFaceSize}
                        onChange={(e) => setMaxFaceSize(Number(e.target.value))}
                        className="w-full accent-primary"
                      />
                      <p className="text-[10px] text-muted mt-0.5">Max</p>
                    </div>
                  </div>
                </div>

                {/* Anti-Spoof Threshold */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-body text-xs flex items-center gap-1">
                      Anti-Spoof Threshold
                      <span className="group relative cursor-help">
                        <span className="text-muted">ⓘ</span>
                        <span className="invisible group-hover:visible absolute left-0 top-5 z-50 w-56 bg-surface-dark text-white text-[10px] leading-relaxed p-2 rounded shadow-lg">
                          Threshold deteksi spoof (foto/video replay). Nilai rendah = lebih lenient (lebih banyak pass), nilai tinggi = lebih strict (lebih banyak reject). Rekomendasi: 0.20-0.30.
                        </span>
                      </span>
                    </label>
                    <span className="text-primary font-mono text-xs">{antiSpoofThreshold.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min={0.10}
                    max={0.60}
                    step={0.05}
                    value={antiSpoofThreshold}
                    onChange={(e) => setAntiSpoofThreshold(Number(e.target.value))}
                    className="w-full accent-primary"
                  />
                  <div className="flex justify-between text-muted text-[10px] mt-0.5">
                    <span>0.10 (lenient)</span>
                    <span>0.60 (strict)</span>
                  </div>
                </div>
              </div>

              {/* Start */}
              <button
                onClick={handleStart}
                className="w-full py-3 bg-primary hover:bg-primary-active text-white rounded-pill font-semibold text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
              >
                Mulai Verifikasi
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Debug Overlay ─────────────────────────────────────────────────── */}
      <DebugOverlay
        metrics={debugMetrics}
        enabled={debugEnabled}
        onRegisterLogSink={handleRegisterLogSink}
      />
    </div>
  );
}
