import { Avatar } from './avatar.js?v=13';
import { GestureHandler } from './gesture.js';
import { FaceEmotionDetector } from './face_emotion.js';

const avatar = new Avatar();
window.avatar = avatar; // Debugging
let currentEmotion = "off";
// Emotion Trigger State
let lastTriggeredEmotion = null;
let emotionStartTime = 0;
let emotionCooldown = 0;
let isInterviewMode = false;

// ── Interview Inattention Tracking ──────────────────────────────────────────────
// When the user looks away (face disappears from camera) during interview mode,
// AURA reacts like a professional interviewer after a brief grace period.
let _interviewNoFaceStart = null;     // timestamp when face was last lost
const INTERVIEW_INATTENTION_MS = 3000;  // 3s before AURA reacts
let _interviewInattentionFired = false; // so it only fires once per "look-away" event

// ── Interview Stage State ─────────────────────────────────────────────────
// 1 = Warm-up (Simple), 2 = Core (Medium), 3 = Deep-dive (Hard), 4 = Expert (Very Hard)
let interviewStage = 1;
const INTERVIEW_STAGE_LABELS = [
    '', // index 0 unused
    '🟢 Stage 1 — Warm-up (Simple)',
    '🟡 Stage 2 — Core Skills (Medium)',
    '🟠 Stage 3 — Deep-dive (Hard)',
    '🔴 Stage 4 — Expert (Very Hard)'
];


// ══════════════════════════════════════════════════════════════════════════════
// ─── INPUT LOCK (MUTEX) ───────────────────────────────────────────────────────
// Only ONE input (text / voice / gesture / face-emotion) may be processed at a
// time.  While the lock is held every other input path silently drops its request
// and logs a message instead of sending a duplicate API call.
//
// How it works:
//  • acquireInputLock(source)  → returns true if lock granted, false if busy
//  • releaseInputLock()        → frees the lock (called after response finishes)
//  • showInputBusy(source)     → shows a small status-bar indicator
//  • hideInputBusy()           → clears the indicator
// ══════════════════════════════════════════════════════════════════════════════
let _inputLocked = false;   // true = a request is already in flight
let _lockSource = null;    // which input grabbed the lock ('text'|'voice'|'gesture'|'emotion')

function acquireInputLock(source) {
    if (_inputLocked) {
        log(`[InputLock] 🔒 Blocked "${source}" — "${_lockSource}" is still processing.`);
        _showBusyHint(source);
        return false;
    }
    _inputLocked = true;
    _lockSource = source;
    isAuraTalking = true;    // sync legacy flag
    log(`[InputLock] 🔓 Lock acquired by: ${source}`);
    _showProcessingIndicator(source);
    return true;
}

function releaseInputLock() {
    log(`[InputLock] 🔓 Lock released (was: ${_lockSource})`);
    _inputLocked = false;
    _lockSource = null;
    isAuraTalking = false;   // sync legacy flag
    // Reset emotion stability so stale emotions don’t instantly re-trigger
    lastTriggeredEmotion = null;
    emotionStartTime = Date.now();
    emotionCooldown = Date.now();   // enforce cooldown gap after each response
    _hideProcessingIndicator();
}

/** Show a small "⏳ Processing..." badge in the status bar */
function _showProcessingIndicator(source) {
    let badge = document.getElementById('input-lock-badge');
    if (!badge) {
        badge = document.createElement('div');
        badge.id = 'input-lock-badge';
        badge.style.cssText = [
            'position:absolute', 'top:8px', 'left:50%', 'transform:translateX(-50%)',
            'background:rgba(108,92,231,0.85)', 'color:#fff', 'font-size:12px',
            'padding:4px 14px', 'border-radius:20px', 'z-index:200',
            'pointer-events:none', 'transition:opacity .3s', 'font-weight:600',
            'letter-spacing:0.5px', 'box-shadow:0 2px 12px rgba(108,92,231,0.6)'
        ].join(';');
        document.getElementById('ui-overlay').appendChild(badge);
    }
    const icons = { text: '💬', voice: '🎤', gesture: '👋', emotion: '😊' };
    badge.textContent = `${icons[source] || '⏳'} Processing ${source}…`;
    badge.style.opacity = '1';
    badge.style.display = 'block';
}

function _hideProcessingIndicator() {
    const badge = document.getElementById('input-lock-badge');
    if (badge) { badge.style.opacity = '0'; setTimeout(() => { badge.style.display = 'none'; }, 300); }
}

/** Show a brief "busy" hint when an input is dropped */
function _showBusyHint(source) {
    let hint = document.getElementById('input-busy-hint');
    if (!hint) {
        hint = document.createElement('div');
        hint.id = 'input-busy-hint';
        hint.style.cssText = [
            'position:absolute', 'top:40px', 'left:50%', 'transform:translateX(-50%)',
            'background:rgba(255,68,68,0.85)', 'color:#fff', 'font-size:11px',
            'padding:3px 12px', 'border-radius:16px', 'z-index:200',
            'pointer-events:none', 'transition:opacity .4s'
        ].join(';');
        document.getElementById('ui-overlay').appendChild(hint);
    }
    hint.textContent = `⏳ Wait — ${_lockSource} is processing…`;
    hint.style.opacity = '1';
    hint.style.display = 'block';
    setTimeout(() => {
        hint.style.opacity = '0';
        setTimeout(() => { hint.style.display = 'none'; }, 400);
    }, 1800);
}

// ── TALKING GUARD ──────────────────────────────────────────────────────────
// isAuraTalking is kept in sync with InputLock acquire/release automatically.
let isAuraTalking = false;
window._setAuraTalking = (v) => { isAuraTalking = v; };  // debug helper
window._isLocked = () => _inputLocked;                   // debug helper

const gestureHandler = new GestureHandler(avatar, (gesture) => {
    // If VOICE is currently processing, play the animation locally but DON'T send
    // a new API request — gesture animations still work, voice chat is uninterrupted.
    if (_inputLocked && _lockSource === 'voice') {
        log(`[Gesture] Voice processing — playing animation for ${gesture}, skip API call.`);
        _playGestureAnimationOnly(gesture);
        _showVoiceProcessingToast(gesture);
        return;
    }

    // Normal path: grab lock and send gesture to backend
    if (!acquireInputLock('gesture')) return;

    log(`Sending gesture: ${gesture} (Emotion: ${currentEmotion})`);
    addMessage(`(Gesture: ${gesture})`, 'user');
    fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: "", emotion: currentEmotion, gesture: gesture })
    })
        .then(res => res.json())
        .then(data => handleResponse(data))
        .catch(err => {
            console.error("Error sending gesture:", err);
            releaseInputLock();
        });
});

/**
 * Play a gesture's body animation without sending to the LLM.
 * Used when voice is processing and we want gestures to still feel alive.
 */
function _playGestureAnimationOnly(gesture) {
    const gestureAnimMap = {
        wave: 'idle',
        thumbs_up: 'happy',
        victory: 'dance',
        clap: 'clap',
        dance: 'dance',
        hug: 'happy',
        fist: 'idle',
        open_palm: 'idle',
    };
    const anim = gestureAnimMap[gesture] || 'idle';
    if (avatar && avatar.playAnimation) {
        avatar.playAnimation(anim, true);
        // Return to idle after 3 seconds
        setTimeout(() => {
            if (avatar && avatar.playAnimation) avatar.playAnimation('idle');
        }, 3000);
    }
}

/**
 * Show a small non-intrusive toast when a gesture is detected during voice processing.
 */
function _showVoiceProcessingToast(source) {
    let toast = document.getElementById('voice-busy-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'voice-busy-toast';
        toast.style.cssText = [
            'position:absolute', 'bottom:90px', 'left:50%', 'transform:translateX(-50%)',
            'background:rgba(108,92,231,0.88)', 'color:#fff', 'font-size:12px',
            'padding:6px 16px', 'border-radius:20px', 'z-index:300',
            'pointer-events:none', 'transition:opacity .4s', 'font-weight:500',
            'white-space:nowrap', 'box-shadow:0 2px 10px rgba(0,0,0,0.3)'
        ].join(';');
        document.getElementById('ui-overlay').appendChild(toast);
    }
    const gestureEmoji = { wave: '👋', thumbs_up: '👍', victory: '✌️', clap: '👏', dance: '💃', hug: '🫂', fist: '✊', open_palm: '✋' };
    if (source === 'text') {
        toast.textContent = `🎤 Processing your voice… send text after!`;
    } else {
        const emoji = gestureEmoji[source] || '👋';
        toast.textContent = `${emoji} Got your gesture! Still thinking about your voice message…`;
    }
    toast.style.opacity = '1';
    toast.style.display = 'block';
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => { toast.style.display = 'none'; }, 400);
    }, 2500);
}

// ========== AUDIO RECORDING VARIABLES ==========
let isRecording = false;        // Track if we're currently recording
let mediaRecorder = null;       // MediaRecorder instance
let recordedChunks = [];        // Store audio data chunks
let audioStream = null;         // Microphone stream

function log(msg) {
    // Debug output goes ONLY to browser DevTools (F12 → Console), never to visible UI.
    console.log('[AURA]', msg);
}

document.addEventListener('DOMContentLoaded', async () => {
    // SECURITY CHECK: Navigator.mediaDevices is undefined in insecure contexts (non-localhost HTTP)
    if (location.hostname !== 'localhost' && location.hostname !== '127.0.0.1' && location.protocol !== 'https:') {
        const warning = "⚠️ SECURITY RESTRICTION: Camera is BLOCKED by browsers on non-HTTPS connections (except localhost). Please access this site via http://localhost:8000 on this machine.";
        log(warning);
        addMessage(warning, 'aura');
        alert(warning);
        // Disable camera button
        document.getElementById('camera-btn').disabled = true;
        document.getElementById('camera-btn').style.opacity = '0.5';
        return;
    }

    // Clear the server-side conversation history on every fresh page load
    try {
        await fetch('/api/clear-history', { method: 'POST' });
        log('[Session] Conversation history cleared for new session.');
    } catch (e) {
        log('[Session] Could not clear history (server may be starting up).');
    }

    window.onerror = function (message, source, lineno, colno, error) {
        log(`Global Error: ${message} at ${source}:${lineno}`);
    };

    avatar.init();

    // Initialize Face API
    await loadFaceAPI();

    // Initialize Gesture Handler (waits for camera)
    gestureHandler.init();

    setupEventListeners();

    // Start Polling for External Commands (e.g. from Chrome Extension)
    setInterval(pollForUpdates, 1000);
});

async function pollForUpdates() {
    try {
        const res = await fetch('/api/updates');
        const data = await res.json();

        if (data.text) {
            log(`External command received: "${data.text.substring(0, 20)}..."`);
            // Only process external command if no other input is currently active
            if (!_inputLocked) {
                acquireInputLock('external');
                handleResponse(data);
            } else {
                log('[pollForUpdates] Skipped — another input is locked.');
            }
        }
    } catch (e) {
        // Silent fail on polling errors
    }
}

// Restore face-api.js model loading (TinyFaceDetector + faceExpressionNet)
async function loadFaceAPI() {
    log("[FaceEmotion] Loading face-api.js models...");
    try {
        // NOTE: faceLandmark68TinyNet is required when using TinyFaceDetector.
        //       faceLandmark68Net is for SSD detector only — wrong model = no landmarks!
        await faceapi.nets.tinyFaceDetector.loadFromUri('/face-models');
        await faceapi.nets.faceExpressionNet.loadFromUri('/face-models');
        await faceapi.nets.faceLandmark68TinyNet.loadFromUri('/face-models');
        log("[FaceEmotion] Models loaded from local /face-models ✅");
    } catch (e) {
        log("[FaceEmotion] Local models not found — trying CDN...");
        try {
            const cdn = 'https://justadudewhohacks.github.io/face-api.js/models';
            await faceapi.nets.tinyFaceDetector.loadFromUri(cdn);
            await faceapi.nets.faceExpressionNet.loadFromUri(cdn);
            await faceapi.nets.faceLandmark68TinyNet.loadFromUri(cdn);
            log("[FaceEmotion] Models loaded from CDN ✅");
        } catch (err) {
            console.error('[FaceEmotion] Model load failed:', err);
            log(`[FaceEmotion] ❌ Could not load models: ${err.message}`);
        }
    }
}


function setupEventListeners() {
    const textInput = document.getElementById('text-input');
    const sendBtn = document.getElementById('send-btn');
    const cameraBtn = document.getElementById('camera-btn');

    // Text Input
    textInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
    sendBtn.addEventListener('click', sendMessage);

    // Camera Toggle
    cameraBtn.addEventListener('click', toggleCamera);

    // Microphone Toggle (Click to Start/Stop Recording)
    const micBtn = document.getElementById('mic-btn');
    micBtn.addEventListener('click', toggleMicrophone);

    // Gesture Control
    const gestureBtn = document.getElementById('gesture-btn');
    const gestureMenu = document.getElementById('gesture-menu');

    gestureBtn.addEventListener('click', (e) => {
        if (isInterviewMode) {
            log("Gestures are disabled in Interview Mode.");
            _showBusyHint('Interview Mode (Gestures Disabled)');
            return;
        }
        e.stopPropagation();
        gestureMenu.classList.toggle('hidden');
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        if (!gestureBtn.contains(e.target) && !gestureMenu.contains(e.target)) {
            gestureMenu.classList.add('hidden');
        }
    });

    // Gesture Options
    document.querySelectorAll('.gesture-option-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (isInterviewMode) return;
            const gesture = btn.dataset.gesture;
            triggerManualGesture(gesture);
            gestureMenu.classList.add('hidden');
        });
    });

    // Interview Mode
    const interviewBtn = document.getElementById('interview-btn');
    const resumeUpload = document.getElementById('resume-upload');
    if (interviewBtn && resumeUpload) {
        interviewBtn.addEventListener('click', () => {
            // Stop other processing if something is going on, or just trigger click
            if (_inputLocked) {
                _showBusyHint('interview');
                return;
            }
            resumeUpload.click();
        });

        resumeUpload.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (!acquireInputLock('interview')) return;

            log("Uploading resume for Interview Mode...");
            addMessage("📄 Uploading resume and entering Interview Mode...", 'user');

            const formData = new FormData();
            formData.append('file', file);

            try {
                const response = await fetch('/api/upload-resume', {
                    method: 'POST',
                    body: formData
                });

                const data = await response.json();

                if (response.ok) {
                    isInterviewMode = true;
                    interviewStage  = 1;   // always start at stage 1

                    if (avatar && avatar.setInterviewMode) {
                        avatar.setInterviewMode(true);
                    }

                    // ── Pause gesture recognition immediately ──────────────────
                    if (gestureHandler && gestureHandler.pause) gestureHandler.pause();

                    // ── Force sitting animation ───────────────────────────────
                    setTimeout(() => {
                        if (avatar && avatar.animations && avatar.animations['interview_idle']) {
                            avatar.playAnimation('interview_idle');
                        }
                    }, 300);

                    // ── Show stage selector ──────────────────────────────────
                    _showInterviewStageUI();

                    addMessage(`Resume received!  Starting ${INTERVIEW_STAGE_LABELS[interviewStage]}. Whenever you're ready, say "Hi AURA" or type a message.`, 'aura');
                    interviewBtn.style.background = '#27ae60';
                    interviewBtn.title = 'Interview Mode Active';
                    log("Interview Mode enabled. Gestures paused.");

                    // ── Auto-start camera ────────────────────────────────────
                    if (!cameraStream) {
                        log("[Interview] Auto-starting camera for face emotion detection...");
                        toggleCamera();
                    }
                } else {
                    addMessage("⚠️ Error: " + (data.detail || data.message), 'aura');
                }
            } catch (error) {
                console.error("Upload error:", error);
                addMessage("⚠️ Failed to upload resume.", 'aura');
            } finally {
                resumeUpload.value = '';
                releaseInputLock();
            }
        });
    }

    // ── Avatar Switcher ─────────────────────────────────────────────────
    const avatarSelect = document.getElementById('avatar-select');
    if (avatarSelect) {
        // Populate options from catalog
        if (avatar && avatar.AVATAR_CATALOG) {
            avatar.AVATAR_CATALOG.forEach(entry => {
                const opt = document.createElement('option');
                opt.value = entry.key;
                opt.textContent = entry.name;
                avatarSelect.appendChild(opt);
            });
        }
        avatarSelect.addEventListener('change', () => {
            const key = avatarSelect.value;
            log(`[Avatar] Switching to: ${key}`);
            if (avatar && avatar.switchAvatar) avatar.switchAvatar(key);
        });
        // Update selector when avatar finishes loading
        if (avatar) {
            avatar.onAvatarSwitched = (key) => {
                avatarSelect.value = key;
            };
        }
    }
}

function triggerManualGesture(gesture) {
    if (isInterviewMode) return;
    log(`Manual Gesture Triggered: ${gesture}`);

    // If voice is processing, play animation only — don't interrupt
    if (_inputLocked && _lockSource === 'voice') {
        _playGestureAnimationOnly(gesture);
        _showVoiceProcessingToast(gesture);
        return;
    }

    // Normal path
    if (!acquireInputLock('gesture')) return;

    addMessage(`(Gesture: ${gesture})`, 'user');

    fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: "", emotion: currentEmotion, gesture: gesture })
    })
        .then(res => res.json())
        .then(data => handleResponse(data))
        .catch(err => {
            console.error("Error sending gesture:", err);
            releaseInputLock();
        });
}


// ── Client-side bad-word filter ──────────────────────────────────────────────
// Bad words are replaced with asterisks before they appear in the chat UI.
// The server also filters before reaching the LLM, so this is defence-in-depth.
const _BAD_WORDS_JS = new Set([
    'fuck', 'fucking', 'fucked', 'fucker', 'fck', 'fuk',
    'shit', 'shitting', 'shitty',
    'bitch', 'bitching', 'bitchy',
    'ass', 'asshole', 'arse',
    'bastard', 'cunt', 'cock', 'dick', 'pussy',
    'damn', 'dammit',
    'crap', 'piss', 'pissed',
    'nigger', 'nigga', 'faggot', 'retard', 'whore', 'slut',
]);

function filterBadWords(text) {
    return text.split(/(\s+)/).map(token => {
        const bare = token.replace(/[^a-zA-Z0-9']/g, '').toLowerCase();
        return _BAD_WORDS_JS.has(bare) ? '*'.repeat(bare.length) : token;
    }).join('');
}

// toggleRecording removed - used toggleMicrophone instead

async function sendMessage() {
    const input = document.getElementById('text-input');
    const rawText = input.value.trim();
    if (!rawText) return;

    if (_inputLocked && _lockSource === 'voice') {
        _showVoiceProcessingToast('text');
        return;
    }

    if (!acquireInputLock('text')) return;

    const text = filterBadWords(rawText);

    addMessage(text, 'user');
    input.value = '';
    input.disabled = true;

    const userEmotion = detectEmotionFromText(text);
    if (userEmotion !== "neutral" && avatar && avatar.showEmotion) {
        log(`User text emotion detected: ${userEmotion}`);
        avatar.showEmotion(userEmotion, 0.5, false);
    }

    // ── Inject interview stage context so LLM knows difficulty level ───────────
    const stageHint = isInterviewMode ? _getInterviewStagePrompt() : '';
    const finalText = isInterviewMode ? `[${stageHint}] ${text}` : text;

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: finalText,
                emotion: userEmotion,
                face_emotion: cameraStream ? currentEmotion : "off"
            })
        });

        const data = await response.json();
        handleResponse(data);
    } catch (error) {
        console.error('Error sending message:', error);
        addMessage("Error connecting to AURA.", 'aura');
        releaseInputLock();
    } finally {
        input.disabled = false;
    }
}

// ── Interview Stage Helpers ─────────────────────────────────────────────────
/** Returns a short prompt hint injected into every message during interview mode */
function _getInterviewStagePrompt() {
    const hints = [
        '',
        'INTERVIEW_STAGE:1_SIMPLE — Ask only warm-up and introductory questions. Keep them simple and encouraging.',
        'INTERVIEW_STAGE:2_MEDIUM — Ask core technical/behavioral questions at a moderate difficulty level.',
        'INTERVIEW_STAGE:3_HARD — Ask challenging deep-dive questions requiring in-depth knowledge.',
        'INTERVIEW_STAGE:4_EXPERT — Ask expert-level questions. Challenge every claim. Probe edge cases and trade-offs.'
    ];
    return hints[interviewStage] || hints[1];
}

/** Create the floating interview stage selector panel */
function _showInterviewStageUI() {
    let panel = document.getElementById('interview-stage-panel');
    if (panel) { panel.style.display = 'flex'; return; }

    panel = document.createElement('div');
    panel.id = 'interview-stage-panel';
    panel.style.cssText = [
        'position:fixed', 'top:16px', 'left:50%', 'transform:translateX(-50%)',
        'display:flex', 'gap:8px', 'align-items:center',
        'background:rgba(10,10,20,0.88)', 'border:1px solid rgba(255,255,255,0.15)',
        'border-radius:40px', 'padding:8px 18px', 'z-index:500',
        'backdrop-filter:blur(12px)', 'box-shadow:0 4px 24px rgba(0,0,0,0.6)',
        'pointer-events:auto'
    ].join(';');

    const label = document.createElement('span');
    label.style.cssText = 'color:#aaa;font-size:12px;font-weight:600;letter-spacing:1px;text-transform:uppercase;';
    label.textContent = 'DIFFICULTY';
    panel.appendChild(label);

    const stages = [
        { n: 1, icon: '🟢', title: 'Simple' },
        { n: 2, icon: '🟡', title: 'Medium' },
        { n: 3, icon: '🟠', title: 'Hard' },
        { n: 4, icon: '🔴', title: 'Expert' }
    ];

    stages.forEach(({ n, icon, title }) => {
        const btn = document.createElement('button');
        btn.id = `stage-btn-${n}`;
        btn.title = title;
        btn.style.cssText = [
            'background:none', 'border:2px solid transparent',
            'color:white', 'font-size:20px', 'cursor:pointer',
            'border-radius:50%', 'width:38px', 'height:38px',
            'display:flex', 'align-items:center', 'justify-content:center',
            'transition:all 0.2s'
        ].join(';');
        btn.textContent = icon;
        btn.addEventListener('click', () => _setInterviewStage(n));
        panel.appendChild(btn);
    });

    document.body.appendChild(panel);
    _setInterviewStage(1);  // highlight stage 1 by default
}

/** Update the active stage, highlight selected button, show toast */
function _setInterviewStage(n) {
    interviewStage = n;
    log(`[Interview] Stage → ${INTERVIEW_STAGE_LABELS[n]}`);

    for (let i = 1; i <= 4; i++) {
        const btn = document.getElementById(`stage-btn-${i}`);
        if (!btn) continue;
        if (i === n) {
            btn.style.border = '2px solid #fff';
            btn.style.background = 'rgba(255,255,255,0.15)';
            btn.style.transform = 'scale(1.18)';
        } else {
            btn.style.border = '2px solid transparent';
            btn.style.background = 'none';
            btn.style.transform = 'scale(1)';
        }
    }
    // Light toast — no input lock, panel stays visible always
    _showStageToast(INTERVIEW_STAGE_LABELS[n]);
}

/** Animated toast appearing below the stage pill */
function _showStageToast(label) {
    let t = document.getElementById('stage-toast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'stage-toast';
        t.style.cssText = 'position:fixed;top:72px;left:50%;transform:translateX(-50%) translateY(-6px);background:rgba(10,10,20,0.92);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:20px;padding:7px 20px;font-size:13px;font-weight:600;z-index:600;pointer-events:none;transition:opacity .25s,transform .25s;opacity:0;font-family:inherit;';
        document.body.appendChild(t);
    }
    t.textContent = label;
    requestAnimationFrame(() => { t.style.opacity='1'; t.style.transform='translateX(-50%) translateY(0)'; });
    clearTimeout(t._h);
    t._h = setTimeout(() => { t.style.opacity='0'; t.style.transform='translateX(-50%) translateY(-6px)'; }, 2200);
}



// Simple local emotion detection from text keywords
function detectEmotionFromText(text) {
    const lowerText = text.toLowerCase();

    // Emotion keyword mappings
    const emotionKeywords = {
        happy: ['happy', 'glad', 'joy', 'excited', 'great', 'amazing', 'wonderful', 'awesome', 'love', 'fantastic', 'yay', ':)', '😊', '😄', '❤️'],
        sad: ['sad', 'depressed', 'unhappy', 'miserable', 'down', 'cry', 'crying', 'tears', 'heartbroken', 'upset', '😢', '😭', ':('],
        angry: ['angry', 'mad', 'furious', 'annoyed', 'frustrated', 'hate', 'pissed', 'irritated', '😠', '😡'],
        surprised: ['surprised', 'shocked', 'wow', 'omg', 'amazing', 'unbelievable', 'what', 'really', '😮', '😲', '🤯'],
        scared: ['scared', 'afraid', 'fear', 'worried', 'nervous', 'anxious', 'terrified', '😨', '😰'],
        disgusted: ['disgusted', 'gross', 'eww', 'yuck', 'nasty', '🤢', '🤮'],
        love: ['love', 'adore', 'cherish', 'heart', '❤️', '💕', '😍', '🥰'],
        confused: ['confused', 'puzzled', 'lost', 'dont understand', "don't understand", 'what', 'huh', '🤔', '😕']
    };

    // Check each emotion
    for (const [emotion, keywords] of Object.entries(emotionKeywords)) {
        for (const keyword of keywords) {
            if (lowerText.includes(keyword)) {
                return emotion;
            }
        }
    }

    return "neutral";
}

// ========== MICROPHONE FUNCTIONS ==========

/**
 * Toggle microphone recording on/off.
 * If the input lock is held, starting a new recording is blocked.
 */
async function toggleMicrophone() {
    if (isRecording) {
        // Currently recording → Stop and send
        log("Stopping recording...");
        stopRecording();
    } else {
        // Not recording → guard: don't start if AURA is already processing
        if (_inputLocked) {
            log('[Mic] Blocked — another input is still processing.');
            _showBusyHint('voice');
            return;
        }
        log("Starting recording...");
        await startRecording();
    }
}

/**
 * Start recording from microphone
 */
async function startRecording() {
    try {
        // Request microphone access
        log("Requesting microphone access...");
        audioStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });

        log("Microphone access granted!");

        // Clear previous recordings
        recordedChunks = [];

        // Create MediaRecorder with supported format
        let mimeType = 'audio/webm;codecs=opus';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = 'audio/webm';
        }
        if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = 'audio/mp4';
        }

        log(`Using format: ${mimeType}`);

        mediaRecorder = new MediaRecorder(audioStream, {
            mimeType: mimeType
        });

        // Collect audio data as it becomes available
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                recordedChunks.push(event.data);
                log(`Recorded chunk: ${event.data.size} bytes`);
            }
        };

        // When recording stops, send the audio.
        // Small delay (100ms) lets ondataavailable fire its final chunk
        // BEFORE we try to read recordedChunks — fixes the race condition
        // where onstop fires before the last chunk is pushed.
        mediaRecorder.onstop = () => {
            log("MediaRecorder stopped, waiting for final chunks...");
            setTimeout(() => sendAudioToServer(), 150);
        };

        // Start recording (get data every 500ms)
        mediaRecorder.start(500);
        isRecording = true;

        // Update button visual
        document.getElementById('mic-btn').classList.add('active');
        document.getElementById('mic-btn').style.background = '#ff4444';

        log("🎤 Recording... Click again to stop.");
        // Status message removed - no UI clutter

    } catch (err) {
        console.error("Microphone error:", err);
        log(`❌ Mic Error: ${err.message}`);
        addMessage("⚠️ Could not access microphone: " + err.message, 'aura');
    }
}

/**
 * Stop recording and cleanup
 */
function stopRecording() {
    if (!isRecording) return;

    isRecording = false;

    // Stop the MediaRecorder (triggers onstop -> sendAudioToServer)
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }

    // Stop the microphone stream
    if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
        audioStream = null;
    }

    // Show processing state immediately so user knows AURA heard them
    const micBtn = document.getElementById('mic-btn');
    micBtn.classList.remove('active');
    micBtn.style.background = 'rgba(108,92,231,0.85)';
    micBtn.textContent = '⏳';
    micBtn.disabled = true;  // Block re-tap until response returns

    log("Recording stopped — processing audio...");
}

/** Reset mic button back to normal (called after server responds) */
function _resetMicBtn() {
    const micBtn = document.getElementById('mic-btn');
    if (!micBtn) return;
    micBtn.textContent = '🎤';
    micBtn.style.background = '';
    micBtn.disabled = false;
}

// ── Stale-lock rescue: if InputLock is held for > 10s something went wrong
// (e.g. network error that didn't properly call releaseInputLock). Auto-release.
function _rescueStaleLock() {
    if (_inputLocked) {
        log('[InputLock] ⚠️ Stale lock detected after 10s — force-releasing.');
        releaseInputLock();
        _resetMicBtn();
    }
}

/**
 * Send recorded audio IMMEDIATELY to server — no playback wait.
 */
async function sendAudioToServer() {
    if (recordedChunks.length === 0) {
        log("No audio recorded — no chunks captured.");
        addMessage("⚠️ No audio was recorded. Please try again.", 'aura');
        _resetMicBtn();
        return;
    }

    // Use the actual MIME type from the recorded chunks
    const mimeType = recordedChunks[0].type || 'audio/webm';
    const audioBlob = new Blob(recordedChunks, { type: mimeType });
    const sizeKB = (audioBlob.size / 1024).toFixed(1);
    log(`Audio blob: ${sizeKB} KB (${mimeType}) — sending immediately`);

    if (audioBlob.size < 500) {
        log("Audio blob too small — probably nothing was recorded.");
        addMessage("⚠️ Recording too short. Try holding the mic button a bit longer.", 'aura');
        _resetMicBtn();
        return;
    }

    // Clear chunks for next recording
    recordedChunks = [];

    // Hide the playback container if visible
    const audioContainer = document.getElementById('audio-playback-container');
    if (audioContainer) audioContainer.style.display = 'none';

    // Safety net: if the server takes > 10s to respond, rescue the lock
    const rescueTimer = setTimeout(_rescueStaleLock, 10000);

    // Send straight to server
    await sendToServerForTranscription(audioBlob);

    clearTimeout(rescueTimer);
}

/**
 * Actually send the audio to the server for transcription
 */
async function sendToServerForTranscription(audioBlob) {
    // ── InputLock: block if another input is already being processed ──
    // If it's a stale lock from before, the _rescueStaleLock timeout will
    // have cleared it. Here we just try to acquire normally.
    if (!acquireInputLock('voice')) {
        log('[Voice] Request dropped — another input is in progress.');
        addMessage('⏳ AURA is still processing — please wait a moment.', 'aura');
        _resetMicBtn();
        return;
    }

    // Pick the right file extension
    const type = audioBlob.type || 'audio/webm';
    const extension = type.includes('mp4') ? 'mp4' : 'webm';

    const formData = new FormData();
    formData.append('file', audioBlob, `recording.${extension}`);
    // Include the live face-camera emotion so the server can fuse it with audio emotion
    const faceEmo = cameraStream ? currentEmotion : "off";
    formData.append('face_emotion', faceEmo);
    log(`[Voice] Sending ${(audioBlob.size / 1024).toFixed(1)}KB (${type}) with face_emotion: ${faceEmo}`);

    try {
        log("Sending audio to server...");
        const response = await fetch('/api/audio', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        log("Server response received.");

        if (data.input_text && data.input_text.trim()) {
            const heardText = filterBadWords(data.input_text.trim());
            log(`Transcribed: "${heardText}"`);
            addMessage(heardText, 'user');

            if (data.text) {
                handleResponse(data);
            } else {
                log('[Voice] Server returned no response text.');
                addMessage("Hmm, I didn't get a response. Try again!", 'aura');
                _resetMicBtn();
                releaseInputLock();
            }
        } else {
            log("Could not understand audio — no transcript.");
            addMessage("🎤 I couldn't quite catch that — could you try again?", 'aura');
            _resetMicBtn();
            releaseInputLock();
        }

    } catch (error) {
        console.error("Audio API error:", error);
        log(`[Voice] Error: ${error.message}`);
        addMessage(`⚠️ Error processing audio: ${error.message}`, 'aura');
        _resetMicBtn();
        releaseInputLock();
    }
}


function handleResponse(data) {
    addMessage(data.text, 'aura');

    // Show the detected emotion on the avatar's face immediately
    const responseEmotion = data.emotion || "neutral";
    log(`Response emotion: ${responseEmotion}`);

    // Transition avatar to the emotion state WITH body animation
    if (avatar && avatar.transitionToEmotion) {
        // Enable triggerAnimation (true) so AURA performs emotion-based body language
        avatar.transitionToEmotion(responseEmotion, 400, true);
    }

    // Play Audio
    if (data.audio_url) {
        // Clear any queued emotion animations when starting to talk
        if (avatar && avatar.clearEmotionQueue) {
            avatar.clearEmotionQueue();
        }

        // Stop currently playing audio if any
        if (window.currentAudio) {
            window.currentAudio.pause();
            window.currentAudio = null;
        }

        log(`Playing audio: ${data.audio_url} `);
        const audio = new Audio(data.audio_url);
        audio.preload = 'auto';
        window.currentAudio = audio; // Track it

        // ── TALKING GUARD: block emotion/gesture triggers while AURA speaks ──
        isAuraTalking = true;
        log('[Guard] AURA started talking — emotion & gesture triggers paused.');

        const _onAudioStarted = () => {
            avatar.setTalking(true);
            // Use provided face animation data if available
            if (data.face_animation && data.face_animation.length > 0) {
                log(`Using pre-calculated Lip Sync data (${data.face_animation.length} frames).`);
                startFaceSync(audio, data.face_animation, data.emotion);
            }
            // A2F fallback removed — too slow; emotional blendshapes from transitionToEmotion are used instead
        };

        const _onAudioError = (msg) => {
            log(`Audio error: ${msg}`);
            isAuraTalking = false;
            _resetMicBtn();
            releaseInputLock();
        };

        audio.load();
        const _pp = audio.play();
        if (_pp !== undefined) {
            _pp.then(() => {
                _onAudioStarted();
            }).catch((err) => {
                log(`Autoplay blocked: ${err.message} — showing ▶ button`);
                _showPlayButton(audio, _onAudioStarted);
            });
        } else {
            _onAudioStarted();
        }

        audio.onerror = () => _onAudioError('audio element error');

        audio.onended = () => {
            isAuraTalking = false;
            emotionCooldown = Date.now();
            lastTriggeredEmotion = null;
            log('[Guard] AURA finished talking — inputs re-enabled.');
            avatar.setTalking(false);
            stopFaceSync();
            avatar.playAnimation('idle');
            window.currentAudio = null;
            _resetMicBtn();
            // ── Release InputLock after audio finishes ──
            releaseInputLock();
            log('Audio playback finished.');
        };
    }
    // NOTE: Body animations are driven by transitionToEmotion() above — no need to double-play here.
}

/**
 * Shows a floating '▶ Tap to hear AURA' button when browser blocks autoplay.
 * Clicking it unblocks audio for this and future responses.
 */
function _showPlayButton(audio, onStarted) {
    let btn = document.getElementById('autoplay-btn');
    if (!btn) {
        btn = document.createElement('button');
        btn.id = 'autoplay-btn';
        btn.style.cssText = [
            'position:absolute', 'bottom:120px', 'left:50%', 'transform:translateX(-50%)',
            'background:linear-gradient(135deg,#6c5ce7,#a855f7)', 'color:#fff',
            'font-size:16px', 'font-weight:700', 'padding:12px 28px',
            'border:none', 'border-radius:30px', 'cursor:pointer', 'z-index:999',
            'box-shadow:0 4px 20px rgba(108,92,231,0.6)', 'pointer-events:auto'
        ].join(';');
        document.getElementById('ui-overlay').appendChild(btn);
    }
    btn.textContent = '▶ Tap to hear AURA';
    btn.style.display = 'block';
    btn.onclick = () => {
        btn.style.display = 'none';
        audio.play().then(() => {
            onStarted();
        }).catch(e => log(`Still blocked: ${e.message}`));
    };
    setTimeout(() => { if (btn) btn.style.display = 'none'; }, 10000);
}

let faceSyncInterval;
let lastFrameIndex = 0;

// Phoneme-critical blendshapes that need extra boost for visible lip sync
const PHONEME_SHAPES = [
    'jawOpen', 'mouthOpen', 'mouthFunnel', 'mouthPucker',
    'mouthLeft', 'mouthRight', 'mouthSmileLeft', 'mouthSmileRight',
    'mouthFrownLeft', 'mouthFrownRight', 'mouthStretchLeft', 'mouthStretchRight',
    'mouthRollLower', 'mouthRollUpper', 'mouthShrugLower', 'mouthShrugUpper',
    'mouthPressLeft', 'mouthPressRight', 'mouthLowerDownLeft', 'mouthLowerDownRight',
    'mouthUpperUpLeft', 'mouthUpperUpRight', 'mouthClose'
];

function startFaceSync(audio, frames, emotion = "neutral") {
    if (faceSyncInterval) cancelAnimationFrame(faceSyncInterval);

    // Sort frames by time for binary search
    frames.sort((a, b) => a.time - b.time);
    lastFrameIndex = 0;

    // Amplification factors - higher = more visible movement
    const LIP_AMPLIFY = 2.0;      // Strong boost for mouth shapes  
    const GENERAL_AMPLIFY = 1.5;  // Normal boost for other shapes

    // Use requestAnimationFrame for smoother, more accurate timing
    function syncLoop() {
        if (!audio || audio.paused || audio.ended) {
            stopFaceSync();
            return;
        }

        const currentTime = audio.currentTime;

        // Binary search for the closest frame
        let left = 0, right = frames.length - 1;
        let closestIdx = 0;

        while (left <= right) {
            const mid = Math.floor((left + right) / 2);
            if (frames[mid].time <= currentTime) {
                closestIdx = mid;
                left = mid + 1;
            } else {
                right = mid - 1;
            }
        }

        // Get current and next frame for interpolation
        const currentFrame = frames[closestIdx];
        const nextFrame = frames[closestIdx + 1] || currentFrame;

        if (currentFrame) {
            let blendshapes = {};

            // Interpolate between frames for ultra-smooth animation
            if (nextFrame && nextFrame !== currentFrame) {
                const timeDiff = nextFrame.time - currentFrame.time;
                const rawT = timeDiff > 0 ? (currentTime - currentFrame.time) / timeDiff : 0;
                const t = Math.max(0, Math.min(1, rawT));

                // Cubic easing for more natural movement
                const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

                // Interpolate and amplify each blendshape
                const allKeys = new Set([
                    ...Object.keys(currentFrame.blendshapes),
                    ...Object.keys(nextFrame.blendshapes)
                ]);

                for (const key of allKeys) {
                    const currentVal = currentFrame.blendshapes[key] || 0;
                    const nextVal = nextFrame.blendshapes[key] || 0;

                    // Cubic interpolation
                    let interpolated = currentVal + (nextVal - currentVal) * eased;

                    // Apply phoneme-aware amplification
                    const isPhoneme = PHONEME_SHAPES.some(p =>
                        key.toLowerCase().includes(p.toLowerCase())
                    );
                    const amplify = isPhoneme ? LIP_AMPLIFY : GENERAL_AMPLIFY;

                    blendshapes[key] = Math.max(0, Math.min(1, interpolated * amplify));
                }
            } else {
                // Single frame - amplify with phoneme awareness
                for (const key in currentFrame.blendshapes) {
                    const isPhoneme = PHONEME_SHAPES.some(p =>
                        key.toLowerCase().includes(p.toLowerCase())
                    );
                    const amplify = isPhoneme ? LIP_AMPLIFY : GENERAL_AMPLIFY;
                    blendshapes[key] = Math.min(1, (currentFrame.blendshapes[key] || 0) * amplify);
                }
            }

            avatar.updateFace(blendshapes, emotion);
        }

        faceSyncInterval = requestAnimationFrame(syncLoop);
    }

    faceSyncInterval = requestAnimationFrame(syncLoop);
}

function stopFaceSync() {
    if (faceSyncInterval) {
        cancelAnimationFrame(faceSyncInterval);
        faceSyncInterval = null;
    }
    if (window.avatar) window.avatar.resetFace();
}


function addMessage(text, sender) {
    const history = document.getElementById('chat-history');
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${sender} `;
    msgDiv.textContent = text;
    history.appendChild(msgDiv);

    // Scroll to bottom
    const container = document.getElementById('chat-container');
    container.scrollTop = container.scrollHeight;
}

let cameraStream = null;
async function toggleCamera() {
    const video = document.getElementById('user-camera');
    const btn = document.getElementById('camera-btn');

    if (cameraStream) {
        // Stop camera
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
        video.srcObject = null;
        video.classList.add('hidden');
        btn.classList.remove('active');
        gestureHandler.stop();
        stopFaceDetection();

        // ── FIX: Reset face emotion to 'off' when camera turns off ──────────
        // Without this, the last detected face emotion lingers in currentEmotion
        // and gets sent as face_emotion in the next text/voice message, causing
        // the LLM to see a conflict even though the camera is not running.
        currentEmotion = 'off';
        const statusSpan = document.getElementById('current-emotion');
        if (statusSpan) {
            statusSpan.textContent = 'Camera off';
            statusSpan.style.color = '#aaa';
        }
        log('[Camera] Stopped — currentEmotion reset to neutral.');
    } else {
        // Start camera
        try {
            cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
            video.srcObject = cameraStream;
            video.classList.remove('hidden');
            btn.classList.add('active');

            // Wait for video to play
            video.onloadedmetadata = () => {
                video.play();
                gestureHandler.start();
                startFaceDetection(video);
            };
        } catch (err) {
            console.error("Error accessing camera:", err);
            log(`Error accessing camera: ${err.message} `);
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// FACE EMOTION DETECTION — MediaPipe FaceMesh + Geometric Ratios
// ═══════════════════════════════════════════════════════════════

let faceDetector = null;    // FaceEmotionDetector instance

/** Called when camera is turned ON */
function startFaceDetection(video) {
    const statusSpan = document.getElementById('current-emotion');

    // Lazy-create the detector
    if (!faceDetector) {
        faceDetector = new FaceEmotionDetector();

        // ── On each emotion change ──────────────────────────────────
        faceDetector.onEmotion((emotion, confidence, scores) => {
            currentEmotion = emotion;

            // Update status bar text
            const pct = (confidence * 100).toFixed(0);
            statusSpan.textContent =
                emotion.charAt(0).toUpperCase() + emotion.slice(1) + ` (${pct}%)`;
            statusSpan.style.color = emotion === 'neutral' ? '#aaa' : '#00ff88';

            // ── FIX: Show emotion on avatar face AND trigger body animation ──
            // triggerAnimation=true so face expression changes also play body anims
            // directly from the camera — no LLM call needed.
            // If we are in interview mode, restrict certain face emotions from triggering body animations, just pass to LLM
            let shouldAnimate = !isAuraTalking;
            if (isInterviewMode && emotion !== 'neutral') {
                shouldAnimate = false; // Interviewer persona holds face expressions but doesn't do wild body animations
            }

            if (avatar && avatar.showEmotion && emotion !== 'neutral') {
                avatar.showEmotion(emotion, Math.min(confidence * 1.5, 1.0), shouldAnimate);
                log(`[FaceEmotion] 🎭 Face→Avatar: ${emotion} (body anim: ${shouldAnimate})`);
            } else if (emotion === 'neutral' && avatar && avatar.showEmotion) {
                // Smoothly recover face to neutral when no strong emotion is detected
                avatar.gradualEmotionalRecovery(1500);
            }

            // Auto-trigger AURA reaction after sustained emotion (with cooldown)
            const now = Date.now();

            // ╔═══════════════════════════════════════════════════════════════════
            // KEY FIX: Face emotion KEEPS DETECTING continuously — even while
            // the user is typing / speaking.  But the auto-trigger that actually
            // sends a request to the backend is SUPPRESSED while the input lock
            // is held.  Once the lock releases the cooldown resets, so AURA
            // won't immediately re-act to an emotion that was building up during
            // the previous response.
            // ╚═══════════════════════════════════════════════════════════════════
            if (_inputLocked) {
                // Silently skip: face keeps updating avatar expression, 
                // but does NOT send to backend while another input is active.
                return;
            }

            if (emotion !== 'neutral' && confidence > 0.20 && (now - emotionCooldown > 4000)) {
                if (emotion === lastTriggeredEmotion) {
                    if (now - emotionStartTime > 800) {
                        log(`[FaceEmotion] Sustained: ${emotion} (${pct}%) → Triggering reaction`);
                        triggerEmotionReaction(emotion);
                        emotionCooldown = now;
                        lastTriggeredEmotion = null;
                    }
                } else {
                    lastTriggeredEmotion = emotion;
                    emotionStartTime = now;
                }
            } else if (emotion !== lastTriggeredEmotion) {
                lastTriggeredEmotion = emotion;
                emotionStartTime = now;
            }
        });

        // ── Debug / live score bar ──────────────────────────────────
        faceDetector.onDebug((emotion, scores) => {
            if (!scores) {
                // No face detected
                video.style.border = '2px solid #333';
                video.style.boxShadow = 'none';
                statusSpan.textContent = 'No face';
                statusSpan.style.color = '#888';
                _updateEmotionBar(null);

                // ── Interview inattention: track how long face has been gone ──
                if (isInterviewMode && !_inputLocked) {
                    const now = Date.now();
                    if (_interviewNoFaceStart === null) {
                        _interviewNoFaceStart = now;
                        _interviewInattentionFired = false;
                        log('[Interview] Face lost — starting inattention timer...');
                    } else if (!_interviewInattentionFired &&
                               (now - _interviewNoFaceStart) >= INTERVIEW_INATTENTION_MS) {
                        _interviewInattentionFired = true;
                        _triggerInterviewInattention();
                    }
                }
                return;
            }

            // Face detected — reset inattention timer
            _interviewNoFaceStart = null;
            _interviewInattentionFired = false;

            // Green glow when face found
            video.style.border = '3px solid #00ff88';
            video.style.boxShadow = '0 0 18px #00cc66';
            _updateEmotionBar(scores);
        });
    }

    // Start the face-api.js detection loop on the video element
    faceDetector.start(video);
    log('[FaceEmotion] Face emotion detector started ✅');

    // ── Head-turn detection callback (v4) ───────────────────────────────
    faceDetector.onHeadTurn((direction) => {
        if (!isInterviewMode || _inputLocked) return;

        log(`[Interview] 🔄 Head turned ${direction} — AURA noticing...`);

        const warnings = [
            "Please keep your eyes on me — maintaining eye contact shows confidence.",
            "Try to keep your head straight and face forward during the interview.",
            "I noticed you looked to the side. In a real interview, focus on your interviewer!",
            "Head positioning matters! Keep facing forward to make a strong impression.",
        ];
        const msg = warnings[Math.floor(Math.random() * warnings.length)];

        if (!acquireInputLock('headturn')) return;

        addMessage(msg, 'aura');

        fetch('/api/animate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: msg, emotion: 'thinking' })
        })
        .then(r => r.json())
        .then(data => {
            if (data.audio_url) {
                const audio = new Audio(data.audio_url);
                window.currentAudio = audio;
                avatar.setTalking(true);
                audio.play().catch(() => {});
                audio.onended = () => {
                    avatar.setTalking(false);
                    releaseInputLock();
                    // Cool-down: reset head-turn state after AURA reacts
                    setTimeout(() => faceDetector && faceDetector.resetHeadTurn(), 6000);
                };
            } else {
                releaseInputLock();
                setTimeout(() => faceDetector && faceDetector.resetHeadTurn(), 6000);
            }
        })
        .catch(() => {
            releaseInputLock();
            setTimeout(() => faceDetector && faceDetector.resetHeadTurn(), 6000);
        });
    });
}


/** Called when camera is turned OFF */
function stopFaceDetection() {
    if (faceDetector) {
        faceDetector.stop();
        faceDetector = null;
    }
    _updateEmotionBar(null);
}

/** Render a small emotion score bar in the status area (if element exists) */
const EMOTION_COLORS = {
    happy: '#f9c74f',
    sad: '#4895ef',
    angry: '#f72585',
    surprised: '#7209b7',
    fearful: '#560bad',
    disgusted: '#3a0ca3',
    neutral: '#aaa',
};

function _updateEmotionBar(scores) {
    let bar = document.getElementById('emotion-score-bar');
    if (!bar) {
        // Create it once
        bar = document.createElement('div');
        bar.id = 'emotion-score-bar';
        bar.style.cssText = [
            'position:absolute', 'top:60px', 'left:12px',
            'display:flex', 'flex-direction:column', 'gap:3px',
            'background:rgba(0,0,0,0.55)', 'padding:6px 10px',
            'border-radius:8px', 'font-size:11px', 'color:#fff',
            'pointer-events:none', 'z-index:99', 'min-width:130px'
        ].join(';');
        document.getElementById('ui-overlay').appendChild(bar);
    }

    if (!scores) { bar.style.display = 'none'; return; }
    bar.style.display = 'flex';

    bar.innerHTML = Object.entries(scores)
        .sort((a, b) => b[1] - a[1])
        .map(([emo, val]) => {
            const pct = Math.round(val * 100);
            const color = EMOTION_COLORS[emo] || '#888';
            return `
              <div style="display:flex;align-items:center;gap:5px">
                <span style="width:58px;text-align:right;color:${color}">${emo}</span>
                <div style="flex:1;background:#333;border-radius:3px;height:7px">
                  <div style="width:${pct}%;background:${color};height:100%;border-radius:3px;transition:width .15s"></div>
                </div>
                <span style="width:28px;color:#ccc">${pct}%</span>
              </div>`;
        }).join('');
}

// ── Face Emotion → Avatar Animation Map ─────────────────────────────────────
// Maps detected face emotions to body animation names.
// This is PURELY local — no LLM call, no API request.
// The face camera drives the avatar's expressions and body language directly.
const FACE_EMOTION_ANIM_MAP = {
    happy: ['happy'],        // Sitting Laughing
    sad: ['sad'],          // Defeated
    angry: ['sad'],          // Defeated (closest fallback)
    surprised: ['jump'],         // Jump/startle
    fearful: ['crouch'],       // Crouch
    disgusted: ['sad'],          // Defeated
    excited: ['clap'],         // Clapping
    neutral: ['idle'],         // Idle
};

/**
 * Trigger a status-bar pulse when a sustained face emotion is confirmed.
 * Body animations + face blendshapes are already driven continuously by
 * showEmotion(triggerAnimation=true) in the onEmotion callback above.
 * This function is left as a lightweight "confirmed emotion" signal only.
 */
function triggerEmotionReaction(emotion) {
    log(`[FaceEmotion] ✅ Sustained emotion confirmed: ${emotion}`);

    // Just pulse the status bar to show the emotion was confirmed
    const statusSpan = document.getElementById('current-emotion');
    if (statusSpan) {
        const orig = statusSpan.style.color;
        statusSpan.style.color = '#f9ca24';
        statusSpan.style.fontWeight = 'bold';
        setTimeout(() => {
            statusSpan.style.color = orig;
            statusSpan.style.fontWeight = '';
        }, 1200);
    }
}

// ── Interview Inattention Response ──────────────────────────────────────────────
/**
 * Called when the user has looked away from the camera for too long
 * during an interview session. AURA reacts like a real interviewer.
 */
function _triggerInterviewInattention() {
    if (!isInterviewMode || _inputLocked) return;

    log('[Interview] 👀 Candidate looked away — AURA noticing inattention...');

    // Pick a natural interviewer response at random
    const reactions = [
        "I notice you seem a bit distracted — are you still with me?",
        "Hey, I'm up here! Eye contact is important in an interview.",
        "It looks like something caught your attention. Shall we continue?",
        "Just checking in — are you comfortable? Take a moment if you need to.",
        "In a real interview, maintaining eye contact shows confidence. Let's keep going!"
    ];
    const reactionText = reactions[Math.floor(Math.random() * reactions.length)];

    // Show a visual nudge in the status bar
    const statusSpan = document.getElementById('current-emotion');
    if (statusSpan) {
        statusSpan.textContent = '👀 Looked away';
        statusSpan.style.color = '#ff9f43';
    }

    // Don't acquire lock — just show the message and play TTS via /api/animate
    // so the interviewer can "call out" the user without a full LLM round-trip
    if (!acquireInputLock('inattention')) return;

    addMessage(reactionText, 'aura');

    fetch('/api/animate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: reactionText, emotion: 'thinking' })
    })
    .then(res => res.json())
    .then(data => {
        if (data.audio_url) {
            const audio = new Audio(data.audio_url);
            audio.preload = 'auto';
            window.currentAudio = audio;
            avatar.setTalking(true);
            avatar.transitionToEmotion('thinking', 400, false);

            audio.play().catch(e => log('[Inattention] Audio autoplay blocked: ' + e.message));

            audio.onended = () => {
                avatar.setTalking(false);
                releaseInputLock();
                // Re-enable inattention after a cooldown so AURA doesn't spam
                setTimeout(() => {
                    _interviewNoFaceStart = null;
                    _interviewInattentionFired = false;
                }, 8000);
            };
        } else {
            releaseInputLock();
        }
    })
    .catch(err => {
        log('[Inattention] Error: ' + err.message);
        releaseInputLock();
    });
}
