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
    }

    async init(videoElement) {
        this.video = videoElement;
        
        // Load models from CDN
        const CDN = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';
        console.log('[Face] Loading models from:', CDN);
        
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(CDN),
            faceapi.nets.faceLandmark68TinyNet.loadFromUri(CDN),
            faceapi.nets.faceExpressionNet.loadFromUri(CDN)
        ]);
        
        console.log('[Face] Models loaded!');
        return true;
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        console.log('[Face] Starting detection loop');
        this.detect();
    }

    stop() {
        this.isRunning = false;
        console.log('[Face] Stopped');
    }

    async detect() {
        if (!this.isRunning || !this.video) return;

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

        // Next frame
        if (this.isRunning) {
            setTimeout(() => this.detect(), 200);
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
        const threshold = 15; // pixels
        
        const now = Date.now();
        
        if (diff > threshold) {
            const direction = leftDist > rightDist ? 'left' : 'right';
            
            if (!this.headTurnStart) {
                this.headTurnStart = now;
            } else if (now - this.headTurnStart > 800 && !this.headTurnFired) {
                console.log('[Face] Head turn:', direction);
                this.headTurnFired = true;
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