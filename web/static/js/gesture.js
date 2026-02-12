export class GestureHandler {
    constructor(avatar, onGesture) {
        this.avatar = avatar;
        this.onGesture = onGesture;
        this.hands = null;
        this.camera = null;
        this.videoElement = document.getElementById('user-camera');
        this.isActive = false;
        this.lastGesture = null;
        this.gestureCooldown = 0;
    }

    init() {
        this.hands = new Hands({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
            }
        });

        this.hands.setOptions({
            maxNumHands: 1,
            modelComplexity: 1,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        this.hands.onResults((results) => this.onResults(results));

        // Initialize Camera
        // Note: Camera starts when user clicks the camera button in main.js
    }

    start() {
        if (this.isActive) return;

        this.isActive = true;
        this.log("Gesture recognition started");
        this.processVideo();
    }

    stop() {
        if (!this.isActive) return;
        this.isActive = false;
        this.log("Gesture recognition stopped");
    }

    async processVideo() {
        if (!this.isActive) return;

        if (this.videoElement && this.videoElement.readyState >= 2) {
            try {
                await this.hands.send({ image: this.videoElement });
            } catch (error) {
                console.error("Hands send error:", error);
            }
        }

        if (this.isActive) {
            requestAnimationFrame(() => this.processVideo());
        }
    }

    log(msg) {
        console.log(msg);
        const debugDiv = document.getElementById('debug-console');
        if (debugDiv) {
            debugDiv.innerHTML += `<div>[Gesture] ${msg}</div>`;
            debugDiv.scrollTop = debugDiv.scrollHeight;
        }
    }

    onResults(results) {
        if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
            return;
        }

        const landmarks = results.multiHandLandmarks[0];
        const gesture = this.detectGesture(landmarks);

        if (gesture && gesture !== this.lastGesture) {
            const now = Date.now();
            if (now - this.gestureCooldown > 2000) { // 2 second cooldown to avoid spam
                console.log(`Detected Gesture: ${gesture}`);
                this.triggerAction(gesture);
                if (this.onGesture) this.onGesture(gesture);
                this.lastGesture = gesture;
                this.gestureCooldown = now;
            }
        } else if (!gesture) {
            this.lastGesture = null;
        }
    }

    detectGesture(landmarks) {
        // Improved gesture detection heuristics

        // Finger states (Open/Closed)
        const thumbOpen = this.isThumbOpen(landmarks);
        const indexOpen = this.isFingerOpen(landmarks, 8);
        const middleOpen = this.isFingerOpen(landmarks, 12);
        const ringOpen = this.isFingerOpen(landmarks, 16);
        const pinkyOpen = this.isFingerOpen(landmarks, 20);

        const openFingersCount = [indexOpen, middleOpen, ringOpen, pinkyOpen].filter(Boolean).length;

        // Debug
        // console.log(`T:${thumbOpen} I:${indexOpen} M:${middleOpen} R:${ringOpen} P:${pinkyOpen} (Count: ${openFingersCount})`);

        // 1. Victory (Index + Middle Open, others closed)
        if (indexOpen && middleOpen && !ringOpen && !pinkyOpen) {
            return 'victory';
        }

        // 2. Thumbs Up (Thumb open, others closed or curled)
        // Strict: Thumb open, Index/Middle/Ring/Pinky closed.
        if (thumbOpen && openFingersCount === 0) {
            // Check orientation: Thumb tip should be higher than IP (upright)
            if (landmarks[4].y < landmarks[3].y) {
                return 'thumbs_up';
            }
        }

        // 3. Open Palm / Wave (All fingers open)
        if (thumbOpen && openFingersCount === 4) {
            return 'open_palm';
        }

        // 4. Fist (All fingers closed)
        if (!thumbOpen && openFingersCount === 0) {
            return 'fist';
        }

        return null;
    }

    isFingerOpen(landmarks, tipIdx) {
        // Check if tip is higher (smaller y) than pip joint (tipIdx - 2)
        // This assumes hand is upright. For more robust detection, we need vector math.
        return landmarks[tipIdx].y < landmarks[tipIdx - 2].y;
    }

    isThumbOpen(landmarks) {
        // Check if thumb tip is to the side of the ip joint
        // Depending on hand (left/right), x comparison flips.
        // Simplified: Check distance between tip and pinky base (17) vs IP and pinky base.
        // If tip is further, it's open.

        const tip = landmarks[4];
        const ip = landmarks[3];
        const pinkyBase = landmarks[17];

        const distTip = Math.hypot(tip.x - pinkyBase.x, tip.y - pinkyBase.y);
        const distIp = Math.hypot(ip.x - pinkyBase.x, ip.y - pinkyBase.y);

        return distTip > distIp;
    }

    triggerAction(gesture) {
        switch (gesture) {
            case 'open_palm':
                this.avatar.playAnimation('clap', true);
                break;
            case 'victory':
                this.avatar.playAnimation('dance', true);
                break;
            case 'thumbs_up':
                this.avatar.playAnimation('happy', true);
                break;
            case 'fist':
                // Maybe stop or idle?
                this.avatar.playAnimation('idle');
                break;
        }
    }
}
