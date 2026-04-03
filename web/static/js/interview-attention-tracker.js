/**
 * Interview Attention Tracker
 * Communicates face attention metrics to the backend
 * Handles warning system and interview stopping
 */

class InterviewAttentionTracker {
    constructor(sessionId, faceDetectorInstance) {
        this.sessionId = sessionId;
        this.faceDetector = faceDetectorInstance;
        this.isActive = false;
        this.warningCount = 0;
        this.attentionScore = 100;
        this.lastAttentionUpdate = Date.now();
        this.updateInterval = 2000;  // Check attention every 2 seconds
        this.attentionCheckTimer = null;
        
        // Thresholds
        this.consecutiveInattentionFrames = 0;
        this.inattentionThreshold = 3;  // 3 consecutive frames = warning
    }

    /**
     * Start tracking attention for this interview session.
     * Call this when interview starts.
     */
    start() {
        if (this.isActive) return;
        
        this.isActive = true;
        console.log(`[AttentionTracker] Started for session: ${this.sessionId}`);
        
        // Start periodic attention checks
        this.attentionCheckTimer = setInterval(() => this._checkAttention(), this.updateInterval);
    }

    /**
     * Stop attention tracking.
     * Call this when interview ends.
     */
    stop() {
        if (this.attentionCheckTimer) {
            clearInterval(this.attentionCheckTimer);
            this.attentionCheckTimer = null;
        }
        this.isActive = false;
        console.log(`[AttentionTracker] Stopped for session: ${this.sessionId}`);
    }

    /**
     * Internal: Check current attention and send to backend.
     */
    async _checkAttention() {
        if (!this.faceDetector || !this.faceDetector.ready) return;

        try {
            // Get current detection results
            const status = this.faceDetector.get_status ? 
                this.faceDetector.get_status() : 
                {
                    is_face_detected: true,
                    gaze_direction: 'center',
                    emotion: this.faceDetector._lastEmitted || 'neutral'
                };

            const isAttentive = status.is_face_detected && 
                              status.gaze_direction === 'center';

            // Track consecutive inattention frames
            if (!isAttentive) {
                this.consecutiveInattentionFrames++;
            } else {
                this.consecutiveInattentionFrames = 0;
            }

            // Send to backend
            const response = await fetch('/api/interview/attention', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: this.sessionId,
                    is_attentive: isAttentive,
                    gaze_direction: status.gaze_direction || 'unknown',
                    face_detected: status.is_face_detected || false,
                    emotion: status.emotion || 'neutral'
                })
            });

            if (!response.ok) {
                console.warn(`[AttentionTracker] Backend error: ${response.status}`);
                return;
            }

            const result = await response.json();
            this._handleAttentionResult(result);

        } catch (error) {
            console.warn(`[AttentionTracker] Error checking attention:`, error);
        }
    }

    /**
     * Process result from backend attention check.
     * Handles warnings and interview stopping.
     */
    _handleAttentionResult(result) {
        this.warningCount = result.warning_count || 0;
        this.attentionScore = result.attention_score || 100;

        console.log(`[AttentionTracker] Status: ${result.status}, Warnings: ${this.warningCount}, Score: ${this.attentionScore}`);

        // Update UI
        this._updateAttentionUI();

        // Handle different actions
        if (result.status === 'stop_interview') {
            this._handleInterviewStop(result);
        } else if (result.action && result.action.startsWith('WARNING')) {
            this._handleWarning(result);
        }
    }

    /**
     * Handle warning from backend.
     */
    _handleWarning(result) {
        console.warn(`[AttentionTracker] ⚠️ ${result.message}`);
        
        // Show warning to user
        this._showWarningNotification(result.message, result.action);

        // Alert AURA to comment on it
        if (window.triggerAttentionWarning) {
            window.triggerAttentionWarning();
        }
    }

    /**
     * Handle interview stopping due to inattention.
     */
    _handleInterviewStop(result) {
        console.error(`[AttentionTracker] ❌ INTERVIEW STOPPED: ${result.message}`);
        
        // Show alert
        this._showAlertNotification(result.message);

        // Trigger interview stop in main app
        if (window.stopInterview) {
            window.stopInterview("inattention");
        } else {
            alert(`Interview Stopped: ${result.message}`);
        }
    }

    /**
     * Update UI elements showing attention status.
     */
    _updateAttentionUI() {
        // Update attention meter if exists
        const meter = document.getElementById('attention-meter');
        if (meter) {
            meter.style.width = this.attentionScore + '%';
            if (this.attentionScore > 70) {
                meter.style.backgroundColor = '#00ff88';
            } else if (this.attentionScore > 40) {
                meter.style.backgroundColor = '#f1c40f';
            } else {
                meter.style.backgroundColor = '#e74c3c';
            }
        }

        // Update warning counter
        const warningBadge = document.getElementById('warning-count');
        if (warningBadge) {
            warningBadge.textContent = this.warningCount;
            if (this.warningCount > 0) {
                warningBadge.style.visibility = 'visible';
            }
        }
    }

    /**
     * Show warning notification to user.
     */
    _showWarningNotification(message, action) {
        const notification = document.createElement('div');
        notification.className = 'attention-warning';
        notification.style.cssText = `
            position: fixed;
            top: 100px;
            right: 20px;
            background: #ff6b6b;
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            font-weight: bold;
            z-index: 9999;
            animation: slideIn 0.3s ease-out;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        `;
        notification.innerHTML = `⚠️ ${message}`;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => notification.remove(), 300);
        }, 4000);
    }

    /**
     * Show alert notification (interview stopped).
     */
    _showAlertNotification(message) {
        const alert = document.createElement('div');
        alert.className = 'attention-alert';
        alert.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #e74c3c;
            color: white;
            padding: 30px 40px;
            border-radius: 12px;
            font-weight: bold;
            font-size: 18px;
            z-index: 10000;
            text-align: center;
            max-width: 500px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.4);
            border: 3px solid #c0392b;
        `;
        alert.innerHTML = `❌ ${message}`;
        document.body.appendChild(alert);

        setTimeout(() => alert.remove(), 5000);
    }

    /**
     * Reset attention counter for a new question.
     */
    onNewQuestion() {
        this.consecutiveInattentionFrames = 0;
        if (this.faceDetector && this.faceDetector.resetAttention) {
            this.faceDetector.resetAttention();
        }
    }

    /**
     * Get current status.
     */
    getStatus() {
        return {
            session_id: this.sessionId,
            is_active: this.isActive,
            warning_count: this.warningCount,
            attention_score: this.attentionScore,
            consecutive_inattention_frames: this.consecutiveInattentionFrames
        };
    }
}

// Global instance
window.interviewAttentionTracker = null;

/**
 * Initialize interview attention tracking.
 * Call this when starting an interview.
 */
function initInterviewAttentionTracking(sessionId) {
    if (!window.faceDetector) {
        console.warn('[AttentionTracker] Face detector not available');
        return null;
    }

    window.interviewAttentionTracker = new InterviewAttentionTracker(
        sessionId,
        window.faceDetector
    );
    
    window.interviewAttentionTracker.start();
    console.log('[AttentionTracker] Interview attention tracking initialized');
    
    return window.interviewAttentionTracker;
}

/**
 * Stop interview attention tracking.
 */
function stopInterviewAttentionTracking() {
    if (window.interviewAttentionTracker) {
        window.interviewAttentionTracker.stop();
        window.interviewAttentionTracker = null;
    }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { InterviewAttentionTracker, initInterviewAttentionTracking, stopInterviewAttentionTracking };
}
