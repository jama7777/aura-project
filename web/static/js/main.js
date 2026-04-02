import * as THREE from 'three';
import { Avatar } from './avatar.js?v=48';
import { FaceEmotionDetector } from './face_emotion.js';

const avatar = new Avatar();
window.avatar = avatar; // Debugging
let currentEmotion = "off";

// Emotion Trigger State
let lastTriggeredEmotion = null;
let emotionStartTime = 0;
let emotionCooldown = 0;

// Coding Workspace State
let editor = null;
let currentCode = ""; 
let selectedCompany = "General"; // Dashboard State

// ── MONACO EDITOR CONFIG ───────────────────────────────────────────────────
function initMonaco() {
    if (editor) return;
    const container = document.getElementById('monaco-container');
    if (!container) {
        log("[Monaco] Error: Container not found!");
        return;
    }

    log("[Monaco] Loading dependencies...");
    if (typeof require === 'undefined') {
        log("[Monaco] Error: require.js loader not found. Check index.html head.");
        return;
    }

    require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs' } });
    require(['vs/editor/editor.main'], function () {
        try {
            editor = monaco.editor.create(container, {
                value: [
                    '# Type your interview code here',
                    'def solution(arr):',
                    '    # AURA will see your progress when you "Sync"',
                    '    return sorted(arr)',
                    '',
                    'print(solution([3, 1, 4]))'
                ].join('\n'),
                language: 'python',
                theme: 'vs-dark',
                fontSize: 14,
                automaticLayout: true,
                minimap: { enabled: false },
                roundedSelection: true,
                scrollBeyondLastLine: false,
                padding: { top: 20 },
                fontFamily: "'Fira Code', 'Cascadia Code', monospace"
            });
            log("[Monaco] SUCCESS: Editor initialized.");

            // Sync button logic
            const syncBtn = document.getElementById('sync-code-btn');
            if (syncBtn) {
                syncBtn.addEventListener('click', () => {
                    log("[Monaco] Sync button clicked.");
                    currentCode = editor.getValue();
                    _showNotification("Code Synced with AURA", "#6c5ce7");
                    
                    // Trigger a sync message if in interview mode
                    const modeCb = document.getElementById('mode-cb');
                    if (modeCb && modeCb.checked) {
                        triggerCodeSyncChat();
                    }
                });
            }

            // Language selector logic
            const langSelect = document.getElementById('code-lang-select');
            if (langSelect) {
                langSelect.addEventListener('change', () => {
                    const lang = langSelect.value;
                    monaco.editor.setModelLanguage(editor.getModel(), lang);
                    log(`[Monaco] Language changed to: ${lang}`);
                });
            }

            // Run button (Visual Feedback)
            const runBtn = document.getElementById('run-code-btn');
            const statusText = document.getElementById('code-status');
            if (runBtn) {
                runBtn.addEventListener('click', () => {
                    runBtn.textContent = 'Running...';
                    statusText.textContent = 'Executing locally...';
                    setTimeout(() => {
                        runBtn.textContent = 'Run Code';
                        statusText.textContent = 'Execution complete (Local Mock).';
                        _showNotification("Local Execution Complete", "#00ff88");
                    }, 1000);
                });
            }
        } catch (err) {
            log(`[Monaco] Critical Init Error: ${err.message}`);
        }
    });
}

function triggerCodeSyncChat() {
    if (!acquireInputLock('text')) return;
    const meta = getInterviewMetadata();
    
    log("[Monaco] Triggering sync chat message...");
    fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            text: "I've updated my code in the IDE. Can you take a look?",
            code: editor.getValue(),
            language: document.getElementById('code-lang-select').value,
            mode: meta.mode,
            level: meta.level,
            company: meta.company,
            domain: meta.domain
        })
    })
    .then(r => r.json())
    .then(data => handleResponse(data))
    .catch(e => {
        log(`Error syncing code: ${e.message}`);
        releaseInputLock();
    });
}

// ── INPUT LOCK (MUTEX) ───────────────────────────────────────────────────────
let _inputLocked = false;   // true = a request is already in flight
let _lockSource = null;    // ('text'|'voice'|'gesture'|'emotion')

function acquireInputLock(source) {
    if (_inputLocked) {
        if ((source === 'text' || source === 'voice') && _lockSource === 'emotion') {
            log(`[InputLock] 🔓 Manual "${source}" bypassing background "emotion" lock.`);
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
    isAuraTalking = false;
    lastTriggeredEmotion = null;
    emotionStartTime = Date.now();
    emotionCooldown = Date.now();
    _hideProcessingIndicator();
}

function _showProcessingIndicator(source) {
    let badge = document.getElementById('input-lock-badge');
    if (!badge) {
        badge = document.createElement('div');
        badge.id = 'input-lock-badge';
        badge.style.cssText = 'position:absolute;top:8px;left:50%;transform:translateX(-50%);background:rgba(108,92,231,0.85);color:#fff;font-size:12px;padding:4px 14px;border-radius:20px;z-index:200;pointer-events:none;transition:opacity .3s;font-weight:600;letter-spacing:0.5px;box-shadow:0 2px 12px rgba(108,92,231,0.6)';
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

function _showBusyHint(source) {
    let hint = document.getElementById('input-busy-hint');
    if (!hint) {
        hint = document.createElement('div');
        hint.id = 'input-busy-hint';
        hint.style.cssText = 'position:absolute;top:40px;left:50%;transform:translateX(-50%);background:rgba(255,68,68,0.85);color:#fff;font-size:11px;padding:3px 12px;border-radius:16px;z-index:200;pointer-events:none;transition:opacity .4s';
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
let currentAbortController = null;
window._setAuraTalking = (v) => { isAuraTalking = v; };

function stopAuraSpeech() {
    if (window.currentAudio) {
        window.currentAudio.pause();
        window.currentAudio.src = "";
        window.currentAudio = null;
    }
    isAuraTalking = false;
    if (window.avatar) {
        window.avatar.setTalking(false);
        window.avatar.resetFace();
    }
    stopFaceSync();
}

function _showNotification(message, color = "#6c5ce7") {
    let toast = document.getElementById('aura-notification');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'aura-notification';
        toast.style.cssText = 'position:fixed;top:20px;right:20px;padding:12px 24px;border-radius:12px;color:white;font-weight:600;z-index:9999;transition:all 0.4s;box-shadow:0 10px 30px rgba(0,0,0,0.3);font-size:14px;display:none;opacity:0';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.backgroundColor = color;
    toast.style.display = 'block';
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
    });
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.style.display = 'none', 400);
    }, 3000);
}

// ========== MICROPHONE & RECORDING ==========
let isRecording = false;
let mediaRecorder = null;
let recordedChunks = [];
let audioStream = null;

function log(msg) { console.log('[AURA]', msg); }

document.addEventListener('DOMContentLoaded', async () => {
    avatar.init();
    await loadFaceAPI();
    initInterviewUI();
    setupEventListeners();
});

async function loadFaceAPI() {
    try {
        await faceapi.nets.tinyFaceDetector.loadFromUri('/face-models');
        await faceapi.nets.faceExpressionNet.loadFromUri('/face-models');
    } catch (e) {
        const cdn = 'https://justadudewhohacks.github.io/face-api.js/models';
        await faceapi.nets.tinyFaceDetector.loadFromUri(cdn);
        await faceapi.nets.faceExpressionNet.loadFromUri(cdn);
    }
}

function setupEventListeners() {
    const textInput = document.getElementById('text-input');
    const sendBtn = document.getElementById('send-btn');
    const cameraBtn = document.getElementById('camera-btn');
    const micBtn = document.getElementById('mic-btn');

    textInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(); });
    sendBtn.addEventListener('click', sendMessage);
    cameraBtn.addEventListener('click', toggleCamera);
    micBtn.addEventListener('click', toggleMicrophone);

    // ── Code Panel Toggle ───────────────────────────────────────────────────
    const codeBtn = document.getElementById('code-toggle-btn');
    const closeCodeBtn = document.getElementById('close-code-panel');
    const codePanel = document.getElementById('code-panel');

    if (codeBtn && codePanel) {
        codeBtn.addEventListener('click', () => {
            const currentRight = window.getComputedStyle(codePanel).right;
            const isOpen = currentRight === '0px';
            codePanel.style.right = isOpen ? '-45%' : '0px';
            if (!isOpen) {
                _showNotification("Coding Workspace Opened", "#6c5ce7");
                if (!editor) initMonaco();
            }
        });
    }
    if (closeCodeBtn && codePanel) {
        closeCodeBtn.addEventListener('click', () => { codePanel.style.right = '-45%'; });
    }

    // New Chat Clear
    const newChatBtn = document.getElementById('new-chat-btn');
    if (newChatBtn) {
        newChatBtn.addEventListener('click', async () => {
            if (!confirm("Start a new chat?")) return;
            await fetch('/api/clear-history', { method: 'POST' });
            document.getElementById('chat-history').innerHTML = '';
            _showNotification("Chat Reset", "#6c5ce7");
        });
    }
}

// ── INTERVIEW MODE & DASHBOARD HELPERS ────────────────────────────────────
function initInterviewUI() {
    const modeCb = document.getElementById('mode-cb');
    const modeIcon = document.getElementById('mode-icon');
    const interviewOverlay = document.getElementById('interview-overlay');
    const cancelBtn = document.getElementById('cancel-interview-btn');
    const launchBtn = document.getElementById('launch-interview-btn');
    const companyCards = document.querySelectorAll('.company-card');
    const uploadDashBtn = document.getElementById('upload-resume-dash-btn');
    const resumeInput = document.getElementById('resume-upload');

    if (modeCb && interviewOverlay) {
        modeCb.addEventListener('change', () => {
            const isInterview = modeCb.checked;
            modeIcon.textContent = isInterview ? '👔' : '🏠';
            updateUILayout(isInterview);
            
            if (isInterview) {
                interviewOverlay.style.display = 'flex';
                requestAnimationFrame(() => interviewOverlay.style.opacity = '1');
            } else {
                interviewOverlay.style.opacity = '0';
                setTimeout(() => interviewOverlay.style.display = 'none', 500);
            }
        });
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            modeCb.checked = false;
            modeCb.dispatchEvent(new Event('change'));
        });
    }

    if (launchBtn) {
        launchBtn.addEventListener('click', () => {
            interviewOverlay.style.opacity = '0';
            setTimeout(() => interviewOverlay.style.display = 'none', 500);
            _showNotification(`Entering ${selectedCompany} Mock`, "#00ff88");
            triggerInterviewStart();
        });
    }

    companyCards.forEach(card => {
        card.addEventListener('click', () => {
            companyCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            selectedCompany = card.getAttribute('data-value');
        });
    });

    if (uploadDashBtn && resumeInput) {
        uploadDashBtn.addEventListener('click', () => resumeInput.click());
        resumeInput.addEventListener('change', handleResumeUpload);
    }

    // Voice Speed Control
    const speedSlider = document.getElementById('tts-speed');
    const speedDisplay = document.getElementById('speed-value');
    if (speedSlider && speedDisplay) {
        speedSlider.addEventListener('input', () => {
            const val = parseFloat(speedSlider.value).toFixed(1);
            speedDisplay.textContent = `${val}x`;
        });
    }
}

async function handleResumeUpload() {
    const resumeInput = document.getElementById('resume-upload');
    if (resumeInput.files.length === 0) return;
    const formData = new FormData();
    formData.append('file', resumeInput.files[0]);
    try {
        const res = await fetch('/api/upload-resume', { method: 'POST', body: formData });
        if (res.ok) {
            _showNotification("Resume Uploaded!", "#4caf50");
            if (avatar) avatar.playAnimation('clap');
        }
    } catch (err) { log(`Upload error: ${err.message}`); }
    resumeInput.value = '';
}

function getInterviewMetadata() {
    return {
        mode: document.getElementById('mode-cb')?.checked ? "interview" : "normal",
        level: document.getElementById('level-select-dashboard')?.value || "mid",
        company: selectedCompany || "General",
        domain: document.getElementById('domain-select-dashboard')?.value || "Software Engineer"
    };
}

async function triggerInterviewStart() {
    if (!acquireInputLock('text')) return;
    const meta = getInterviewMetadata();
    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: `I want to start a mock interview for a ${meta.level}-level ${meta.domain} position at ${meta.company}.`,
                mode: meta.mode,
                level: meta.level,
                company: meta.company,
                domain: meta.domain
            })
        });
        const data = await response.json();
        handleResponse(data);
    } catch (e) { releaseInputLock(); }
}

async function sendMessage() {
    const input = document.getElementById('text-input');
    const rawText = input.value.trim();
    if (!rawText || _inputLocked) return;
    if (!acquireInputLock('text')) return;

    addMessage(rawText, 'user');
    input.value = '';

    const meta = getInterviewMetadata();
    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: rawText,
                mode: meta.mode,
                level: meta.level,
                company: meta.company,
                domain: meta.domain,
                code: editor ? editor.getValue() : ""
            })
        });
        const data = await response.json();
        handleResponse(data);
    } catch (e) { releaseInputLock(); }
}

function handleResponse(data) {
    if (!data || !data.text) { releaseInputLock(); return; }
    addMessage(data.text, 'aura');
    if (avatar && data.emotion) avatar.showEmotion(data.emotion);
    
    // Play Face Animation (Lip Sync) if present
    if (avatar && data.face_animation) {
        if (typeof avatar.playFaceAnimation === 'function') {
            avatar.playFaceAnimation(data.face_animation);
        } else {
            console.warn("[AURA] playFaceAnimation method not found on avatar. Check avatar.js version.");
        }
    }
    
    // Play sound if present (assuming speak endpoint or base64)
    if (data.audio_url) {
        try {
            const audio = new Audio(data.audio_url);
            window.currentAudio = audio;
            const speed = document.getElementById('tts-speed')?.value || 1.0;
            audio.playbackRate = speed;
            audio.onended = () => {
                console.log("[AURA] Audio playback finished.");
                releaseInputLock();
            };
            audio.play().catch(err => {
                console.error("[AURA] Audio playback failed:", err);
                releaseInputLock();
            });
            if (avatar) avatar.setTalking(true);
        } catch (err) {
            console.error("[AURA] Error creating Audio object:", err);
            releaseInputLock();
        }
    } else {
        releaseInputLock();
    }
}

function addMessage(text, role) {
    const container = document.getElementById('chat-history');
    const div = document.createElement('div');
    div.className = `chat-bubble ${role}`;
    div.textContent = text;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

// Camera & Mic logic
async function toggleCamera() {
    const video = document.getElementById('user-camera');
    const dot = document.getElementById('face-status-dot');
    const statusText = document.querySelector('#face-status span:last-child');

    if (video.classList.contains('hidden')) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            video.srcObject = stream;
            video.classList.remove('hidden');
            if (dot) dot.style.background = '#00ff88';
            if (statusText) statusText.textContent = 'Live • Tracking';
            _showNotification("Camera Enabled", "#00ff88");
        } catch (e) {
            log(`Camera Error: ${e.message}`);
            _showNotification("Camera Access Denied", "#f44336");
        }
    } else {
        if (video.srcObject) {
            video.srcObject.getTracks().forEach(t => t.stop());
            video.srcObject = null;
        }
        video.classList.add('hidden');
        if (dot) dot.style.background = '#888';
        if (statusText) statusText.textContent = 'Camera Off';
        _showNotification("Camera Disabled", "#888");
    }
}

async function toggleMicrophone() {
    const micBtn = document.getElementById('mic-btn');
    if (isRecording) {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
        isRecording = false;
        micBtn.style.color = 'white';
        micBtn.style.boxShadow = 'none';
        micBtn.classList.remove('recording-active');
        _showNotification("Recording Stopped", "#6c5ce7");
    } else {
        if (_inputLocked) {
            _showNotification("AURA is still thinking...", "#ff4757");
            return;
        }
        if (!acquireInputLock('voice')) return;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            recordedChunks = [];

            mediaRecorder.ondataavailable = e => {
                if (e.data.size > 0) recordedChunks.push(e.data);
            };

            mediaRecorder.onstop = async () => {
                micBtn.style.color = 'white';
                micBtn.classList.remove('recording-active');
                
                const blob = new Blob(recordedChunks, { type: 'audio/webm' });
                if (blob.size < 1000) { // filter out accidental clicks
                    releaseInputLock();
                    return;
                }

                _showNotification("Processing Voice...", "#00ff88");
                const formData = new FormData();
                formData.append('audio', blob);

                try {
                    const res = await fetch('/api/voice-chat', { method: 'POST', body: formData });
                    const data = await res.json();
                    handleResponse(data);
                } catch (err) {
                    log(`Voice Upload Error: ${err.message}`);
                    releaseInputLock();
                }
            };

            mediaRecorder.start();
            isRecording = true;
            micBtn.style.color = '#ff4757';
            micBtn.classList.add('recording-active');
            _showNotification("Listening...", "#ff4757");
        } catch (e) {
            log(`Mic Error: ${e.message}`);
            _showNotification("Microphone Access Denied", "#f44336");
            releaseInputLock();
        }
    }
}

function filterBadWords(t) { return t; } 
function stopFaceSync() {} 

function updateUILayout(isInterview) {
    const newChatBtn = document.getElementById('new-chat-btn');
    const voiceBtn = document.querySelector('.voice-control-wrapper');
    if (newChatBtn) {
        newChatBtn.style.display = isInterview ? 'none' : 'flex';
    }
    if (voiceBtn) {
        voiceBtn.style.display = isInterview ? 'none' : 'block';
    }
}
