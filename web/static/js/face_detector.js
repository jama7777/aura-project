/**
 * face_detector.js - Simple face detection with head turn tracking
 * Uses face-api.js from CDN
 */

class SimpleFaceDetector {
    constructor() {
        this.video = null;
        this.isRunning = false;
        this.onFaceDetected = null;
        this.onHeadTurn = null;
        this.onNoFace = null;
        
        // Head turn tracking
        this.lastFaceTime = Date.now();
        this.headTurnStart = 0;
        this.headTurnFired = false;
        this.headTurnCooldown = 0; // cooldown timer
        this.headTurnThreshold = 12; // pixels
        this.headTurnDelay = 400; // ms - faster response
    }

    async init(videoElement) {
        this.video = videoElement;
        
        // Load models from CDN - try different CDN if one fails
        const cdns = [
            'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model',
            'https://unpkg.com/@vladmandic/face-api/model'
        ];
        
        let loaded = false;
        for (const cdn of cdns) {
            try {
                console.log('[Face] Trying CDN:', cdn);
                await Promise.all([
                    faceapi.nets.tinyFaceDetector.loadFromUri(cdn),
                    faceapi.nets.faceLandmark68TinyNet.loadFromUri(cdn),
                    faceapi.nets.faceExpressionNet.loadFromUri(cdn)
                ]);
                console.log('[Face] SUCCESS - Models loaded from:', cdn);
                loaded = true;
                break;
            } catch (e) {
                console.log('[Face] Failed:', cdn, e.message);
            }
        }
        
        if (!loaded) {
            throw new Error('Could not load face-api models from any CDN');
        }
        
        return true;
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        console.log('[Face] Starting detection loop');
        this.detect();
    }

    scheduleNext() {
        if (this.isRunning) {
            setTimeout(() => this.detect(), 200);
        }
    }

    stop() {
        this.isRunning = false;
        console.log('[Face] Stopped');
    }

    async detect() {
        if (!this.isRunning || !this.video) {
            console.log('[Face] Not running or no video');
            return;
        }

        // Check if video is ready
        if (!this.video.videoWidth || !this.video.videoHeight) {
            console.log('[Face] Video not ready:', this.video.videoWidth, this.video.videoHeight);
            this.scheduleNext();
            return;
        }

        try {
            // Small video for performance
            const displaySize = { width: 320, height: 240 };
            faceapi.matchDimensions(this.video, displaySize);

            const detection = await faceapi
                .detectSingleFace(this.video, new faceapi.TinyFaceDetectorOptions())
                .withFaceLandmarks()
                .withFaceExpressions();

            if (detection) {
                // Face found!
                this.lastFaceTime = Date.now();
                
                // Get expressions
                const expressions = detection.expressions;
                const dominant = Object.keys(expressions).reduce((a, b) => 
                    expressions[a] > expressions[b] ? a : b
                );
                
                console.log('[Face] Detected:', dominant, expressions[dominant].toFixed(2));
                
                if (this.onFaceDetected) {
                    this.onFaceDetected(dominant, expressions[dominant], expressions);
                }

                // Head turn detection
                if (detection.landmarks) {
                    this.checkHeadTurn(detection.landmarks);
                }
            } else {
                // No face
                console.log('[Face] No face detected');
                if (this.onNoFace && Date.now() - this.lastFaceTime > 2000) {
                    this.onNoFace();
                }
            }
        } catch (e) {
            console.error('[Face] Error:', e);
        }

        // Next frame - faster (100ms)
        if (this.isRunning) {
            setTimeout(() => this.detect(), 100);
        }
    }

    checkHeadTurn(landmarks) {
        const pts = landmarks.positions;
        if (!pts || pts.length < 48) return;

        // Left eye center (36-41)
        let lx = 0, ly = 0;
        for (let i = 36; i <= 41; i++) {
            lx += pts[i].x;
            ly += pts[i].y;
        }
        lx /= 6;
        ly /= 6;

        // Right eye center (42-47)
        let rx = 0, ry = 0;
        for (let i = 42; i <= 47; i++) {
            rx += pts[i].x;
            ry += pts[i].y;
        }
        rx /= 6;
        ry /= 6;

        // Nose tip (30)
        const nx = pts[30].x;
        const ny = pts[30].y;

        // Calculate eye distances from nose
        const leftDist = Math.sqrt((nx - lx) ** 2 + (ny - ly) ** 2);
        const rightDist = Math.sqrt((nx - rx) ** 2 + (ny - ry) ** 2);
        
        // Asymmetry - if one eye is much closer, head is turned
        const diff = Math.abs(leftDist - rightDist);
        const threshold = this.headTurnThreshold;
        const delay = this.headTurnDelay;
        const cooldownTime = 3000; // 3 seconds cooldown
        
        const now = Date.now();
        
        // Check cooldown
        if (now < this.headTurnCooldown) return;
        
        if (diff > threshold) {
            const direction = leftDist > rightDist ? 'left' : 'right';
            
            if (!this.headTurnStart) {
                this.headTurnStart = now;
            } else if (now - this.headTurnStart > delay && !this.headTurnFired) {
                console.log('[Face] Head turn:', direction, 'diff:', diff);
                this.headTurnFired = true;
                this.headTurnCooldown = now + cooldownTime;
                if (this.onHeadTurn) this.onHeadTurn(direction);
            }
        } else {
            this.headTurnStart = 0;
            this.headTurnFired = false;
        }
    }
}

// Global instance
window.simpleFaceDetector = new SimpleFaceDetector();