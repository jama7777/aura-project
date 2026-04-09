/**
 * AURA - Main Application Logic
 * Integrates Chat, Voice, Emotion Detection and 3D Avatar
 */

let avatar = null;
let currentInterviewMeta = { mode: 'normal', level: 'mid', company: 'General', domain: 'Software Engineer' };
let selectedCompany = 'General';
let _inputLocked = false;

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initialize Avatar
    if (typeof AuraAvatar === 'function') {
        avatar = new AuraAvatar('canvas-container');
        avatar.init();
    }

    // 2. Initialize UI Components
    initChatUI();
    initInterviewUI();
    initVoiceSelector();
    
    // Wait for face-api.js to load before initializing detector
    if (typeof faceapi !== 'undefined') {
        console.log('[Init] faceapi detected, initializing detector');
        initFaceDetector();
    } else {
        console.log('[Init] faceapi not loaded yet, waiting...');
        const checkFaceAPI = setInterval(() => {
            if (typeof faceapi !== 'undefined') {
                clearInterval(checkFaceAPI);
                console.log('[Init] faceapi now loaded, initializing detector');
                initFaceDetector();
            }
        }, 500);
    }
    
    initCodeEditor();
    
    // Auto-resume audio on any interaction to prevent browser silencing
    document.addEventListener('mousedown', () => {
        if (_audioCtx && _audioCtx.state === 'suspended') {
            log('Resuming AudioContext on interaction...');
            _audioCtx.resume();
        }
    }, { once: false });
    
    // 3. Welcome Message (Delayed)
    setTimeout(() => {
        _showNotification("AURA System Online", "#00ff88");
        addMessage("Hello! I am AURA. I can help you with your interview preparation. How can I assist you today?", 'aura');
    }, 1500);
});

// ── UI HELPERS ────────────────────────────────────────────────────────────
function _showNotification(text, color = "#6c5ce7") {
    const note = document.createElement('div');
    note.className = 'status-notification';
    note.style.borderLeftColor = color;
    // HIDDEN WEBCAM FOR DETECTION: Must have real dimensions for face-api.js to process frames
    if (!document.getElementById('webcam-video')) {
        const video = document.createElement('video');
        video.id = 'webcam-video';
        video.autoplay = true;
        video.muted = true;
        video.playsInline = true;
        video.width = 320;
        video.height = 240;
        video.style.position = 'fixed';
        video.style.top = '-9999px';
        video.style.left = '-9999px';
        video.style.width = '320px';
        video.style.height = '240px';
        video.style.opacity = '0';
        video.style.pointerEvents = 'none';
        document.body.appendChild(video);
    }
    note.innerHTML = `<span style="color:${color}; font-weight:bold; margin-right:8px;">●</span> ${text}`;
    document.body.appendChild(note);
    setTimeout(() => note.style.opacity = '1', 10);
    setTimeout(() => {
        note.style.opacity = '0';
        setTimeout(() => note.remove(), 500);
    }, 3000);
}

function log(msg) { console.log(`[AURA] ${msg}`); }

function acquireInputLock(source) {
    if (_inputLocked) {
        log(`Input locked by ${_lockSource}, rejecting ${source}`);
        return false;
    }
    _inputLocked = true;
    _lockSource = source;
    log(`Input locked by ${source}`);
    return true;
}

function releaseInputLock() {
    log(`Input released from ${_lockSource}`);
    _inputLocked = false;
    _lockSource = null;
    
    // Process queued system message if exists
    if (_pendingSystemMessage) {
        const msg = _pendingSystemMessage;
        _pendingSystemMessage = null;
        log(`Processing queued system message: ${msg.substring(0, 30)}...`);
        // Small delay so she doesn't start instantly/unnaturally
        setTimeout(() => {
            if (!_inputLocked) sendMessage(null, msg);
        }, 1200);
    }
    document.getElementById('mic-btn').classList.remove('pulse');
    document.getElementById('mic-btn').classList.remove('recording-active');
    document.getElementById('mic-btn').style.color = 'white';
    document.getElementById('send-btn').style.opacity = "1";
}

// ── CHAT UI LOGIC ─────────────────────────────────────────────────────────
function initChatUI() {
    const sendBtn = document.getElementById('send-btn');
    const textInput = document.getElementById('text-input');
    const micBtn = document.getElementById('mic-btn');

    if (sendBtn && textInput) {
        sendBtn.addEventListener('click', sendMessage);
        textInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });
    }

    if (micBtn) {
        micBtn.addEventListener('click', toggleMicrophone);
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
    
    // Resume logic
    const uploadDashBtn = document.getElementById('upload-resume-dash-btn');
    const resumeInput = document.getElementById('resume-upload');

    if (modeCb && interviewOverlay) {
        modeCb.addEventListener('change', () => {
            const isInterview = modeCb.checked;
            modeIcon.textContent = isInterview ? '👔' : '🏠';
            const modeText = document.getElementById('mode-text');
            if (modeText) modeText.textContent = isInterview ? 'Interview Mode' : 'Home Mode';
            
            if (isInterview) {
                interviewOverlay.style.display = 'flex';
                requestAnimationFrame(() => interviewOverlay.style.opacity = '1');
            } else {
                currentInterviewMeta.mode = 'normal';
                interviewOverlay.style.opacity = '0';
                setTimeout(() => interviewOverlay.style.display = 'none', 500);
                
                // Exit interview mode: unlock avatar position
                if (avatar) {
                    avatar.setEnvironmentMode(false);
                    avatar.playAnimation(avatar.defaultIdleAnimation);
                }
            }
        });
    }

    // Camera Toggle Logic
    const cameraBtn = document.getElementById('camera-btn');
    if (cameraBtn) {
        cameraBtn.addEventListener('click', toggleCamera);
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            modeCb.checked = false;
            interviewOverlay.style.opacity = '0';
            setTimeout(() => interviewOverlay.style.display = 'none', 500);
            modeIcon.textContent = '🏠';
            const modeText = document.getElementById('mode-text');
            if (modeText) modeText.textContent = 'Home Mode';
            currentInterviewMeta.mode = 'normal';
            // Reset AURA back to standing idle
            if (avatar) {
                avatar.defaultIdleAnimation = 'idle';
                avatar.setIdleAnimation('idle');
                avatar.setEnvironmentMode(false); // Hide desk/chair
            }
        });
    }

    // MAIN INTERVIEW START HANDLER
    if (launchBtn) {
        launchBtn.addEventListener('click', async () => {
            const company = document.getElementById('setup-company').value;
            const domain = document.getElementById('setup-domain').value;
            const level = document.getElementById('setup-level').value;
            
            // 1. Apply voice selection from Dashboard
            const voiceVal = document.getElementById('setup-voice')?.value || 'en-com';
            const [lang, tld] = voiceVal.split('-');
            try {
                await fetch('/api/set-voice', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ lang, tld })
                });
            } catch(e) { console.error("Could not set voice", e); }

            // 2. Update Global Metadata
            currentInterviewMeta = {
                mode: 'interview',
                level,
                company,
                domain
            };

            // 3. Hide Dashboard & Sync UI (Fade duration reduced for snapiness)
            interviewOverlay.style.opacity = '0';
            setTimeout(() => {
                interviewOverlay.style.display = 'none';
                _showNotification(`Interview Mode: ${company} – ${domain}`, '#88ccff');

                // 4. AURA sits down (starts instantly)
                if (avatar) {
                    avatar.defaultIdleAnimation = 'sitting';
                    avatar.setIdleAnimation('sitting');
                    avatar.setEnvironmentMode(true); 
                }

                // 5. Parallel initialization: Camera + AI Start
                if (!isCameraActive) {
                    toggleCamera().catch(e => log(`Camera Error: ${e.message}`));
                }

                // 6. Start conversation IMMEDIATELY with Fast-Path [SYSTEM] tag
                clearChat();
                // We use [SYSTEM:] so brain.py skips pre-processing and memory recall for the intro
                sendMessage(`[SYSTEM: Start a ${level}-level mock interview for ${domain} at ${company}. Keep it professional and concise.]`);
            }, 100);
        });
    }

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

// ── MICROPHONE LOGIC ──────────────────────────────────────────────────────
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;

async function toggleMicrophone() {
    const micBtn = document.getElementById('mic-btn');
    
    if (isRecording) {
        log('Stopping recording...');
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
        isRecording = false;
        micBtn.innerHTML = '🎤';
        return;
    }

    if (!acquireInputLock('voice')) return;

    try {
        log('Starting microphone capture...');
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        recordedChunks = [];

        mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };

        mediaRecorder.onstop = async () => {
            const recordedMime = mediaRecorder.mimeType || 'audio/webm';
            log(`Recording finished. Mime: ${recordedMime}`);
            const blob = new Blob(recordedChunks, { type: recordedMime });
            
            // CRITICAL: Stop the tracks so the mic isn't held open
            stream.getTracks().forEach(track => track.stop());
            
            if (blob.size < 1000) {
                log("Blob too small, skipping.");
                micBtn.innerHTML = '🎤';
                releaseInputLock();
                return;
            }

            log(`Sending audio blob (${(blob.size / 1024).toFixed(1)} KB) to server...`);
            _showNotification("Processing Voice...", "#00ff88");
            
            const meta = currentInterviewMeta; // Use the actual current meta
            const formData = new FormData();
            formData.append('file', blob, `voice_input.${recordedMime.split('/')[1] || 'webm'}`);
            formData.append('mode', meta.mode);
            formData.append('level', meta.level);
            formData.append('company', meta.company);
            formData.append('domain', meta.domain);
            formData.append('gesture', 'none');
            formData.append('face_emotion', getFaceEmotion());

            try {
                const res = await fetch('/api/voice-chat', { method: 'POST', body: formData });
                const data = await res.json();
                handleResponse(data);
            } catch (err) { 
                console.error("Voice Chat Error:", err);
            } finally {
                micBtn.innerHTML = '🎤';
                releaseInputLock();
                isRecording = false;
            }
        };

        mediaRecorder.start();
        isRecording = true;
        micBtn.style.color = '#ff4757';
        micBtn.classList.add('recording-active');
        micBtn.innerHTML = '🔴 <span style="font-size:10px;margin-left:4px;">REC</span>';
        _showNotification("Listening...", "#ff4757");

    } catch (err) {
        log(`Mic Error: ${err.message}`);
        _showNotification("Microphone Access Denied", "#e74c3c");
        releaseInputLock();
    }
}

// ── VOICE SELECTION LOGIC ──────────────────────────────────────────────────
function initVoiceSelector() {
    const voiceBtn = document.getElementById('voice-settings-btn');
    const voiceDropdown = document.getElementById('voice-dropdown');
    
    if (!voiceBtn || !voiceDropdown) return;

    console.log("[Voice] Initializing voice selector UI...");

    // 1. Toggle dropdown
    voiceBtn.addEventListener('click', (e) => {
        log("[Voice] Button clicked");
        e.preventDefault();
        e.stopPropagation();
        const isOpen = voiceDropdown.style.display === 'flex';
        voiceDropdown.style.display = isOpen ? 'none' : 'flex';
    });

    // 2. Close on outside click
    document.addEventListener('click', () => { voiceDropdown.style.display = 'none'; });

    // 3. Fetch and populate voices (from API)
    fetch('/api/voices')
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success' && data.voices) {
                voiceDropdown.innerHTML = '';
                data.voices.forEach(voice => {
                    const item = document.createElement('div');
                    item.className = 'voice-item';
                    if (voice.tld === 'com' && voice.lang === 'en') item.classList.add('active'); // Default
                    item.textContent = voice.name;
                    item.onclick = async () => {
                        console.log("[Voice] Selected:", voice.name);
                        document.querySelectorAll('.voice-item').forEach(v => v.classList.remove('active'));
                        item.classList.add('active');
                        
                        try {
                            await fetch('/api/set-voice', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ lang: voice.lang, tld: voice.tld })
                            });
                            _showNotification(`Voice changed to ${voice.name}`, "#00ff88");
                        } catch(e) {}
                    };
                    voiceDropdown.appendChild(item);
                });
            }
        });
}

// ── CORE CHAT ACTIONS ─────────────────────────────────────────────────────
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

async function sendMessage(textOverride = null) {
    const input = document.getElementById('text-input');
    const rawText = textOverride || input.value.trim();
    if (!rawText || _inputLocked) return;
    if (!acquireInputLock('text')) return;

    if (!textOverride) {
        addMessage(rawText, 'user');
        input.value = '';
    }

    const meta = currentInterviewMeta;
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
                face_emotion: getFaceEmotion()
            })
        });
        const data = await response.json();
        handleResponse(data);
    } catch (e) { releaseInputLock(); }
}

// ── LIP SYNC STATE ────────────────────────────────────────────────────
let _lipSyncRAF = null;    // requestAnimationFrame ID
let _audioCtx = null;      // shared AudioContext
let _analyser = null;      // AnalyserNode

function _stopLipSync() {
    if (_lipSyncRAF) { cancelAnimationFrame(_lipSyncRAF); _lipSyncRAF = null; }
    // Gently close the jaw
    if (avatar && typeof avatar.updateFace === 'function') {
        avatar.updateFace({ jawOpen: 0 });
    }
}

function _startLipSync(audioEl) {
    _stopLipSync(); // Cancel any previous
    
    console.log('[LipSync] Starting lip sync with audio element');

    try {
        // Reuse or create AudioContext
        if (!_audioCtx) {
            console.log('[LipSync] Creating new AudioContext');
            _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (_audioCtx.state === 'suspended') {
            console.log('[LipSync] Resuming suspended AudioContext');
            _audioCtx.resume();
        }
        
        console.log('[LipSync] AudioContext state:', _audioCtx.state);

        const source = _audioCtx.createMediaElementSource(audioEl);
        _analyser = _audioCtx.createAnalyser();
        _analyser.fftSize = 256;
        _analyser.smoothingTimeConstant = 0.7;

        console.log('[LipSync] Created analyser, connecting source...');
        
        // Route: source → both speakers (priority) and analyser (for mouth)
        // This ensures the audio is always heard even if the analyser is delayed
        source.connect(_audioCtx.destination); 
        source.connect(_analyser);
        
        console.log('[LipSync] Connected! Starting animation loop');

        const dataArr = new Uint8Array(_analyser.frequencyBinCount);

        function tick() {
            if (!avatar || !_analyser) {
                console.log('[LipSync] No avatar or analyser');
                return;
            }

            _analyser.getByteFrequencyData(dataArr);
            // Average volume of speech-relevant frequencies (300Hz–3kHz = bins ~4 to ~35)
            let sum = 0;
            const start = 4, end = Math.min(35, dataArr.length);
            for (let i = start; i < end; i++) sum += dataArr[i];
            const avg = sum / (end - start);

            // Map 0–128 → 0–0.85 with smoothing
            const jaw = Math.min(0.85, (avg / 128) * 1.4);
            
            // VISIBLE LIP SYNC - make the avatar bounce up and down when speaking
            if (avatar.model) {
                // Save base position on first frame
                if (!avatar.model.userData.baseY) {
                    avatar.model.userData.baseY = avatar.model.position.y;
                }
                const baseY = avatar.model.userData.baseY;
                const bounce = jaw * 0.15; // Much more visible bounce (15cm)
                avatar.model.position.y = baseY + bounce;
                
                // Also tilt head slightly - MORE VISIBLE
                if (avatar.headBone) {
                    avatar.headBone.rotation.x = jaw * 0.3; // More rotation
                }
                // If no head bone, rotate the whole model slightly
                else if (avatar.model.rotation) {
                    avatar.model.rotation.x = jaw * 0.05;
                }
            }
            
            // Also call updateFace for morph targets
            if (typeof avatar.updateFace === 'function') {
                avatar.updateFace({ jawOpen: jaw, mouthOpen: jaw * 0.6 });
            }

            _lipSyncRAF = requestAnimationFrame(tick);
        }

        _lipSyncRAF = requestAnimationFrame(tick);
    } catch (e) {
        console.warn('[LipSync] Could not start audio analysis:', e.message);
    }
}

function handleResponse(data) {
    console.log('[Response] data:', JSON.stringify(data).substring(0, 200));
    if (!data || !data.text) { releaseInputLock(); return; }
    addMessage(data.text, 'aura');
    if (avatar && data.emotion) {
        console.log('[Response] Showing emotion:', data.emotion);
        avatar.showEmotion(data.emotion);
    }

    // Face animation trigger moved inside audio.onplay below for synchronization

    if (data.audio_url) {
        try {
            const audio = new Audio(data.audio_url);
            audio.crossOrigin = 'anonymous'; // required for AudioContext tap
            window.currentAudio = audio;
            const speed = parseFloat(document.getElementById('tts-speed')?.value) || 1.0;
            audio.playbackRate = speed;
            audio.volume = 1.0; // Ensure loud audio

            audio.addEventListener('play', async () => {
                _startLipSync(audio);
                
                // NEW: Trigger high-fidelity ACE animation if available
                if (avatar && data.face_animation) {
                    avatar.playFaceAnimation(data.face_animation);
                }
                // NEW: Load lipsync metadata if ACE animation not available
                else if (avatar && data.lipsync_url) {
                    try {
                        const response = await fetch(data.lipsync_url);
                        if (response.ok) {
                            const lipsyncData = await response.json();
                            if (lipsyncData.frames && Array.isArray(lipsyncData.frames)) {
                                avatar.playFaceAnimation(lipsyncData.frames);
                                log(`[Lipsync] Loaded ${lipsyncData.frames.length} animation frames`);
                            }
                        } else {
                            log(`[Lipsync] Failed to load metadata: ${response.status}`);
                        }
                    } catch (err) {
                        console.warn('[Lipsync] Error loading metadata:', err.message);
                    }
                }
            });
            audio.addEventListener('ended', () => { _stopLipSync(); releaseInputLock(); });
            audio.addEventListener('pause', () => _stopLipSync());
            audio.addEventListener('error', () => { _stopLipSync(); releaseInputLock(); });

            audio.play().catch(err => { _stopLipSync(); releaseInputLock(); });
        } catch (e) { _stopLipSync(); releaseInputLock(); }
    } else {
        releaseInputLock();
    }
}

function addMessage(text, role) {
    const chatHistory = document.getElementById('chat-history');
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}-message`;
    msgDiv.textContent = text;
    chatHistory.appendChild(msgDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

function clearChat() {
    document.getElementById('chat-history').innerHTML = '';
}

/** Safe accessor for face emotion — never throws ReferenceError */
function getFaceEmotion() {
    try { 
        const detector = window.faceDetector;
        if (!detector) {
            console.log('[Face] No detector yet');
            return 'neutral';
        }
        const emo = detector.dominant;
        console.log('[Face] getFaceEmotion:', emo, '| scores:', detector._scores);
        return emo || 'neutral'; 
    }
    catch(e) { 
        console.log('[Face] Error:', e.message);
        return 'neutral'; 
    }
}

// ── CODE EDITOR (Monaco) ──────────────────────────────────────────────────
let monacoEditor = null;
let monacoReady = false;

function initCodeEditor() {
    const codeBtn = document.getElementById('code-toggle-btn');
    const codeOverlay = document.getElementById('code-overlay');
    const closeBtn = document.getElementById('close-code-btn');
    const runBtn = document.getElementById('run-code-btn');
    const sendBtn = document.getElementById('send-code-btn');
    const langSelect = document.getElementById('editor-lang');

    if (codeBtn && codeOverlay) {
        codeBtn.addEventListener('click', () => {
            codeOverlay.style.display = 'flex';
            // Init Monaco on first open
            if (!monacoReady) {
                initMonaco();
            }
        });
    }
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            codeOverlay.style.display = 'none';
        });
    }
    if (runBtn) {
        runBtn.addEventListener('click', runEditorCode);
    }
    if (sendBtn) {
        sendBtn.addEventListener('click', sendCodeToAura);
    }
    if (langSelect) {
        langSelect.addEventListener('change', () => {
            if (monacoEditor) {
                const model = monacoEditor.getModel();
                if (model) monaco.editor.setModelLanguage(model, langSelect.value);
            }
        });
    }
}

function initMonaco() {
    if (typeof require === 'undefined' || !require.config) {
        document.getElementById('code-output').innerHTML = '<span style="color:#e74c3c;">Monaco loader not found. Check your internet connection.</span>';
        return;
    }
    require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs' } });
    require(['vs/editor/editor.main'], function () {
        monacoEditor = monaco.editor.create(document.getElementById('editor-container'), {
            value: '# Write your code here\n',
            language: 'python',
            theme: 'vs-dark',
            fontSize: 14,
            minimap: { enabled: false },
            automaticLayout: true,
            scrollBeyondLastLine: false,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            lineNumbers: 'on',
            padding: { top: 12 }
        });
        monacoReady = true;
        log('Monaco Editor initialized');
    });
}

function runEditorCode() {
    const outputEl = document.getElementById('code-output');
    if (!monacoEditor) { outputEl.innerHTML = '<span style="color:#e74c3c;">Editor not ready yet.</span>'; return; }
    const code = monacoEditor.getValue();
    const lang = document.getElementById('editor-lang').value;
    outputEl.innerHTML = `<span style="color:#a29bfe;">▶ Running ${lang}...</span><br>`;

    // JavaScript can run locally in browser
    if (lang === 'javascript') {
        try {
            const logs = [];
            const origLog = console.log;
            console.log = (...args) => logs.push(args.join(' '));
            // eslint-disable-next-line no-eval
            eval(code);
            console.log = origLog;
            outputEl.innerHTML += logs.map(l => `<span style="color:#00ff88;">${escHtml(l)}</span>`).join('<br>') || '<span style="color:#888;">No output.</span>';
        } catch(e) {
            outputEl.innerHTML += `<span style="color:#e74c3c;">Error: ${escHtml(e.message)}</span>`;
        }
    } else {
        outputEl.innerHTML += `<span style="color:#fdcb6e;">⚠ ${lang} requires a backend runner. Use ↑ Send to AURA for feedback instead.</span>`;
    }
}

async function sendCodeToAura() {
    if (!monacoEditor) { _showNotification('Editor not ready', '#e74c3c'); return; }
    const code = monacoEditor.getValue();
    const lang = document.getElementById('editor-lang')?.value || 'python';
    const codeOverlay = document.getElementById('code-overlay');
    codeOverlay.style.display = 'none'; // Close overlay
    sendMessage(null, `Please review this ${lang} code:\n\`\`\`${lang}\n${code}\n\`\`\``);
}

function escHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── CAMERA & FACE TRACKING ───────────────────────────────────────────────
let isCameraActive = false;
let cameraStream = null;
let modelsLoaded = false;

async function loadFaceApiModels() {
    if (modelsLoaded) return true;
    _showNotification("Loading Face Models...", "#6c5ce7");
    
    // Load from CDN directly (more reliable)
    try {
        const CDN_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';
        console.log('[FaceAPI] Loading from CDN:', CDN_URL);
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(CDN_URL),
            faceapi.nets.faceLandmark68TinyNet.loadFromUri(CDN_URL),
            faceapi.nets.faceExpressionNet.loadFromUri(CDN_URL)
        ]);
        modelsLoaded = true;
        log("Face Models Loaded");
        console.log('[FaceAPI] CDN models loaded successfully');
        _showNotification("Face Models Ready!", "#00ff88");
        return true;
    } catch (e) {
        console.error('[FaceAPI] CDN load failed:', e);
        
        // Try local fallback
        try {
            const MODEL_URL = '/face-models';
            console.log('[FaceAPI] Trying local:', MODEL_URL);
            await Promise.all([
                faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
                faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
                faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL)
            ]);
            modelsLoaded = true;
            log("Face Models Loaded (local)");
            return true;
        } catch (ee) {
            console.error('[FaceAPI] Local also failed:', ee);
            _showNotification("Models Load Failed", "#e74c3c");
            return false;
        }
    }
}

async function toggleCamera() {
    console.log('[Camera] toggleCamera called');
    const video = document.getElementById('webcam-video');         // hidden — for detection
    const previewVideo = document.getElementById('cam-preview-video'); // visible — user sees self
    const previewWrapper = document.getElementById('cam-preview-wrapper');
    const camBtn = document.getElementById('camera-btn');
    const dot = document.getElementById('face-status-dot');
    const statusText = document.querySelector('#face-status span:last-child');

    if (isCameraActive) {
        // ── Stop Camera ──
        console.log('[Camera] Stopping...');
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
            cameraStream = null;
        }
        if (window.faceDetector) {
            console.log('[Camera] Stopping detector');
            window.faceDetector.stop();
        }
        video.srcObject = null;
        if (previewVideo) previewVideo.srcObject = null;
        if (previewWrapper) previewWrapper.style.display = 'none';
        isCameraActive = false;
        camBtn.classList.remove('active');
        dot.style.background = '#888';
        statusText.textContent = 'Camera Off';
        _showNotification('Camera Disabled', '#888');
        return;
    }

    // ── Start Camera ──
    console.log('[Camera] Using simpleFaceDetector...');

    if (!window.simpleFaceDetector) {
        console.error('[Camera] simpleFaceDetector not loaded!');
        _showNotification('Face detector not loaded', '#e74c3c');
        return;
    }

    try {
        console.log('[Camera] Requesting camera access...');
        cameraStream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
        console.log('[Camera] Got stream:', cameraStream.id);

        // Feed to hidden detection video
        video.srcObject = cameraStream;

        // Feed to visible preview
        if (previewVideo) {
            previewVideo.srcObject = cameraStream;
        }
        if (previewWrapper) {
            previewWrapper.style.display = 'flex';
        }

        isCameraActive = true;
        camBtn.classList.add('active');

        // Setup callbacks before starting
        window.simpleFaceDetector.onFaceDetected = (emotion, confidence) => {
            console.log('[Camera] Emotion:', emotion, confidence.toFixed(2));
            const dot = document.getElementById('face-status-dot');
            const statusText = document.querySelector('#face-status span:last-child');
            if (dot && statusText) {
                dot.style.background = '#00ff88';
                statusText.textContent = `Live • ${emotion.toUpperCase()}`;
            }
            
            // Mirror to avatar
            if (avatar && typeof avatar.showEmotion === 'function') {
                avatar.showEmotion(emotion);
            }
        };
        
        window.simpleFaceDetector.onHeadTurn = (direction) => {
            console.log('[Camera] HEAD TURN:', direction);
            log(`⚠️ Head turn detected (${direction}) - Pay attention!`);
            triggerAttentionWarning();
        };
        
        window.simpleFaceDetector.onNoFace = () => {
            console.log('[Camera] No face!');
            triggerAttentionWarning();
        };
        
        // Start detection
        await window.simpleFaceDetector.init(video);
        window.simpleFaceDetector.start();
        
        console.log('[Camera] Detector started!');

        _showNotification('Camera Active!', '#00ff88');
        dot.style.background = '#00ff88';
        statusText.textContent = 'Live • Detecting...';
    } catch (err) {
        console.error('Camera error:', err);
        _showNotification('Camera Denied — check browser permissions', '#e74c3c');
    }
}

function initFaceDetector() {
    console.log('[initFaceDetector] Running, window.faceDetector:', window.faceDetector);
    // Use window.faceDetector — set by face_emotion.js before main.js runs
    if (!window.faceDetector) {
        console.error('[initFaceDetector] ERROR: window.faceDetector is null!');
        return;
    }
    const fd = window.faceDetector;
    console.log('[initFaceDetector] Setting up callbacks...');
    const dot = document.getElementById('face-status-dot');
    const statusText = document.querySelector('#face-status span:last-child');

    // Wire the close button on the cam preview
    const camCloseBtn = document.getElementById('cam-close-btn');
    if (camCloseBtn) {
        camCloseBtn.addEventListener('click', () => {
            const wrapper = document.getElementById('cam-preview-wrapper');
            if (wrapper) wrapper.style.display = 'none';
        });
    }

    fd.onEmotion((emotion, confidence) => {
        console.log('[Face] onEmotion fired:', emotion, 'confidence:', confidence);
        
        // Update status pill
        const dot = document.getElementById('face-status-dot');
        const statusText = document.querySelector('#face-status span:last-child');
        
        if (dot && statusText) {
            const colorMap = { neutral: '#00ff88', happy: '#f1c40f', sad: '#3498db', angry: '#e74c3c', surprised: '#9b59b6' };
            dot.style.background = colorMap[emotion] || '#00ff88';
            statusText.textContent = `Live • ${emotion.toUpperCase()} (${(confidence * 100).toFixed(0)}%)`;
            console.log('[Face] Updated status UI');
        }
        
        // Mirror user emotion on AURA's face
        if (avatar) {
            console.log('[Face] Calling avatar.showEmotion:', emotion);
            if (typeof avatar.showEmotion === 'function') {
                avatar.showEmotion(emotion);
            } else {
                console.log('[Face] avatar.showEmotion not found');
            }
        }
        // Update label inside the preview window
        const emotionLabel = document.getElementById('cam-emotion-label');
        const glowRing = document.getElementById('cam-glow-ring');
        if (emotionLabel) {
            const emojiMap = { happy: '😊', sad: '😢', angry: '😠', surprised: '😲', neutral: '😐', fear: '😨', disgust: '🤢' };
            const colorMap2 = { neutral: '#00ff88', happy: '#f1c40f', sad: '#74b9ff', angry: '#e74c3c', surprised: '#a29bfe', fear: '#fd79a8', disgust: '#55efc4' };
            const emoji = emojiMap[emotion] || '😐';
            const col = colorMap2[emotion] || '#00ff88';
            emotionLabel.textContent = `${emoji} ${emotion.toUpperCase()}`;
            emotionLabel.style.color = col;
            if (glowRing) glowRing.style.borderColor = col.replace(')', ', 0.7)').replace('rgb', 'rgba');
        }

        // --- NEW: Emotion Feedback during interview ---
        // Lowered threshold to 0.4 for better reactivity
        if (currentInterviewMeta.mode === 'interview' && confidence > 0.4) {
            triggerEmotionComment(emotion);
        }
    });

    // Also link the debug callback to stop the "DETECTING..." initial freeze 
    if (fd && typeof fd.onDebug === 'function') {
        fd.onDebug((dom) => {
            const label = document.getElementById('cam-emotion-label');
            if (label && label.textContent === 'DETECTING...') {
                label.textContent = `😐 ${dom.toUpperCase()}`;
            }
        });
    }

    // Interviewer Logic: Reactive feedback when looking away
    fd.onHeadTurn((dir) => {
        // Always show attention warning, not just in interview mode
        log(`⚠️ Head turn detected (${dir}) - Pay attention!`);
        triggerAttentionWarning();
    });

    fd.onInattention(() => {
        // Always show attention warning, not just in interview mode
        log('⚠️ Inattention detected - Pay attention!');
        triggerAttentionWarning();
    });
}

// Throttle attention warnings so AURA doesn't spam
let _lastAttentionTime = 0;
const ATTENTION_COOLDOWN_MS = 15000; // 15s minimum between warnings

const _ATTENTION_PHRASES = [
    "Hey, eyes on me please!",
    "I noticed you looked away. Are you still there?",
    "Please pay attention!",
    "Hey! Over here!",
    "Lost you for a second — welcome back!",
];

function triggerAttentionWarning() {
    const now = Date.now();
    if (now - _lastAttentionTime < ATTENTION_COOLDOWN_MS) return; 
    
    const phrase = _ATTENTION_PHRASES[Math.floor(Math.random() * _ATTENTION_PHRASES.length)];
    const msg = `[SYSTEM: The user is distracted. Briefly call their attention back naturally. Example: "${phrase}"]`;
    
    _lastAttentionTime = now;
    
    // Generate warning audio immediately
    (async () => {
        try {
            const response = await fetch('/api/animate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: "Please pay attention to the interview.",
                    emotion: "concerned"
                })
            });
            const data = await response.json();
            if (data && data.audio_url) {
                // Play warning audio directly
                const audio = new Audio(data.audio_url);
                audio.volume = 0.8;
                audio.play().catch(err => console.log('[Warning Audio] Play failed:', err));
                log('⚠️ Attention warning issued');
            }
        } catch (e) {
            console.log('[Warning Audio] Error:', e.message);
        }
    })();
    
    if (_inputLocked) {
        _pendingSystemMessage = msg; // Queue it
        return;
    }

    if (avatar && avatar.currentEmotion === 'neutral') avatar.showEmotion('thinking', 0.5, true);
    sendMessage(null, msg);
}

const EMOTION_COOLDOWN_MS = 20000; // 20s 

function triggerEmotionComment(emotion) {
    if (emotion === 'neutral') return;
    const now = Date.now();
    if (now - _lastEmotionCommentTime < EMOTION_COOLDOWN_MS) return;
    
    const phrases = {
        happy: "You seem quite happy! Is there a positive takeaway here?",
        sad: "You look momentarily concerned. Don't worry, take your time with the answer.",
        angry: "Keep your cool, focus on the problem at hand.",
        surprised: "A bit of a surprise? Just explain how you'd tackle it.",
        fear: "Deep breath. You're handling the technical bits well.",
        disgust: "Don't get discouraged. Let's look at the next part."
    };
    
    if (phrases[emotion]) {
        const msg = `[SYSTEM: The user looks ${emotion}. Acknowledge this naturally as a professional interviewer. For example: "${phrases[emotion]}"]`;
        if (_inputLocked) {
            _pendingSystemMessage = msg; // Queue it
            return;
        }
        _lastEmotionCommentTime = now;
        sendMessage(null, msg);
    }
}

/**
 * Legacy alias kept for compatibility
 */
async function triggerInterviewerReaction(text) {
    const now = Date.now();
    if (now - _lastAttentionTime < ATTENTION_COOLDOWN_MS) return;
    if (_inputLocked) return;
    _lastAttentionTime = now;
    sendMessage(null, `[SYSTEM: As the interviewer, say this naturally: "${text}"]`);
    if (avatar) avatar.playAnimation('talking', true);
}
