# Face Emotion Detection & Attention Tracking - Implementation Guide

## Overview
This system provides advanced face emotion detection with attention tracking specifically designed for interview mode. It uses multiple best-in-class models and provides real-time feedback to users and the interview system.

## Components

### 1. Backend - Face Emotion Detection (`src/perception/face_emotion.py`)
- **Model**: DeepFace (high-accuracy, 7 emotions)
- **Gaze Detection**: MediaPipe FaceMesh (detects looking away)
- **Optimization**: Processes every 1 second for interview mode (saves CPU)
- **Attention Tracking**: Automatically tracks consecutive inattention events

**Key Classes:**
- `AttentionTracker`: Tracks user attention with configurable warning thresholds
- `ImprovedFaceEmotionDetector`: Main detector with emotion + gaze detection

**Usage:**
```python
from src.perception.face_emotion import get_detector, detect_from_frame
import cv2

detector = get_detector()
frame = cv2.imread('face_image.jpg')
result = detector.detect_face_emotion(frame)

# Result contains:
# {
#     'emotion': 'happy',
#     'confidence': 0.95,
#     'is_face_detected': True,
#     'gaze_direction': 'center',  # or 'left', 'right', 'up', 'down'
#     'attention_status': 'ATTENTIVE',  # or 'WARNING_1', 'STOP_INTERVIEW'
#     'attention_score': 85.5
# }
```

### 2. Backend - Interview Session Manager (`src/core/interview_manager.py`)
- **Session Tracking**: Manages per-user interview sessions
- **Warning System**: Issues warnings after repeated inattention (default: 3 warnings = stop)
- **Metrics**: Tracks questions asked, duration, attention score

**Key Classes:**
- `InterviewSession`: Single interview session
- `InterviewSessionManager`: Manages all active sessions

**Usage:**
```python
from src.core.interview_manager import get_or_create_session

session = get_or_create_session(
    session_id='interview-123',
    level='mid',
    company='Google',
    domain='SWE'
)
session.start()
session.record_question("What is a hash table?")
```

### 3. Backend - API Endpoints (in `server.py`)

#### POST `/api/interview/start`
Start a new interview session with attention tracking.
```json
{
    "session_id": "unique-session-id",
    "level": "mid",           // junior, mid, senior
    "company": "Google",
    "domain": "Software Engineer"
}
```

#### POST `/api/interview/question`
Record a question being asked.
```json
{
    "session_id": "unique-session-id",
    "question": "What is your approach to system design?"
}
```

#### POST `/api/interview/attention`
Check & update user attention (called by frontend periodically).
```json
{
    "session_id": "unique-session-id",
    "is_attentive": true,
    "gaze_direction": "center",
    "face_detected": true,
    "emotion": "neutral"
}
```

**Response:**
```json
{
    "status": "attentive",           // attentive, warning, stop_interview
    "warning_count": 1,
    "attention_score": 85.0,
    "action": null,                  // null, "WARNING_1", "WARNING_2", "STOP_INTERVIEW"
    "message": "Please pay attention to the interview."
}
```

#### GET `/api/interview/status/{session_id}`
Get current interview status.

#### POST `/api/interview/end`
End interview and get performance report.

### 4. Frontend - Interview Attention Tracker (`web/static/js/interview-attention-tracker.js`)
- **Periodic Updates**: Sends attention data to backend every 2 seconds
- **Warning Handling**: Shows notifications and triggers AURA feedback
- **Interview Stopping**: Handles backend stop-interview command

**Usage:**
```javascript
// Start attention tracking when interview begins
initInterviewAttentionTracking('interview-session-id');

// Stop when interview ends
stopInterviewAttentionTracking();

// Get current status
const status = window.interviewAttentionTracker.getStatus();
```

## How It Works

### Interview Flow

1. **User Starts Interview**
   - Backend creates session with warning threshold (default: 3)
   - Frontend initializes attention tracker
   - Face detection starts (optimized to ~1 frame/second)

2. **Question Asked**
   - Backend records the question
   - Attention tracker resets for new question
   - Frontend monitors user's face & gaze

3. **Inattention Detected**
   - Face not detected OR user looking away
   - Attention tracker records event
   - After 5+ seconds → Issue warning #1
   - If repeated 3+ times → STOP INTERVIEW

4. **System Responses**
   - Warning 1-2: AURA gives feedback (e.g., "Eyes on me please")
   - Warning 3: Interview forcibly stopped
   - User shown message: "Interview stopped due to inattention"

### Emotion Detection

**Models Used:**
- **DeepFace**: 7 emotions (angry, disgust, fear, happy, neutral, sad, surprise)
- **MediaPipe**: Gaze direction & head pose
- Maps to AURA vocabulary: neutral, happy, sad, angry, surprised, fearful, disgusted

**Confidence Thresholds:**
- High confidence (>0.7): Immediate reaction
- Medium (0.5-0.7): Noted but not acted upon
- Low (<0.5): Neutral

## Installation

### Requirements
```bash
pip install deepface opencv-python mediapipe
# plus existing requirements
```

### Dependencies
- **deepface** - Face emotion detection
- **mediapipe** - Gaze & landmark detection
- **opencv-python** - Image processing
- **tensorflow** - (required by deepface)

### GPU Acceleration (Optional but Recommended)
For faster processing with NVIDIA GPU:
```bash
pip install tensorflow[and-cuda]
```

## Configuration

### Adjust Warning Threshold
```python
session = get_or_create_session(
    session_id='...',
    warning_threshold=4  # Stop after 4 warnings instead of 3
)
```

### Adjust Frame Processing Rate
In `face_emotion.py`:
```python
self.frame_skip_interval = 1.0  # Process every 1 second (default)
```

### Adjust Inattention Duration Before Warning
In `interview_manager.py`:
```python
session = InterviewSession(..., lookaway_duration_ms=5000)  # 5 seconds
```

## Performance Optimization

### CPU Usage
- **Default**: ~1 frame/second (optimized for interview)
- **Slow Mode**: Can reduce to 0.5 fps if needed
- **GPU Mode**: 3-5x faster with CUDA

### Memory Usage
- DeepFace model: ~150MB on first load
- MediaPipe models: ~50MB combined
- Cached after first use

### Recommended Hardware
- **Minimum**: CPU-only (acceptable performance)
- **Recommended**: NVIDIA GPU with 2GB VRAM
- **Optimal**: Modern GPU with 4GB+ VRAM

## Troubleshooting

### Face Not Detected
- Check lighting (ensure face is well-lit)
- Adjust camera angle (face should be ~30cm from camera)
- Verify webcam is working: `cv2.VideoCapture(0)`

### High CPU Usage
- Reduce frame processing rate
- Enable slow mode: `detector.setSlowMode(True)`
- Use GPU acceleration

### Warnings Not Triggering
- Check `lookaway_duration_ms` (default 5s)
- Verify `gaze_direction` is being detected (check browser console)
- Confirm backend attention endpoint is responding

### DeepFace Model Issues
- First run downloads ~150MB model
- Requires internet connection for download
- Check disk space (at least 500MB free)

## Testing

### Test Face Emotion Detection
```bash
curl -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "text": "test",
    "face_emotion": "happy",
    "mode": "interview"
  }'
```

### Test Interview Session
```bash
# Start interview
curl -X POST http://localhost:8000/api/interview/start \
  -H "Content-Type: application/json" \
  -d '{"session_id": "test-123", "level": "mid", "company": "Google"}'

# Check attention
curl -X POST http://localhost:8000/api/interview/attention \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "test-123",
    "is_attentive": true,
    "gaze_direction": "center",
    "face_detected": true
  }'

# Get status
curl http://localhost:8000/api/interview/status/test-123
```

## Advanced Usage

### Custom Emotion Handling
```python
detector = get_detector()
detector.attention_tracker.on_question_asked()  # Reset tracking
status = detector.get_attention_status()  # Get current state
```

### Integrate with External Systems
```python
# Backend can send attention updates to external dashboard
result = detect_from_frame(cv2_frame)
if result['attention_status'] == 'STOP_INTERVIEW':
    # Trigger external notification system
    notify_admin(f"Interview stopped: {result}")
```

## Future Improvements

- [ ] Multi-face detection (if multiple participants)
- [ ] Emotion trend analysis (detect stress over time)
- [ ] Pose estimation (body language analysis)
- [ ] Voice tone integration (correlate with facial emotion)
- [ ] Machine learning model fine-tuning for different demographics
- [ ] WebRTC integration for live remote interviews

## Support

For issues or questions:
1. Check console logs: `[FaceEmotion]` and `[AttentionTracker]` prefixes
2. Enable debug mode in `face_emotion.js`
3. Review model loading errors in backend startup
4. Test with different lighting/backgrounds
