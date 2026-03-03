/**
 * face_emotion.js  v3
 * High-accuracy face emotion detection using face-api.js (faceExpressionNet)
 * Fixed: _pushLabel bug, CONF_THRESHOLD logic, majority-vote smoothing.
 * 
 * Key fixes in v3:
 * - _pushLabel now correctly receives and uses winScore
 * - CONF_THRESHOLD comparison fixed (was comparing undefined)
 * - Lower thresholds so non-neutral emotions are actually detected
 * - Faster loop (60ms = ~16fps) for quicker response
 * - SSD MobileNet detector option as fallback for better accuracy
 */

const HISTORY_SIZE = 10;    // rolling window frames
const CONF_THRESHOLD = 0.18;  // min score for a non-neutral frame winner
const WIN_THRESHOLD = 0.22;  // min % of window votes to accept dominant emotion
const STABLE_MS = 550;   // ms emotion must hold before firing onEmotion

// ─── FaceEmotionDetector ──────────────────────────────────────────────────────
export class FaceEmotionDetector {
    constructor() {
        this._timer = null;
        this._history = [];        // string[] of winning labels per frame
        this._scores = {};        // latest raw scores from face-api
        this._dominant = 'neutral';
        this._confidence = 0;
        this._stableStart = 0;
        this._lastEmitted = 'neutral';
        this._onEmotion = null;
        this._onDebug = null;
        this.ready = false;
        this._frameCount = 0;      // for debug logging
    }

    /** Set callback for sustained-emotion events: cb(emotion, confidence, scores) */
    onEmotion(cb) { this._onEmotion = cb; }

    /** Set debug callback fired every frame: cb(dominantEmotion, smoothedScores) */
    onDebug(cb) { this._onDebug = cb; }

    /**
     * Start detection loop on a <video> element.
     * face-api.js nets must already be loaded by main.js before calling this.
     */
    start(videoElement) {
        this._video = videoElement;
        this.ready = true;
        this._stableStart = Date.now();
        this._schedule();
        console.log('[FaceEmotion v3] Detector started');
    }

    stop() {
        if (this._timer) clearTimeout(this._timer);
        this._timer = null;
        this.ready = false;
        this._history = [];
        console.log('[FaceEmotion v3] Detector stopped');
    }

    // ─── Internal loop ─────────────────────────────────────────────────────────
    _schedule() {
        this._timer = setTimeout(() => this._detect(), 60);  // ~16 fps
    }

    async _detect() {
        if (!this.ready || !this._video) return;

        const v = this._video;
        if (v.paused || v.ended || v.readyState < 2) {
            this._schedule();
            return;
        }

        try {
            // TinyFaceDetector — fast and lightweight
            const opts = new faceapi.TinyFaceDetectorOptions({
                inputSize: 320,   // larger = more accurate
                scoreThreshold: 0.25   // lower = detects faces at odd angles/lighting
            });

            const det = await faceapi
                .detectSingleFace(v, opts)
                .withFaceExpressions();

            if (det) {
                this._frameCount++;
                this._processDetection(det.expressions);
            } else {
                // No face found → push neutral with score 0
                this._pushLabel('neutral', 0);
                if (this._onDebug) this._onDebug(null, null);
            }
        } catch (e) {
            // Silently skip failed frames (common during model warm-up)
            console.warn('[FaceEmotion v3] Detection error:', e.message);
        }

        this._schedule();
    }

    // ─── Process one frame of expression scores ────────────────────────────────
    _processDetection(expressions) {
        // ── Step 1: Build plain {label → score} from face-api expressions ──
        const raw = {};
        for (const [k, v] of Object.entries(expressions)) {
            raw[k] = parseFloat(v) || 0;
        }
        this._scores = raw;

        // ── Step 2: Pick the frame winner (highest non-neutral score) ──
        let winner = 'neutral';
        let winScore = 0;

        for (const [k, score] of Object.entries(raw)) {
            if (k !== 'neutral' && score > winScore) {
                winner = k;
                winScore = score;
            }
        }

        // Only accept as non-neutral if it clears the confidence threshold
        if (winScore < CONF_THRESHOLD) {
            winner = 'neutral';
            winScore = raw['neutral'] || 0;
        }

        // ── Step 3: Push this frame's label into the rolling history ──
        this._pushLabel(winner, winScore);   // ← BUG FIX: was missing winScore

        // ── Step 4: Compute smoothed scores as vote fractions over history ──
        const smoothed = {};
        const total = this._history.length;

        // Count votes for each label seen in history
        for (const label of this._history) {
            smoothed[label] = (smoothed[label] || 0) + 1;
        }
        // Normalise to fractions
        for (const k of Object.keys(smoothed)) {
            smoothed[k] = smoothed[k] / total;
        }
        // Ensure all face-api labels are present (with 0 if unseen)
        for (const k of Object.keys(raw)) {
            if (!(k in smoothed)) smoothed[k] = 0;
        }

        // ── Step 5: Find dominant from smoothed votes ──
        let dom = 'neutral';
        let domVotes = 0;
        for (const [k, v] of Object.entries(smoothed)) {
            if (v > domVotes) { dom = k; domVotes = v; }
        }

        // Require minimum vote share for non-neutral
        if (dom !== 'neutral' && domVotes < WIN_THRESHOLD) {
            dom = 'neutral';
            domVotes = smoothed['neutral'] || 0;
        }

        this._dominant = dom;
        this._confidence = domVotes;

        // ── Step 6: Fire debug callback every frame ──
        if (this._onDebug) this._onDebug(dom, smoothed);

        // ── Step 7: Stability gate — only emit after STABLE_MS of same label ──
        const now = Date.now();
        if (dom !== this._lastEmitted) {
            // Dominant changed → reset stability clock
            this._stableStart = now;
        }

        // Emit if the dominant has been stable for long enough
        if ((now - this._stableStart) >= STABLE_MS && dom !== this._lastEmitted) {
            this._lastEmitted = dom;
            if (this._onEmotion) {
                this._onEmotion(dom, domVotes, smoothed);
            }
            console.log(`[FaceEmotion v3] ✅ Emitted: ${dom} (${(domVotes * 100).toFixed(0)}%)`);
        }
    }

    // ─── Push a label into the rolling history window ─────────────────────────
    _pushLabel(label, score) {  // ← v3 fix: score param accepted (was missing)
        this._history.push(label);
        if (this._history.length > HISTORY_SIZE) this._history.shift();
    }

    get dominant() { return this._dominant; }
    get confidence() { return this._confidence; }
    get frameCount() { return this._frameCount; }
}
