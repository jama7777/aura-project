/**
 * face_emotion.js  v4
 * High-accuracy face emotion detection using face-api.js (faceExpressionNet)
 * v4 adds: head-turn detection using facial landmark asymmetry
 *
 * Head turn is detected by comparing left-eye vs right-eye x positions
 * relative to the nose tip. When one eye is much closer to the nose than
 * the other, the head is turned to that side.
 */

const HISTORY_SIZE = 10;    // rolling window frames
const CONF_THRESHOLD = 0.18;  // min score for a non-neutral frame winner
const WIN_THRESHOLD = 0.22;  // min % of window votes to accept dominant emotion
const STABLE_MS = 550;   // ms emotion must hold before firing onEmotion

// Head-turn detection thresholds
// 0.28 = only fires on STRONG turns (e.g. looking far left/right away from screen).
// 0.40 was too sensitive and fired when user was just slightly angled.
const HEAD_TURN_RATIO = 0.28;  // lower = less sensitive (stronger turn needed)
const HEAD_TURN_MS   = 1500;   // must hold turn 1.5s before callback fires

// ─── FaceEmotionDetector ──────────────────────────────────────────────────────
class FaceEmotionDetector {
    constructor() {
        this._timer = null;
        this._history = [];        // string[] of winning labels per frame
        this._scores = {};        // latest raw scores from face-api
        this._dominant = 'neutral';
        this._confidence = 0;
        this._stableStart = 0;
        this._lastEmitted = 'neutral';
        this._pendingEmotion = 'neutral';
        this._onEmotion = null;
        this._onDebug = null;
        this._onHeadTurn = null;   // v4: callback for head-turn
        this._onInattention = null; // v5: callback for looking away/no-face
        this.ready = false;
        this._frameCount = 0;

        // Head-turn tracking
        this._headTurnStart = null;   // timestamp turn began
        this._headTurnFired = false;  // throttle: only fire once per turn
        this._headTurnDir = null;     // 'left' | 'right' | null
        this._isPaused = false;       // v4.1: pause entirely
        this._isSlowMode = false;     // v4.1: throttle for performance (e.g. while recording)

        // Inattention tracking
        this._lastFaceSeen = Date.now();
        this._inattentionFired = false;
        this._INATTENTION_MS = 6000;  // 6s of looking away/no-face
    }

    /** Set callback for sustained-emotion events: cb(emotion, confidence, scores) */
    onEmotion(cb) { this._onEmotion = cb; }

    /** Set debug callback fired every frame: cb(dominantEmotion, smoothedScores) */
    onDebug(cb) { this._onDebug = cb; }

    /**
     * v4: Set callback for head-turn events.
     * cb(direction) where direction is 'left' | 'right'
     */
    onHeadTurn(cb) { this._onHeadTurn = cb; }

    /**
     * v5: Set callback for inattention/looking away.
     */
    onInattention(cb) { this._onInattention = cb; }

    /** Reset head-turn and inattention state (call after AURA reacts so she doesn't spam) */
    resetAttention() {
        this._headTurnStart = null;
        this._headTurnFired = false;
        this._headTurnDir = null;
        this._lastFaceSeen = Date.now();
        this._inattentionFired = false;
    }

    /** Reset head-turn state (backwards compatibility) */
    resetHeadTurn() {
        this.resetAttention();
    }

    /** v4.1: Pause detection to save CPU */
    pause() { this._isPaused = true; }
    /** v4.1: Resume detection */
    resume() { this._isPaused = false; this._schedule(); }
    /** v4.1: Slow down detection frequency (e.g. to 2fps) for performance */
    setSlowMode(on) { this._isSlowMode = on; }

    /**
     * Start detection loop on a <video> element.
     * face-api.js nets must already be loaded by main.js before calling this.
     */
    start(videoElement) {
        this._video = videoElement;
        this.ready = true;
        this._stableStart = Date.now();
        this._lastFaceSeen = Date.now();
        this._schedule();
        console.log('[FaceEmotion v5] Detector started');
    }

    stop() {
        if (this._timer) clearTimeout(this._timer);
        this._timer = null;
        this.ready = false;
        this._history = [];
        this.resetAttention();
        console.log('[FaceEmotion v5] Detector stopped');
    }

    // ─── Internal loop ─────────────────────────────────────────────────────────
    _schedule() {
        if (!this.ready) return;
        if (this._timer) clearTimeout(this._timer);
        
        // If recording active, we slow way down to save CPU for the audio processing
        const delay = this._isSlowMode ? 500 : 75; 
        this._timer = setTimeout(() => this._detect(), delay);
    }

    async _detect() {
        if (!this.ready || !this._video) return;

        const v = this._video;
        if (v.paused || v.ended || v.readyState < 2) {
            this._schedule();
            return;
        }

        try {
            const opts = new faceapi.TinyFaceDetectorOptions({
                inputSize: 416,     // Increased from 320 for better detection
                scoreThreshold: 0.15 // Lowered from 0.25 for better sensitivity
            });

            // v4.1: If landmarker model failed to load, we skip it and just do expressions.
            // This prevents a crash loop when model files are missing.
            let task = faceapi.detectSingleFace(v, opts);
            
            const hasLandmarks = faceapi.nets.faceLandmark68TinyNet.isLoaded || faceapi.nets.faceLandmark68Net.isLoaded;
            
            if (hasLandmarks) {
                task = task.withFaceLandmarks(true);
            }
            
            const det = await task.withFaceExpressions();

            if (det) {
                this._frameCount++;
                this._processDetection(det.expressions);
                this._lastFaceSeen = Date.now();
                this._inattentionFired = false;

                if (hasLandmarks && det.landmarks) {
                    this._processHeadTurn(det.landmarks);
                }
            } else {
                // No face found
                this._pushLabel('neutral', 0);
                if (this._onDebug) this._onDebug(null, null);
                
                // Head-turn reset
                this._headTurnStart = null;
                this._headTurnFired = false;
                this._headTurnDir = null;

                // Inattention check
                const now = Date.now();
                if (!this._inattentionFired && (now - this._lastFaceSeen) >= this._INATTENTION_MS) {
                    this._inattentionFired = true;
                    if (this._onInattention) this._onInattention();
                    console.log(`[FaceEmotion v5] ⚠️ Inattention detected: User left camera or looked away.`);
                }
            }
        } catch (e) {
            console.warn('[FaceEmotion v5] Detection error:', e.message);
        }

        this._schedule();
    }

    // ─── Head-turn detection ───────────────────────────────────────────────────
    /**
     * Uses 68-point landmark model.
     * Left eye center  ≈ avg of points 36-41
     * Right eye center ≈ avg of points 42-47
     * Nose tip         = point 30
     *
     * Asymmetry ratio:
     *   leftDist  = nose.x - leftEye.x   (how far left eye is from nose)
     *   rightDist = rightEye.x - nose.x  (how far right eye is from nose)
     *   ratio = min/max → near 1.0 = straight, near 0.0 = strongly turned
     *
     * When head turns RIGHT: left eye gets farther, right eye gets closer → ratio drops on right
     * When head turns LEFT:  right eye gets farther, left eye gets closer → ratio drops on left
     */
    _processHeadTurn(landmarks) {
        if (!landmarks) return;

        const pts = landmarks.positions;
        if (!pts || pts.length < 48) return;

        // Left eye center (indices 36–41)
        let lx = 0;
        for (let i = 36; i <= 41; i++) lx += pts[i].x;
        lx /= 6;

        // Right eye center (indices 42–47)
        let rx = 0;
        for (let i = 42; i <= 47; i++) rx += pts[i].x;
        rx /= 6;

        // Nose tip (index 30)
        const nx = pts[30].x;

        const leftDist  = Math.abs(nx - lx);
        const rightDist = Math.abs(rx - nx);
        const total = leftDist + rightDist;
        if (total < 1) return;

        const leftRatio  = leftDist  / total;  // ~0.5 when straight
        const rightRatio = rightDist / total;

        // Determine if head is turned
        let turnDir = null;
        if (rightRatio < HEAD_TURN_RATIO) {
            // Right eye is very close to nose → head turned RIGHT
            turnDir = 'right';
        } else if (leftRatio < HEAD_TURN_RATIO) {
            // Left eye is very close to nose → head turned LEFT
            turnDir = 'left';
        }

        const now = Date.now();

        if (turnDir) {
            if (this._headTurnDir !== turnDir) {
                // New turn direction — reset timer
                this._headTurnDir = turnDir;
                this._headTurnStart = now;
                this._headTurnFired = false;
            } else if (!this._headTurnFired &&
                       (now - this._headTurnStart) >= HEAD_TURN_MS) {
                // Held long enough → fire callback
                this._headTurnFired = true;
                if (this._onHeadTurn) this._onHeadTurn(turnDir);
                console.log(`[FaceEmotion v5] 🔄 Head turned: ${turnDir}`);
            }
        } else {
            // Head straight — reset
            if (this._headTurnDir !== null) {
                this._headTurnDir = null;
                this._headTurnStart = null;
                this._headTurnFired = false;
            }
        }
    }

    // ─── Process one frame of expression scores ────────────────────────────────
    _processDetection(expressions) {
        const raw = {};
        for (const [k, v] of Object.entries(expressions)) {
            raw[k] = parseFloat(v) || 0;
        }
        this._scores = raw;

        let winner = 'neutral';
        let winScore = 0;

        for (const [k, score] of Object.entries(raw)) {
            if (k !== 'neutral' && score > winScore) {
                winner = k;
                winScore = score;
            }
        }

        if (winScore < CONF_THRESHOLD) {
            winner = 'neutral';
            winScore = raw['neutral'] || 0;
        }

        this._pushLabel(winner, winScore);

        const smoothed = {};
        const total = this._history.length;

        for (const label of this._history) {
            smoothed[label] = (smoothed[label] || 0) + 1;
        }
        for (const k of Object.keys(smoothed)) {
            smoothed[k] = smoothed[k] / total;
        }
        for (const k of Object.keys(raw)) {
            if (!(k in smoothed)) smoothed[k] = 0;
        }

        let dom = 'neutral';
        let domVotes = 0;
        for (const [k, v] of Object.entries(smoothed)) {
            if (v > domVotes) { dom = k; domVotes = v; }
        }

        if (dom !== 'neutral' && domVotes < WIN_THRESHOLD) {
            dom = 'neutral';
            domVotes = smoothed['neutral'] || 0;
        }

        this._dominant = dom;
        this._confidence = domVotes;

        if (this._onDebug) this._onDebug(dom, smoothed);

        const now = Date.now();

        if (dom !== this._pendingEmotion) {
            this._pendingEmotion = dom;
            this._stableStart = now;
        }

        if (dom !== this._lastEmitted && (now - this._stableStart) >= STABLE_MS) {
            this._lastEmitted = dom;
            if (this._onEmotion) {
                this._onEmotion(dom, domVotes, smoothed);
            }
            console.log(`[FaceEmotion v4] ✅ Emitted: ${dom} (${(domVotes * 100).toFixed(0)}%)`);
        }
    }

    // ─── Push a label into the rolling history window ─────────────────────────
    _pushLabel(label, score) {
        this._history.push(label);
        if (this._history.length > HISTORY_SIZE) this._history.shift();
    }

    get dominant() { return this._dominant; }
    get confidence() { return this._confidence; }
    get frameCount() { return this._frameCount; }
}

// Global instance for the app — must be set BEFORE main.js runs
window.faceDetector = new FaceEmotionDetector();
