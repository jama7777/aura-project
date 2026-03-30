import * as THREE from 'three';
import { Avatar } from './avatar.js?v=16';
import { GestureHandler } from './gesture.js';
import { FaceEmotionDetector } from './face_emotion.js';

const avatar = new Avatar();
window.avatar = avatar; // Debugging
let currentEmotion = "off";
// Emotion Trigger State
let lastTriggeredEmotion = null;
let emotionStartTime = 0;
let emotionCooldown = 0;



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
        // ── ALLOW CONCURRENCY: Don't block manual inputs if the lock is held by a background emotion ──
        if ((source === 'text' || source === 'voice') && _lockSource === 'emotion') {
            log(`[InputLock] 🔓 Manual "${source}" bypassing background "emotion" lock.`);
            // KEY FIX: Change the lock source to the manual one immediately to prevent double-firing
            _lockSource = source; 
            return true;
        }
        
        log(`[InputLock] 🔒 Blocked "${source}" — "${_lockSource}" is still processing.`);
        _showBusyHint(source);
        return false;
    }
    _inputLocked = true;
    _lockSource = source;
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
let isAuraTalking = false;
let lastSpeechEndTime = 0;
let currentAbortController = null;
let interactionQueue = []; // Response queue for sequential interaction
let lastResponseText = ""; // For duplication filtering
let lastResponseTime = 0;
window._setAuraTalking = (v) => { isAuraTalking = v; };

/** Interrupt current speech playback and any pending input lock */
function stopAuraSpeech() {
    if (window.currentAudio) {
        log(`[Interrupt] Stopping active speech singleton.`);
        window.currentAudio.pause();
        window.currentAudio.src = ""; // Force stop and cleanup
        window.currentAudio.onended = null;
        window.currentAudio.onerror = null;
        window.currentAudio = null;
    }
    isAuraTalking = false;
    if (window.avatar) {
        window.avatar.setTalking(false);
        window.avatar.resetFace();
    }
    stopFaceSync();
}

/** 
 * Force-release the input lock for a new high-priority interaction 
 * (like a gesture or emotion acknowledgment during speaking)
 */
function interruptInputLock() {
    if (_inputLocked) {
        log(`[Interrupt] Force-releasing lock (was: ${_lockSource}) for new interaction.`);
        _inputLocked = false;
        _hideProcessingIndicator();
    }
}

const gestureHandler = new GestureHandler(avatar, (gesture) => {
    const textInput = document.getElementById('text-input');
    const isTyping = textInput && (document.activeElement === textInput || textInput.value.trim().length > 0);

    // ── PERCEPTION SUPPRESSION ──────────────────────────────────────────────
    // If the user or AURA is speaking, only play the animation locally.
    if (isAuraTalking || isRecording || _inputLocked) {
        log(`[Gesture] Visual-only mimicry for "${gesture}" while busy.`);
        _playGestureAnimationOnly(gesture);
        
        // KEY FIX: Do not store this gesture for the NEXT AI processing turn.
        // This ensures the gesture is strictly visual and doesn't load into memory.
        if (gestureHandler) gestureHandler.lastGesture = "none";
        
        return;
    }
    // ────────────────────────────────────────────────────────────────────────

    // Normal path: grab lock and send gesture to backend
    if (!acquireInputLock('gesture')) return;

    log(`Sending gesture: ${gesture} (Emotion: ${currentEmotion})`);
    addMessage(`(Gesture: ${gesture})`, 'user');
    fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            text: "", 
            emotion: "neutral", 
            face_emotion: typeof cameraStream !== 'undefined' && cameraStream ? currentEmotion : "off", 
            gesture: gesture 
        })
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
        wave:        'cmu_wave',          // ← CMU real wave mocap
        thumbs_up:   'cmu_expressive2',   // ← CMU expressive
        victory:     'cmu_dance3',        // ← CMU dance
        clap:        'clap',
        dance:       'dance',
        hug:         'happy',
        point:       'cmu_gesture',       // ← CMU gesture pointing
        horns:       'cmu_dance4',        // ← CMU dance 2
        call_me:     'cmu_wave2',         // ← CMU wave/point
        thumbs_down: 'sad',
        ok:          'cmu_expressive1',   // ← CMU expressive
        iloveyou:    'pray',
        vulcan:      'cmu_expressive3',   // ← CMU expressive
        open_palm:   'cmu_wave3'          // ← CMU wave variant
    };
    const anim = gestureAnimMap[gesture] || 'idle';
    if (avatar) {
        if (avatar.playSequence) {
            // Priority-1: Better way to play animations while talking — ensures it doesn't get stuck
            avatar.playSequence([anim], () => {
                if (avatar.playAnimation) avatar.playAnimation('idle');
            });
        } else if (avatar.playAnimation) {
            avatar.playAnimation(anim, true);
        }
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

/**
 * Universal notification toast for UI feedback.
 */
function _showNotification(message, color = "#6c5ce7") {
    let toast = document.getElementById('aura-notification');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'aura-notification';
        toast.style.cssText = [
            'position:fixed', 'top:20px', 'right:20px',
            'padding:12px 24px', 'border-radius:12px', 'color:white',
            'font-weight:600', 'z-index:9999', 'transition:all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
            'box-shadow:0 10px 30px rgba(0,0,0,0.3)', 'font-size:14px', 'display:none', 'opacity:0',
            'transform:translateY(-20px)'
        ].join(';');
        document.body.appendChild(toast);
    }
    
    toast.textContent = message;
    toast.style.backgroundColor = color;
    toast.style.display = 'block';
    
    // Animate in
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
    });

    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-20px)';
        setTimeout(() => toast.style.display = 'none', 400);
    }, 3000);
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

    window.onerror = function (message, source, lineno, colno, error) {
        log(`Global Error: ${message} at ${source}:${lineno}`);
    };

    avatar.init();

    // Initialize Face API
    await loadFaceAPI();

    // Initialize Gesture Handler (waits for camera)
    gestureHandler.init();

    setupEventListeners();
});



// Restore face-api.js model loading (TinyFaceDetector + faceExpressionNet)
async function loadFaceAPI() {
    log("[FaceEmotion] Loading face-api.js models...");
    try {
        // NOTE: face-api.js expects these exact names at the root of the URI
        await faceapi.nets.tinyFaceDetector.loadFromUri('/face-models');
        await faceapi.nets.faceExpressionNet.loadFromUri('/face-models');
        
        // Landmark 68 Tiny is often missing locally; try local first then fallback
        try {
            await faceapi.nets.faceLandmark68TinyNet.loadFromUri('/face-models');
            log("[FaceEmotion] Models loaded from local /face-models ✅");
        } catch(le) {
            log("[FaceEmotion] Landmark model missing locally — pulling from CDN...");
            const cdn = 'https://justadudewhohacks.github.io/face-api.js/models';
            await faceapi.nets.faceLandmark68TinyNet.loadFromUri(cdn);
            log("[FaceEmotion] Full model suite loaded (Mix of Local + CDN) ✅");
        }
    } catch (e) {
        log("[FaceEmotion] Local models incomplete — trying full CDN fallback...");
        try {
            const cdn = 'https://justadudewhohacks.github.io/face-api.js/models';
            // We use individual loads instead of all-at-once to see what fails
            await faceapi.nets.tinyFaceDetector.loadFromUri(cdn);
            await faceapi.nets.faceExpressionNet.loadFromUri(cdn);
            
            // Try landmarks, but it's okay if they fail (head-turn will just be disabled)
            try {
                await faceapi.nets.faceLandmark68TinyNet.loadFromUri(cdn);
                log("[FaceEmotion] Landmarks loaded from CDN ✅");
            } catch(le) {
                log("[FaceEmotion] ⚠️ Landmark model missing from CDN, head-turn disabled.");
            }
            log("[FaceEmotion] Primary models loaded from CDN ✅");
        } catch (err) {
            console.error('[FaceEmotion] Model load failed absolutely:', err);
            log(`[FaceEmotion] ❌ Total Model Failure: ${err.message}`);
        }
    }
}


function setupEventListeners() {
    const textInput = document.getElementById('text-input');
    const sendBtn = document.getElementById('send-btn');
    const cameraBtn = document.getElementById('camera-btn');

    // ── Live Dynamic Grammar Checking ───────────────────────────────────────
    let typingTimer;
    textInput.addEventListener('input', () => {
        clearTimeout(typingTimer);
        const autoCorrectEnabled = document.getElementById('auto-correct-cb')?.checked ?? true;
        if (!autoCorrectEnabled) return;

        const rawText = textInput.value.trim();
        if (rawText.length < 5) return; // Only check longer phrases

        typingTimer = setTimeout(async () => {
            // Re-read current value in case user started typing again during async call
            const currentRaw = textInput.value.trim();
            if (currentRaw.length < 5 || currentRaw !== rawText) return;

            try {
                const res = await fetch('/api/correct-text', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: currentRaw })
                });
                if (!res.ok) return;
                const data = await res.json();
                
                if (data.changed && textInput.value.trim() === currentRaw) {
                    // Update the box!
                    const start = textInput.selectionStart;
                    const end = textInput.selectionEnd;
                    textInput.value = data.corrected;
                    // Try to restore cursor if possible
                    textInput.setSelectionRange(start, end);
                    
                    // Visual feedback: pulse the sparkle button
                    const sparkle = document.getElementById('grammar-btn');
                    if (sparkle) {
                        sparkle.style.transform = 'scale(1.4)';
                        setTimeout(() => sparkle.style.transform = 'scale(1)', 400);
                    }
                    log(`[LiveFix] "${currentRaw}" → "${data.corrected}"`);
                }
            } catch (e) {
                // Silently skip live errors
            }
        }, 2000); // 2 second pause in typing triggers the check
    });

    // Text Input — Prevent double submission from Enter + Click
    textInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            sendMessage();
        }
    });
    sendBtn.addEventListener('click', (e) => {
        e.preventDefault();
        sendMessage();
    });

    // Manual Grammar Correction Button
    const grammarBtn = document.getElementById('grammar-btn');
    if (grammarBtn) {
        grammarBtn.addEventListener('click', async () => {
            const rawText = textInput.value.trim();
            if (!rawText || rawText.length < 3) return;
            
            grammarBtn.textContent = '⏳';
            grammarBtn.style.pointerEvents = 'none';
            
            try {
                const corr = await correctText(rawText, 'text');
                if (corr.changed) {
                    textInput.value = corr.corrected;
                    showCorrectionBadge(corr.corrections, 'manual');
                    log(`[ManualCorrection] "${rawText}" → "${corr.corrected}"`);
                }
            } catch (e) {
                log(`[ManualCorrection] Error: ${e.message}`);
            } finally {
                grammarBtn.textContent = '✨';
                grammarBtn.style.pointerEvents = 'auto';
            }
        });
    }

    // Auto-Correct Toggle Tooltip Update
    const autoCorrectCb = document.getElementById('auto-correct-cb');
    if (autoCorrectCb) {
        autoCorrectCb.addEventListener('change', () => {
            const active = autoCorrectCb.checked;
            log(`[AutoCorrect] Set to: ${active}`);
            _showNotification(active ? "Auto-correction enabled" : "Auto-correction disabled", active ? "#6c5ce7" : "#888");
        });
    }

    // Camera Toggle
    cameraBtn.addEventListener('click', toggleCamera);

    // New Chat (Clear session only — long-term memory is preserved)
    // Hold Shift while clicking to get the option to fully wipe ALL memory.
    const newChatBtn = document.getElementById('new-chat-btn');
    if (newChatBtn) {
        newChatBtn.title = 'New Chat (Shift+Click to also erase long-term memory)';
        newChatBtn.addEventListener('click', async (e) => {
            const wipeAll = e.shiftKey;

            if (wipeAll) {
                // SHIFT+Click: ask if they want to erase everything
                if (!confirm("⚠️ Wipe ALL memory?\n\nThis will permanently erase everything AURA knows about you (name, preferences, past conversations).\n\nClick OK to confirm, or Cancel to keep your memories.")) return;
            } else {
                // Normal click: just start a fresh session window
                if (!confirm("Start a new chat?\n\nAURA will still remember your name and past topics.\n\nTip: Hold Shift while clicking to also erase long-term memory.")) return;
            }

            try {
                const endpoint = wipeAll ? '/api/wipe-memory' : '/api/clear-history';
                const res = await fetch(endpoint, { method: 'POST' });
                const data = await res.json();

                if (data.status === 'success') {
                    document.getElementById('chat-history').innerHTML = '';
                    if (wipeAll) {
                        addMessage("🗑️ All memory wiped. I'm starting completely fresh — nice to meet you!", "aura");
                        log("[NewChat] Full memory wipe completed.");
                    } else {
                        addMessage("✨ New chat started! I still remember you from before. How can I help?", "aura");
                        log("[NewChat] Session cleared. Long-term memory preserved.");
                    }
                    if (avatar) avatar.playAnimation('happy');
                }
            } catch (err) {
                log(`[NewChat] Error: ${err.message}`);
                alert("Could not reset chat. Please try again.");
            }
        });
    }

    // Microphone Toggle (Click to Start/Stop Recording)
    const micBtn = document.getElementById('mic-btn');
    micBtn.addEventListener('click', toggleMicrophone);

    // Gesture Control
    const gestureBtn = document.getElementById('gesture-btn');
    const gestureMenu = document.getElementById('gesture-menu');

    gestureBtn.addEventListener('click', (e) => {
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
            const gesture = btn.dataset.gesture;
            triggerManualGesture(gesture);
            gestureMenu.classList.add('hidden');
        });
    });



    // ── Voice Selector Toggle ──────────────────────────────────────────
    const voiceBtn = document.getElementById('voice-btn');
    const voiceMenu = document.getElementById('voice-menu');

    if (voiceBtn && voiceMenu) {
        // Toggle menu on click
        voiceBtn.onclick = (e) => {
            e.stopPropagation();
            voiceMenu.classList.toggle('hidden');
            log("[UI] Voice menu toggled.");
        };

        // Close when clicking anywhere else on the document
        document.addEventListener('click', (e) => {
            if (!voiceBtn.contains(e.target) && !voiceMenu.contains(e.target)) {
                voiceMenu.classList.add('hidden');
            }
        });

        // Event Delegation for voice options
        // This is more robust as it handles buttons even if they were added dynamically
        voiceMenu.addEventListener('click', async (e) => {
            const btn = e.target.closest('.voice-option-btn');
            if (!btn) return;
            
            const lang = btn.dataset.lang;
            const tld = btn.dataset.tld;
            const name = btn.textContent;

            log(`[VoiceChange] Requesting: ${name} (${lang}, ${tld})`);
            _showNotification(`Accent set: ${name}`, '#6c5ce7');
            
            try {
                const res = await fetch('/api/set-voice', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ lang, tld })
                });
                const data = await res.json();
                if (data.status === "success") {
                    log(`[VoiceChange] Server confirmed: ${data.voice}`);
                }
            } catch (err) {
                log(`[VoiceChange] Failed: ${err.message}`);
            }
            
            voiceMenu.classList.add('hidden');
            if (avatar) avatar.playAnimation('happy');
        });
    }
}


function triggerManualGesture(gesture) {
    log(`Manual Gesture Triggered: ${gesture}`);

    const textInput = document.getElementById('text-input');
    const isTyping = textInput && (document.activeElement === textInput || textInput.value.trim().length > 0);

    // If system is busy (recording, processing, or AURA is talking) OR user is typing,
    // play the animation locally so the avatar still reacts, but DO NOT send a new API request.
    // Interruption logic: some gestures should stop AURA speech and trigger a new response
    const interruptionGestures = ['fist', 'thumbs_down', 'stop']; 
    if (isAuraTalking && interruptionGestures.includes(gesture)) {
        log(`[Gesture] INTERRUPTION manual gesture detected: ${gesture}`);
        if (window.currentAudio) {
            window.currentAudio.pause();
            window.currentAudio.currentTime = 0;
            window.currentAudio.dispatchEvent(new Event('ended')); // Clean up
        }
        // Fall through to normal path to send to backend
    } else if (isRecording || _inputLocked || isAuraTalking || isTyping) {
        log(`[Gesture] System busy or typing — playing animation locally for ${gesture}, skip API call.`);
        _playGestureAnimationOnly(gesture);
        
        if (isRecording || _lockSource === 'voice') {
            _showVoiceProcessingToast(gesture);
        }
        return;
    }

    // Normal path
    if (!acquireInputLock('gesture')) return;

    addMessage(`(Gesture: ${gesture})`, 'user');

    fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            text: "", 
            emotion: "neutral", 
            face_emotion: typeof cameraStream !== 'undefined' && cameraStream ? currentEmotion : "off", 
            gesture: gesture 
        })
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

// ── Text / Voice Correction ─────────────────────────────────────────────────
/**
 * Call the server-side correction endpoint.
 * Returns { corrected, original, changed, corrections[] } (or original on failure).
 */
async function correctText(raw, source = 'text') {
    try {
        const res = await fetch('/api/correct-text', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: raw, source })
        });
        if (!res.ok) return { corrected: raw, original: raw, changed: false, corrections: [] };
        return await res.json();
    } catch (e) {
        log(`[Correction] API error: ${e.message}`);
        return { corrected: raw, original: raw, changed: false, corrections: [] };
    }
}

/**
 * Show a subtle animated correction badge in the chat.
 * e.g.  ✏️ Corrected: "helo" → "hello"
 */
function showCorrectionBadge(corrections, source = 'text') {
    let label;
    if (corrections && corrections.length > 0) {
        const pairs = corrections.slice(0, 3).map(c => `"${c.original}" → "${c.corrected}"`).join(', ');
        label = `✏️ Auto-corrected: ${pairs}`;
    } else {
        label = source === 'voice' ? '✏️ Voice transcript corrected' : '✏️ Spelling corrected';
    }

    let badge = document.getElementById('correction-badge');
    if (!badge) {
        badge = document.createElement('div');
        badge.id = 'correction-badge';
        badge.style.cssText = [
            'position:fixed', 'bottom:100px', 'left:50%', 'transform:translateX(-50%) translateY(10px)',
            'background:linear-gradient(135deg,rgba(108,92,231,0.92),rgba(0,206,201,0.92))',
            'color:#fff', 'font-size:12px', 'font-weight:600',
            'padding:7px 18px', 'border-radius:24px', 'z-index:400',
            'pointer-events:none', 'opacity:0',
            'transition:opacity .3s ease,transform .3s ease',
            'box-shadow:0 4px 18px rgba(108,92,231,0.45)',
            'white-space:nowrap', 'max-width:90vw',
            'overflow:hidden', 'text-overflow:ellipsis',
            'font-family:inherit', 'letter-spacing:0.3px'
        ].join(';');
        document.body.appendChild(badge);
    }

    badge.textContent = label;
    badge.style.opacity = '0';
    badge.style.transform = 'translateX(-50%) translateY(10px)';
    badge.style.display = 'block';
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            badge.style.opacity = '1';
            badge.style.transform = 'translateX(-50%) translateY(0)';
        });
    });

    clearTimeout(badge._hideTimer);
    badge._hideTimer = setTimeout(() => {
        badge.style.opacity = '0';
        badge.style.transform = 'translateX(-50%) translateY(-8px)';
        setTimeout(() => { badge.style.display = 'none'; }, 350);
    }, 3500);
}
let lastSendTime = 0;
async function sendMessage() {
    // ── DEBOUNCE: Prevent near-simultaneous double-clicks/taps ────────────────
    const now = Date.now();
    if (now - lastSendTime < 300) return;
    lastSendTime = now;
    // ────────────────────────────────────────────────────────────────────────
    
    const input = document.getElementById('text-input');
    const rawText = input.value.trim();
    if (!rawText) return;

    if (_inputLocked && _lockSource === 'voice') {
        _showVoiceProcessingToast('text');
        return;
    }

    if (!acquireInputLock('text')) return;

    // ── Spell / grammar correction ──────────────────────────────────────────
    let displayText = filterBadWords(rawText);
    let sendText   = displayText;  // what actually goes to the LLM

    const autoCorrectEnabled = document.getElementById('auto-correct-cb')?.checked ?? true;
    if (autoCorrectEnabled) {
        try {
            const corr = await correctText(rawText, 'text');
            if (corr.changed) {
                sendText    = filterBadWords(corr.corrected);
                displayText = sendText;  // show corrected version in chat bubble
                showCorrectionBadge(corr.corrections, 'text');
                log(`[Correction] Text: "${rawText}" → "${corr.corrected}"`);
            }
        } catch (e) {
            log(`[Correction] Skipped (error): ${e.message}`);
        }
    }
    // ────────────────────────────────────────────────────────────────────────

    addMessage(displayText, 'user');
    input.value = '';
    input.disabled = true;

    const userEmotion = detectEmotionFromText(sendText);
    if (userEmotion !== "neutral" && avatar && avatar.showEmotion) {
        log(`User text emotion detected: ${userEmotion}`);
        avatar.showEmotion(userEmotion, 0.5, false);
    }

    // Interruption logic removed - now we queue sequentially
    /*
    if (currentAbortController) {
        log('[Text] Aborting background request — manual text takes priority.');
        currentAbortController.abort();
        currentAbortController = null;
    }
    */

    // Create new controller for this text request
    currentAbortController = new AbortController();

    try {
        const currentGesture = gestureHandler.lastGesture || "none";
        gestureHandler.lastGesture = "none"; // Clear immediately after consumption

        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: currentAbortController.signal,
            body: JSON.stringify({
                text: sendText,
                emotion: userEmotion,
                face_emotion: typeof cameraStream !== 'undefined' && cameraStream ? currentEmotion : "off",
                gesture: currentGesture
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
        // Slow down other processors before requesting audio to maximize success
        if (faceDetector) faceDetector.setSlowMode(true);
        if (gestureHandler) gestureHandler.pause();

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

        if (!audioStream || audioStream.getAudioTracks().length === 0) {
            throw new Error("No audio tracks found in stream.");
        }
        
        log("Microphone access granted! Track: " + audioStream.getAudioTracks()[0].label);

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
        audioStream.getTracks().forEach(track => {
            log(`Stopping mic track: ${track.label}`);
            track.stop();
        });
        audioStream = null;
    }
    
    // Restore processor speeds
    if (faceDetector) faceDetector.setSlowMode(false);
    if (gestureHandler) gestureHandler.resume();

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

    const currentGesture = gestureHandler.lastGesture || "none";
    gestureHandler.lastGesture = "none"; // Clear immediately after consumption

    const formData = new FormData();
    formData.append('file', audioBlob, `recording.${extension}`);
    // Include the live face-camera emotion so the server can fuse it with audio emotion
    const faceEmo = typeof cameraStream !== 'undefined' && cameraStream ? currentEmotion : "off";
    formData.append('face_emotion', faceEmo);
    formData.append('gesture', currentGesture);
    log(`[Voice] Sending ${(audioBlob.size / 1024).toFixed(1)}KB (${type}) with face_emotion: ${faceEmo}, gesture: ${currentGesture}`);

    // Interruption logic removed - now we queue sequentially
    /*
    if (currentAbortController) {
        log('[Voice] Aborting background request — manual voice takes priority.');
        currentAbortController.abort();
        currentAbortController = null;
    }
    */
    
    // Create new controller for this voice request
    currentAbortController = new AbortController();

    try {
        log("Sending audio to server...");
        const response = await fetch('/api/audio', {
            method: 'POST',
            body: formData,
            signal: currentAbortController.signal
        });

        if (!response.ok) {
            throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        log("Server response received.");

        if (data.input_text && data.input_text.trim()) {
            let heardText = filterBadWords(data.input_text.trim());

            // ── Grammar Correction on Voice Transcript ──
            const autoCorrectEnabled = document.getElementById('auto-correct-cb')?.checked ?? true;
            if (autoCorrectEnabled) {
                try {
                    const corr = await correctText(data.input_text.trim(), 'voice');
                    if (corr.changed) {
                        heardText = filterBadWords(corr.corrected);
                        data.input_text = heardText; // Update data so downstream works correctly
                        showCorrectionBadge(corr.corrections, 'voice');
                        log(`[VoiceCorrection] "${corr.original}" → "${corr.corrected}"`);
                    }
                } catch (e) {
                    log(`[VoiceCorrection] Skipped (error): ${e.message}`);
                }
            }
            // ──────────────────────────────────────────

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
    if (!data || !data.text) return;

    // ── LAYER 1: DEDUPLICATION FILTER (5-SECOND WINDOW) ──────────────────────────────
    // Immediately discard word-for-word identical responses received within 5 seconds.
    // This must happen BEFORE addMessage() to prevent duplicate bubbles.
    const now = Date.now();
    if (data.text === lastResponseText && (now - lastResponseTime < 5000)) {
        log('[Queue] 🛡️ Blocked identical duplicate response (History Guard).');
        return;
    }

    // ── LAYER 2: QUEUE SANITIZATION ──────────────────────────────────────────
    // If she is already talking, check if this exact text is already waiting in the queue.
    if (isAuraTalking && data.audio_url) {
        if (interactionQueue.some(item => item.text === data.text)) {
            log('[Queue] 🛡️ Discarded duplicate text already waiting in line.');
            return;
        }

        if (interactionQueue.length < 3) {
            log('[Queue] Aura is talking — adding unique response to queue.');
            interactionQueue.push(data);
        } else {
            log('[Queue] ⚠️ Queue full. Discarding overflow.');
            releaseInputLock();
        }
        return;
    }

    // SUCCESS: This is a fresh, unique response.
    lastResponseText = data.text;
    lastResponseTime = now;

    if (data.text.trim().length > 0) {
        addMessage(data.text, 'aura', data.audio_url, data.face_animation);
    }

    // Show the detected emotion on the avatar's face immediately
    const responseEmotion = data.emotion || "neutral";
    log(`Response emotion: ${responseEmotion}`);

    // ── BODY ANIMATION PRIORITY ──────────────────────────────────────────────
    // Priority: Explicit animation list (from gestures/keywords) -> Generic Emotion
    if (data.animations && data.animations.length > 0 && avatar) {
        const animToPlay = data.animations[0];
        
        // ── AVOID REDUNDANT RESTARTS ──
        // Only skip if it's a looping animation (like idle) already playing.
        // For one-shots (loopOnce=true), we SHOULD allow a restart if the user triggers it again.
        const isLoopingAlready = avatar.currentAction && 
                                 avatar.animations[animToPlay] === avatar.currentAction &&
                                 avatar.currentAction.loop !== THREE.LoopOnce &&
                                 avatar.currentAction.isRunning();

        if (!isLoopingAlready) {
            log(`Response animations: ${data.animations.join(', ')}`);
            const nonIdle = data.animations.filter(a => a !== 'idle');
            if (nonIdle.length > 0) {
                if (avatar.playSequence) {
                    avatar.playSequence(nonIdle, () => {
                        avatar.playAnimation('idle');
                    });
                } else {
                    avatar.playAnimation(nonIdle[0], true);
                }
            } else if (avatar.transitionToEmotion) {
                avatar.transitionToEmotion(responseEmotion, 400, true);
            }
        }
    } else if (avatar && avatar.transitionToEmotion) {
        avatar.transitionToEmotion(responseEmotion, 400, true);
    }

    if (!data) return;

    // Play Audio (Logic continues below as this response passed all filters)

    // Play Audio
    if (data.audio_url) {
        lastResponseText = data.text; // Ensure we track this for deduplication
        
        // Update the last aura message in chat to have this audio URL attached
        const lastAuraMsg = document.querySelector('.message.aura:last-child');
        if (lastAuraMsg && !lastAuraMsg.dataset.audio) {
            lastAuraMsg.dataset.audio = data.audio_url;
            lastAuraMsg.title = "Click to replay";
            lastAuraMsg.style.cursor = "pointer";
        }
        // Clear any queued emotion animations when starting to talk
        if (avatar && avatar.clearEmotionQueue) {
            avatar.clearEmotionQueue();
        }

        // ── SINGLETON AUDIO ENFORCEMENT REMOVED - NOW WE QUEUE ──
        // (Previously we called stopAuraSpeech() here, now we don't)

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
            lastSpeechEndTime = Date.now(); // Start the lockout period
            emotionCooldown = Date.now() + 1000; // Extra buffer
            lastTriggeredEmotion = null;
            log('[Guard] AURA finished talking — lockout started (2s).');
            avatar.setTalking(false);
            stopFaceSync();
            window.currentAudio = null;
            _resetMicBtn();
            // ── Release InputLock after audio finishes ──
            releaseInputLock();
            log('Audio playback finished.');

            // ── PROCESS NEXT ITEM IN QUEUE ──
            if (interactionQueue.length > 0) {
                log(`[Queue] Playing next response (${interactionQueue.length} left)`);
                const nextData = interactionQueue.shift();
                setTimeout(() => handleResponse(nextData), 600); // 0.6s gap for realism
            }
        };
    } else {
        // No audio payload (e.g., pure visual gesture feedback).
        // Trigger any custom animations if returned explicitly.
        if (data.animations && data.animations.length > 0 && avatar && avatar.playAnimation) {
            avatar.playAnimation(data.animations[0], true);
        }
        _resetMicBtn();
        releaseInputLock();
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


function addMessage(text, type, audioUrl = null, faceAnim = null) {
    const history = document.getElementById('chat-history');
    const container = document.getElementById('chat-container');
    if (!history) return;

    const div = document.createElement('div');
    div.className = `message ${type}`;
    div.textContent = text;
    
    // ── REPLAY FEATURE ──────────────────────────────────────────────────────
    if (type === 'aura' && audioUrl) {
        div.dataset.audio = audioUrl;
        if (faceAnim) div._auraAnim = faceAnim; // Store for replay
        div.title = "Click to replay";
        div.style.cursor = "pointer";
    }

    // Click handler for AURA's messages
    if (type === 'aura') {
        div.addEventListener('click', () => {
            const url = div.dataset.audio;
            const anim = div._auraAnim;
            if (url) {
                log(`[Replay] Clicking to replay: ${url}`);
                // Replay logic: we treat this like a "Mini Response"
                // But we don't send to backend, just play the audio & move mouth
                const replayData = { 
                    text: div.textContent, 
                    audio_url: url,
                    face_animation: anim 
                };
                
                // If she is currently talking, stop her first so user can hear the replay
                if (isAuraTalking) stopAuraSpeech();
                
                handleResponse(replayData);
            }
        });
    }

    history.appendChild(div);
    
    // ── STABLE AUTO-SCROLL ──────────────────────────────────────────────────
    // Use scrollIntoView on the new message for guaranteed accuracy.
    // Wrap in try-catch to prevent a failing scroll from crashing the entire app.
    setTimeout(() => {
        try {
            if (div && typeof div.scrollIntoView === 'function') {
                div.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } else {
                // Standard fallback if scrollIntoView is unavailable
                const container = document.getElementById('chat-container');
                if (container) container.scrollTop = container.scrollHeight;
            }
        } catch (e) {
            console.warn("[ScrollFix] Native scroll failed, using fallback:", e);
            const container = document.getElementById('chat-container');
            if (container) container.scrollTop = container.scrollHeight;
        }
    }, 100);
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

            if (avatar && avatar.showEmotion && emotion !== 'neutral') {
                avatar.showEmotion(emotion, Math.min(confidence * 1.5, 1.0), true);
                log(`[FaceEmotion] 🎭 Face→Avatar: ${emotion} (body anim: true)`);
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
            // Silently skip AI-processing if she is talking, recording, or thinking.
            // Visual mimicry (avatar.showEmotion) still happens because it's called above the lockout.
            const lockoutElapsed = Date.now() - lastSpeechEndTime;
            if (isAuraTalking || isRecording || _inputLocked || (lockoutElapsed < 1200)) {
                return;
            }

            if (emotion !== 'neutral' && confidence > 0.20 && (now - emotionCooldown > 2500)) {
                if (emotion === lastTriggeredEmotion) {
                    if (now - emotionStartTime > 700) {
                        log(`[FaceEmotion] Sustained: ${emotion} (${pct}%) → Triggering reaction`);
                        triggerEmotionReaction(emotion);
                        emotionCooldown = now;
                        lastTriggeredEmotion = null;
                    }
                } else {
                    lastTriggeredEmotion = emotion;
                    emotionStartTime = now;
                    
                    // ── QUICK REACTION FOR EMOTION SHIFT ──
                    // If the user's emotion CHANGES (e.g. Happy -> Surprised), 
                    // we trigger a new reaction much faster (after 1s) to feel dynamic.
                    if (now - emotionCooldown > 1000) {
                        log(`[FaceEmotion] Sudden Shift Detected: ${emotion} → Instant Reaction`);
                        triggerEmotionReaction(emotion);
                        emotionCooldown = now;
                    }
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

                // ─ Emotion updated ─
                return;
            }

            // Face detected
            video.style.border = '3px solid #00ff88';
            video.style.boxShadow = '0 0 18px #00cc66';
            _updateEmotionBar(scores);
        });
    }

    // Start the face-api.js detection loop on the video element
    faceDetector.start(video);
    log('[FaceEmotion] Face emotion detector started ✅');
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
    point: ['happy'],          // Thinking/Point
    horns: ['dance'],          // 🤘
    call_me: ['happy'],        // 🤙
    thumbs_down: ['sad'],      // 👎
    ok: ['happy'],             // 👌
    iloveyou: ['pray'],        // 🤟
    vulcan: ['jump'],          // 🖖
    open_palm: ['happy'],      // 🖐️ Open Palm
    neutral: ['idle'],         // Idle
};

/**
 * Trigger a status-bar pulse when a sustained face emotion is confirmed.
 * Body animations + face blendshapes are already driven continuously by
 * showEmotion(triggerAnimation=true) in the onEmotion callback above.
 * This function is left as a lightweight "confirmed emotion" signal only.
 */
function triggerEmotionReaction(emotion) {
    log(`[FaceEmotion] ✅ Sending response trigger: ${emotion}`);

    // Pulse the status bar
    const statusSpan = document.getElementById('current-emotion');
    if (statusSpan) {
        const orig = statusSpan.style.color;
        statusSpan.style.color = '#f9ca24'; // bright gold
        statusSpan.style.fontWeight = 'bold';
        setTimeout(() => {
            statusSpan.style.color = orig;
            statusSpan.style.fontWeight = '';
        }, 1500);
    }

    // Interruption logic removed - now we queue sequentially
    /*
    if (isAuraTalking || _inputLocked) {
        stopAuraSpeech();
        interruptInputLock();
    }
    */

    // Capture the current camera state as a chat request
    if (!acquireInputLock('emotion')) return;

    const currentGesture = gestureHandler.lastGesture || "none";
    gestureHandler.lastGesture = "none"; // Clear after use

    // Create a new controller so we can track this request
    currentAbortController = new AbortController();

    fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: currentAbortController.signal,
        body: JSON.stringify({
            text: "",
            emotion: "neutral",
            face_emotion: emotion,
            gesture: currentGesture
        })
    })
    .then(r => r.json())
    .then(data => {
        currentAbortController = null;
        handleResponse(data);
    })
    .catch(e => {
        if (e.name === 'AbortError') {
            log('[FaceEmotion] Request aborted (singleton logic bypassed)');
        } else {
            log(`[FaceEmotion] Error triggering response: ${e.message}`);
            releaseInputLock();
        }
        currentAbortController = null;
    });
}

// End of AURA Main logic

