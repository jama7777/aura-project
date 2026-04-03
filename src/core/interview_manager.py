"""
Interview Session Manager
Tracks interview state, attention, and determines when to stop interview.
"""

from typing import Dict, Optional, List
from datetime import datetime, timedelta
from enum import Enum


class InterviewState(Enum):
    """Interview states throughout the session."""
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    PAUSED = "paused"
    STOPPED_INATTENTION = "stopped_inattention"
    STOPPED_USER = "stopped_user"
    COMPLETED = "completed"


class InterviewSession:
    """
    Manages a single interview session with attention tracking.
    """
    
    def __init__(self, session_id: str, level: str = "mid", company: str = "General", 
                 domain: str = "SWE", warning_threshold: int = 3):
        self.session_id = session_id
        self.level = level
        self.company = company
        self.domain = domain
        self.warning_threshold = warning_threshold
        
        # Interview state
        self.state = InterviewState.NOT_STARTED
        self.start_time: Optional[datetime] = None
        self.end_time: Optional[datetime] = None
        
        # Attention tracking
        self.warning_count = 0
        self.inattention_events: List[Dict] = []  # Track each inattention event
        self.attention_scores: List[float] = []    # Rolling attention scores
        self.current_attention_score = 100.0
        
        # Question tracking
        self.current_question: Optional[str] = None
        self.question_count = 0
        self.questions_asked: List[str] = []
        
        # Metadata
        self.metadata = {
            "user_agent": None,
            "ip_address": None,
            "interview_type": "technical"
        }
    
    def start(self):
        """Start the interview session."""
        self.state = InterviewState.IN_PROGRESS
        self.start_time = datetime.now()
        print(f"[Interview {self.session_id}] Started - {self.level} @ {self.company}")
    
    def record_question(self, question: str):
        """Record a new question being asked."""
        self.current_question = question
        self.question_count += 1
        self.questions_asked.append(question)
        print(f"[Interview {self.session_id}] Q{self.question_count}: {question[:50]}...")
    
    def record_inattention(self) -> Optional[str]:
        """
        Record an inattention event.
        Returns action to take: None (ongoing), "WARN" (issue warning), "STOP" (stop interview)
        """
        event = {
            "timestamp": datetime.now(),
            "question_num": self.question_count,
            "warning_num": self.warning_count + 1
        }
        self.inattention_events.append(event)
        
        # Only increment warning on new inattention episode
        if len(self.inattention_events) == 1 or \
           (datetime.now() - self.inattention_events[-2]["timestamp"]).total_seconds() > 15:
            self.warning_count += 1
            self.current_attention_score = max(0, self.current_attention_score - 20)
            
            print(f"[Interview {self.session_id}] ⚠️  WARNING: User not paying attention (#{self.warning_count})")
            
            if self.warning_count >= self.warning_threshold:
                self.stop(reason="inattention")
                return "STOP_INTERVIEW"
            else:
                return f"WARNING_{self.warning_count}"
        
        # Update attention score (slightly less aggressive)
        self.current_attention_score = max(0, self.current_attention_score - 2)
        return None
    
    def record_attention(self):
        """Record user is paying attention."""
        self.current_attention_score = min(100, self.current_attention_score + 1)
    
    def pause(self):
        """Pause interview (user paused)."""
        if self.state == InterviewState.IN_PROGRESS:
            self.state = InterviewState.PAUSED
            print(f"[Interview {self.session_id}] Paused by user")
    
    def resume(self):
        """Resume interview."""
        if self.state == InterviewState.PAUSED:
            self.state = InterviewState.IN_PROGRESS
            print(f"[Interview {self.session_id}] Resumed")
    
    def stop(self, reason: str = "user"):
        """Stop the interview."""
        self.end_time = datetime.now()
        
        if reason == "inattention":
            self.state = InterviewState.STOPPED_INATTENTION
            print(f"[Interview {self.session_id}] ❌ STOPPED: User not paying attention (Warnings: {self.warning_count})")
        elif reason == "completed":
            self.state = InterviewState.COMPLETED
            print(f"[Interview {self.session_id}] ✅ COMPLETED")
        else:
            self.state = InterviewState.STOPPED_USER
            print(f"[Interview {self.session_id}] Stopped by user")
    
    def get_duration_seconds(self) -> float:
        """Get interview duration in seconds."""
        if self.start_time is None:
            return 0.0
        
        end = self.end_time if self.end_time else datetime.now()
        return (end - self.start_time).total_seconds()
    
    def get_status(self) -> Dict:
        """Get current interview status."""
        return {
            "session_id": self.session_id,
            "state": self.state.value,
            "level": self.level,
            "company": self.company,
            "domain": self.domain,
            "warning_count": self.warning_count,
            "warning_threshold": self.warning_threshold,
            "current_question": self.current_question,
            "question_count": self.question_count,
            "attention_score": self.current_attention_score,
            "duration_seconds": self.get_duration_seconds(),
            "is_active": self.state == InterviewState.IN_PROGRESS
        }
    
    def get_report(self) -> Dict:
        """Get final interview report."""
        avg_attention = sum(self.attention_scores) / len(self.attention_scores) \
                       if self.attention_scores else 100.0
        
        return {
            "session_id": self.session_id,
            "level": self.level,
            "company": self.company,
            "domain": self.domain,
            "state": self.state.value,
            "start_time": self.start_time.isoformat() if self.start_time else None,
            "end_time": self.end_time.isoformat() if self.end_time else None,
            "duration_seconds": self.get_duration_seconds(),
            "questions_asked": len(self.questions_asked),
            "warnings_issued": self.warning_count,
            "inattention_events": len(self.inattention_events),
            "average_attention_score": avg_attention,
            "final_attention_score": self.current_attention_score
        }


class InterviewSessionManager:
    """
    Manages multiple interview sessions for different users.
    """
    
    def __init__(self):
        self.sessions: Dict[str, InterviewSession] = {}
    
    def create_session(self, session_id: str, level: str = "mid", company: str = "General",
                      domain: str = "SWE") -> InterviewSession:
        """Create a new interview session."""
        session = InterviewSession(session_id, level, company, domain)
        self.sessions[session_id] = session
        print(f"[SessionManager] Created session: {session_id}")
        return session
    
    def get_session(self, session_id: str) -> Optional[InterviewSession]:
        """Get an interview session by ID."""
        return self.sessions.get(session_id)
    
    def end_session(self, session_id: str):
        """End and remove a session."""
        if session_id in self.sessions:
            session = self.sessions[session_id]
            if session.state == InterviewState.IN_PROGRESS:
                session.stop()
            del self.sessions[session_id]
            print(f"[SessionManager] Ended session: {session_id}")
    
    def cleanup_old_sessions(self, max_age_minutes: int = 60):
        """Remove old/stale sessions."""
        now = datetime.now()
        to_remove = []
        
        for sid, session in self.sessions.items():
            if session.end_time:
                age = (now - session.end_time).total_seconds() / 60
                if age > max_age_minutes:
                    to_remove.append(sid)
        
        for sid in to_remove:
            del self.sessions[sid]
        
        if to_remove:
            print(f"[SessionManager] Cleaned up {len(to_remove)} old sessions")
    
    def get_active_sessions(self) -> Dict[str, InterviewSession]:
        """Get all active interview sessions."""
        return {k: v for k, v in self.sessions.items() 
                if v.state == InterviewState.IN_PROGRESS}


# Global session manager
_manager = InterviewSessionManager()


def get_session_manager() -> InterviewSessionManager:
    """Get global session manager."""
    return _manager


def get_or_create_session(session_id: str, level: str = "mid", company: str = "General",
                         domain: str = "SWE") -> InterviewSession:
    """Get existing session or create new one."""
    manager = get_session_manager()
    session = manager.get_session(session_id)
    
    if session is None:
        session = manager.create_session(session_id, level, company, domain)
    
    return session
