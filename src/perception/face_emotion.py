"""
Advanced Face Emotion Detection Module v2
- Uses DeepFace for high-accuracy face emotion detection
- Processes every second (1fps) for interview optimization
- Detects gaze direction (looking away = inattention)
- Tracks attention score and warning counts
- Integrates with interview mode
"""

import os
import cv2
import numpy as np
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timedelta

# ML Models
try:
    from deepface import DeepFace
    DEEPFACE_AVAILABLE = True
except ImportError:
    DEEPFACE_AVAILABLE = False

try:
    import mediapipe as mp
    MEDIAPIPE_AVAILABLE = True
except ImportError:
    MEDIAPIPE_AVAILABLE = False

try:
    from transformers import pipeline
    TRANSFORMERS_AVAILABLE = True
except ImportError:
    TRANSFORMERS_AVAILABLE = False


class AttentionTracker:
    """
    Tracks user attention during interview.
    Warning levels: 0 = attentive, 1-2 = warnings, 3+ = stop interview
    """
    def __init__(self, warning_threshold: int = 3, lookaway_duration_ms: int = 5000):
        self.warning_count = 0
        self.warning_threshold = warning_threshold  # 3 warnings = stop
        self.lookaway_duration_ms = lookaway_duration_ms
        self.is_looking_away = False
        self.lookaway_start = None
        self.last_lookaway_warning = None
        self.attention_score = 100.0  # 0-100 scale

    def record_inattention(self) -> Optional[str]:
        """
        Called when user is looking away. Returns warning message if threshold exceeded.
        Returns "STOP_INTERVIEW" if user should be kicked out.
        """
        now = datetime.now()

        if not self.is_looking_away:
            self.is_looking_away = True
            self.lookaway_start = now

        # Check if lookaway duration exceeded
        lookaway_elapsed = (now - self.lookaway_start).total_seconds() * 1000
        if lookaway_elapsed > self.lookaway_duration_ms:
            # Time to issue warning
            if self.last_lookaway_warning is None or \
               (now - self.last_lookaway_warning).total_seconds() > 10:  # Rate limit: 1 warning per 10s
                self.warning_count += 1
                self.attention_score = max(0, self.attention_score - 15)
                self.last_lookaway_warning = now
                
                print(f"[AttentionTracker] ⚠️ Warning #{self.warning_count}: User not paying attention!")

                if self.warning_count >= self.warning_threshold:
                    return "STOP_INTERVIEW"
                else:
                    return f"WARNING_{self.warning_count}"

        return None

    def record_attention(self):
        """Called when user is looking at screen."""
        if self.is_looking_away:
            self.is_looking_away = False
            self.lookaway_start = None
            self.attention_score = min(100, self.attention_score + 5)

    def reset(self):
        """Reset attention metrics (for new questions)."""
        self.is_looking_away = False
        self.lookaway_start = None
        self.attention_score = 100.0

    def get_status(self) -> Dict:
        """Return current attention status."""
        return {
            "attention_score": self.attention_score,
            "warning_count": self.warning_count,
            "is_looking_away": self.is_looking_away,
            "should_stop": self.warning_count >= self.warning_threshold
        }


class ImprovedFaceEmotionDetector:
    """
    High-accuracy face emotion detection with attention tracking.
    Optimized for interview mode: processes ~1 frame per second.
    """
    
    # Valid emotions (AURA standard vocabulary)
    EMOTIONS = ['neutral', 'happy', 'sad', 'angry', 'surprised', 'fearful', 'disgusted']
    
    def __init__(self, use_mediapipe: bool = True, use_deepface: bool = True):
        self.use_mediapipe = use_mediapipe and MEDIAPIPE_AVAILABLE
        self.use_deepface = use_deepface and DEEPFACE_AVAILABLE
        
        self.face_detector = None
        self.gaze_detector = None
        self.emotion_model = None
        
        self.last_detection_time = 0
        self.frame_skip_interval = 1.0  # Process every 1 second
        
        self.attention_tracker = AttentionTracker()
        self.last_emotion = 'neutral'
        self.emotion_confidence = 0.0
        
        self._init_models()
    
    def _init_models(self):
        """Initialize all detection models."""
        print("[FaceEmotion] Initializing face emotion models...")
        
        # Face Detection with MediaPipe (faster)
        if self.use_mediapipe:
            try:
                self.face_detector = mp.solutions.face_detection.FaceDetection(
                    model_selection=0,  # 0 = short range, 1 = full range
                    min_detection_confidence=0.5
                )
                print("[FaceEmotion] ✓ MediaPipe face detector loaded")
            except Exception as e:
                print(f"[FaceEmotion] Warning: MediaPipe face detector failed: {e}")
                self.face_detector = None
        
        # Gaze Detection (head pose)
        if self.use_mediapipe:
            try:
                self.gaze_detector = mp.solutions.face_mesh.FaceMesh(
                    static_image_mode=False,
                    max_num_faces=1,
                    min_detection_confidence=0.5,
                    min_tracking_confidence=0.5
                )
                print("[FaceEmotion] ✓ MediaPipe face mesh (gaze) detector loaded")
            except Exception as e:
                print(f"[FaceEmotion] Warning: MediaPipe gaze detector failed: {e}")
                self.gaze_detector = None
        
        # Emotion Detection with DeepFace
        if self.use_deepface:
            try:
                # Validate models are available
                print("[FaceEmotion] Loading DeepFace emotion model...")
                self.emotion_model = "deepface"  # lazy load on first use
                print("[FaceEmotion] ✓ DeepFace emotion model ready (lazy load)")
            except Exception as e:
                print(f"[FaceEmotion] Warning: DeepFace failed: {e}")
                self.emotion_model = None
    
    def detect_face_emotion(self, frame: np.ndarray) -> Dict:
        """
        Detect face emotion from frame.
        Optimized: only runs every `frame_skip_interval` seconds.
        
        Returns: {
            'emotion': str,           # neutral, happy, sad, angry, etc.
            'confidence': float,      # 0-1
            'is_face_detected': bool,
            'gaze_direction': str,    # 'center', 'left', 'right', 'up', 'down'
            'attention_status': str,  # 'ATTENTIVE', 'WARNING_N', 'STOP_INTERVIEW'
            'attention_score': float  # 0-100
        }
        """
        now = datetime.now().timestamp()
        
        # Skip frame if too soon
        if (now - self.last_detection_time) < self.frame_skip_interval:
            return {
                'emotion': self.last_emotion,
                'confidence': self.emotion_confidence,
                'is_face_detected': False,
                'gaze_direction': 'unknown',
                'attention_status': 'SKIPPED',
                'attention_score': self.attention_tracker.attention_score
            }
        
        self.last_detection_time = now
        result = {
            'emotion': 'neutral',
            'confidence': 0.0,
            'is_face_detected': False,
            'gaze_direction': 'center',
            'attention_status': 'UNKNOWN',
            'attention_score': self.attention_tracker.attention_score
        }
        
        try:
            # Step 1: Detect face using MediaPipe FaceDetection
            if self.face_detector:
                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                results = self.face_detector.process(rgb_frame)
                
                if not results.detections:
                    # No face detected
                    self.attention_tracker.record_inattention()
                    status = self.attention_tracker.record_inattention()
                    result['attention_status'] = status or 'NO_FACE'
                    return result
                
                result['is_face_detected'] = True
                self.attention_tracker.record_attention()
            
            # Step 2: Detect gaze direction using MediaPipe FaceMesh
            gaze_dir = 'center'
            if self.gaze_detector:
                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                mesh_results = self.gaze_detector.process(rgb_frame)
                
                if mesh_results.multi_face_landmarks:
                    gaze_dir = self._estimate_gaze_direction(mesh_results.multi_face_landmarks[0])
                    
                    # If looking away significantly
                    if gaze_dir in ['left', 'right', 'up', 'down']:
                        status = self.attention_tracker.record_inattention()
                        result['attention_status'] = status or 'LOOKING_AWAY'
                    else:
                        self.attention_tracker.record_attention()
                        result['attention_status'] = 'ATTENTIVE'
            
            result['gaze_direction'] = gaze_dir
            
            # Step 3: Detect emotion using DeepFace
            if self.use_deepface and self.emotion_model:
                try:
                    emotion_result = DeepFace.analyze(
                        frame,
                        actions=['emotion'],
                        enforce_detection=False,
                        silent=True
                    )
                    
                    if emotion_result:
                        # DeepFace returns list of results (one per face)
                        face_data = emotion_result[0] if isinstance(emotion_result, list) else emotion_result
                        emotions = face_data.get('emotion', {})
                        
                        if emotions:
                            # Get dominant emotion
                            dominant = max(emotions.items(), key=lambda x: x[1])
                            emotion_name = dominant[0]  # 'angry', 'disgust', 'fear', 'happy', 'neutral', 'sad', 'surprise'
                            confidence = dominant[1] / 100.0  # Convert to 0-1
                            
                            # Map to AURA emotion vocabulary
                            emotion_map = {
                                'angry': 'angry',
                                'disgust': 'disgusted',
                                'fear': 'fearful',
                                'happy': 'happy',
                                'neutral': 'neutral',
                                'sad': 'sad',
                                'surprise': 'surprised'
                            }
                            
                            mapped_emotion = emotion_map.get(emotion_name, 'neutral')
                            
                            result['emotion'] = mapped_emotion
                            result['confidence'] = confidence
                            self.last_emotion = mapped_emotion
                            self.emotion_confidence = confidence
                            
                            print(f"[FaceEmotion] Detected: {mapped_emotion} (conf: {confidence:.2f}), Gaze: {gaze_dir}")
                            
                except Exception as e:
                    print(f"[FaceEmotion] DeepFace analysis error: {e}")
            
            # Ensure attention status is set
            if result['attention_status'] == 'UNKNOWN':
                result['attention_status'] = 'ATTENTIVE' if gaze_dir == 'center' else 'LOOKING_AWAY'
            
            result['attention_score'] = self.attention_tracker.attention_score
            
        except Exception as e:
            print(f"[FaceEmotion] Error during detection: {e}")
        
        return result
    
    @staticmethod
    def _estimate_gaze_direction(landmarks) -> str:
        """
        Estimate gaze direction from face landmarks.
        Returns: 'center', 'left', 'right', 'up', 'down'
        """
        try:
            # Key landmarks for gaze
            LEFT_EYE_RIGHT = 33    # Right corner of left eye
            RIGHT_EYE_LEFT = 263   # Left corner of right eye
            NOSE_TIP = 1
            CHIN = 152
            
            # Get coordinates
            nose = landmarks.landmark[NOSE_TIP]
            chin = landmarks.landmark[CHIN]
            left_eye = landmarks.landmark[LEFT_EYE_RIGHT]
            right_eye = landmarks.landmark[RIGHT_EYE_LEFT]
            
            # Calculate horizontal gaze
            left_to_nose = abs(left_eye.x - nose.x)
            right_to_nose = abs(right_eye.x - nose.x)
            
            if abs(left_to_nose - right_to_nose) > 0.08:  # Threshold
                if left_to_nose > right_to_nose:
                    return 'right'  # Looking right
                else:
                    return 'left'   # Looking left
            
            # Calculate vertical gaze
            if nose.y < chin.y - 0.1:
                return 'up'
            elif nose.y > chin.y + 0.1:
                return 'down'
            
            return 'center'
        except Exception as e:
            print(f"[FaceEmotion] Gaze estimation error: {e}")
            return 'center'
    
    def get_attention_status(self) -> Dict:
        """Get current attention tracking status."""
        return self.attention_tracker.get_status()
    
    def on_question_asked(self):
        """Call this when a new question is asked to reset attention tracking."""
        self.attention_tracker.reset()
        print("[FaceEmotion] Attention tracker reset for new question")
    
    def reset_warnings(self):
        """Reset warning count (for new interview/session)."""
        self.attention_tracker.warning_count = 0
        print("[FaceEmotion] Warnings reset")


# Global detector instance
_detector = None


def get_detector() -> ImprovedFaceEmotionDetector:
    """Get or create face emotion detector instance."""
    global _detector
    if _detector is None:
        _detector = ImprovedFaceEmotionDetector()
    return _detector


def detect_from_frame(frame: np.ndarray) -> Dict:
    """Detect face emotion and attention from frame."""
    detector = get_detector()
    return detector.detect_face_emotion(frame)


def detect_from_file(file_path: str) -> Dict:
    """Detect face emotion from image file."""
    try:
        frame = cv2.imread(file_path)
        if frame is None:
            return {'error': 'Could not load image', 'emotion': 'neutral'}
        return detect_from_frame(frame)
    except Exception as e:
        return {'error': str(e), 'emotion': 'neutral'}
