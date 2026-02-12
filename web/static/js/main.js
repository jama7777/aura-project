import { Avatar } from './avatar.js?v=5';
import { GestureHandler } from './gesture.js';

const avatar = new Avatar();
window.avatar = avatar; // Debugging
let currentEmotion = "neutral";
// Emotion Trigger State
let lastTriggeredEmotion = null;
let emotionStartTime = 0;
let emotionCooldown = 0;

const gestureHandler = new GestureHandler(avatar, (gesture) => {
    // Send gesture to backend
    log(`Sending gesture: ${gesture} (Emotion: ${currentEmotion})`);
    addMessage(`(Gesture: ${gesture})`, 'user');
    fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: "", emotion: currentEmotion, gesture: gesture })
    })
        .then(res => res.json())
        .then(data => handleResponse(data))
        .catch(err => console.error("Error sending gesture:", err));
});
// ========== AUDIO RECORDING VARIABLES ==========
let isRecording = false;        // Track if we're currently recording
let mediaRecorder = null;       // MediaRecorder instance
let recordedChunks = [];        // Store audio data chunks
let audioStream = null;         // Microphone stream

function log(msg) {
    console.log(msg);
    const debugDiv = document.getElementById('debug-console');
    if (debugDiv) {
        debugDiv.innerHTML += `<div>[Main] ${msg}</div>`;
        debugDiv.scrollTop = debugDiv.scrollHeight;
    }
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

    // Start Polling for External Commands (e.g. from Chrome Extension)
    setInterval(pollForUpdates, 1000);
});

async function pollForUpdates() {
    try {
        const res = await fetch('/api/updates');
        const data = await res.json();

        if (data.text) {
            log(`External command received: "${data.text.substring(0, 20)}..."`);
            handleResponse(data);
        }
    } catch (e) {
        // Silent fail on polling errors
    }
}

async function loadFaceAPI() {
    log("Loading Face API models...");
    try {
        log("Loading Face API models...");
        // Tuning for High Accuracy: Using SSD MobileNet V1
        // This model is slower but much more accurate than TinyFaceDetector
        await faceapi.nets.ssdMobilenetv1.loadFromUri('/face-models');
        await faceapi.nets.faceExpressionNet.loadFromUri('/face-models');
        log("Face API models (SSD MobileNet V1) loaded successfully.");
    } catch (e) {
        log("Local models not found, attempting CDN fallback...");
        try {
            const modelUrl = 'https://justadudewhohacks.github.io/face-api.js/models';
            await faceapi.nets.ssdMobilenetv1.loadFromUri(modelUrl);
            await faceapi.nets.faceExpressionNet.loadFromUri(modelUrl);
            log("Face API models (SSD MobileNet V1) loaded from CDN.");
        } catch (err) {
            console.error("Face API Error:", err);
            log(`Failed to load Face Models: ${err.message}`);
            addMessage("⚠️ Face detection disabled (Models failed to load).", 'aura');
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
}

function triggerManualGesture(gesture) {
    log(`Manual/Body Gesture Triggered: ${gesture}`);

    // 1. Play animation locally immediately for feedback
    // Mapping gesture to animation
    // 'wave' -> we don't have wave animation code in gesture.js, but let's see server.py...
    // Server has: hug, dance, happy, sad, clap, pray, jump.
    // 'wave' -> maybe mapping to 'talk' or we need to add 'tier1' animations if available in avatar.
    // For now, allow server to decide or simple mapping.

    // We send to server as gesture, brain.py handles it.

    addMessage(`(Gesture: ${gesture})`, 'user');

    fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: "", emotion: currentEmotion, gesture: gesture })
    })
        .then(res => res.json())
        .then(data => handleResponse(data))
        .catch(err => console.error("Error sending gesture:", err));
}


// toggleRecording removed - used toggleMicrophone instead


async function sendMessage() {
    const input = document.getElementById('text-input');
    const text = input.value.trim();
    if (!text) return;

    addMessage(text, 'user');
    input.value = '';

    // Detect emotion from user's text locally for immediate avatar reaction
    const userEmotion = detectEmotionFromText(text);
    if (userEmotion !== "neutral" && avatar && avatar.showEmotion) {
        log(`User emotion detected: ${userEmotion}`);
        // Show user's emotion briefly on avatar (empathy response)
        // Use false for triggerAnimation - we only want facial expression, not body animation
        avatar.showEmotion(userEmotion, 0.5, false); // Half intensity, facial only
    }

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text, emotion: userEmotion })
        });

        const data = await response.json();
        handleResponse(data);
    } catch (error) {
        console.error('Error sending message:', error);
        addMessage("Error connecting to AURA.", 'aura');
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
 * Toggle microphone recording on/off
 * Click once to start, click again to stop and send
 */
async function toggleMicrophone() {
    if (isRecording) {
        // Currently recording -> Stop and send
        log("Stopping recording...");
        stopRecording();
    } else {
        // Not recording -> Start recording
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

        // When recording stops, send the audio
        mediaRecorder.onstop = () => {
            log("MediaRecorder stopped, sending audio...");
            sendAudioToServer();
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

    // Reset button visual
    document.getElementById('mic-btn').classList.remove('active');
    document.getElementById('mic-btn').style.background = '';

    log("Recording stopped.");
}

/**
 * Send recorded audio to server for transcription
 * First plays the audio locally so user can hear what was recorded
 */
async function sendAudioToServer() {
    if (recordedChunks.length === 0) {
        log("No audio recorded.");
        // No message shown - silent fail
        return;
    }

    // Combine all chunks into a single blob
    const audioBlob = new Blob(recordedChunks, { type: recordedChunks[0].type });
    const sizeKB = (audioBlob.size / 1024).toFixed(1);
    log(`Audio blob: ${sizeKB} KB`);

    // Clear recorded chunks for next recording
    recordedChunks = [];

    // ===== PLAY THE RECORDED AUDIO FIRST =====
    // Create a URL for the blob
    const audioUrl = URL.createObjectURL(audioBlob);

    // Get the audio player elements
    const audioPlayer = document.getElementById('recorded-audio');
    const audioContainer = document.getElementById('audio-playback-container');

    // Set the audio source and show the player
    audioPlayer.src = audioUrl;
    audioContainer.style.display = 'block';

    log("Playing back your recording...");
    // Status message removed - no UI clutter

    // Play the audio
    try {
        await audioPlayer.play();
        log("Audio playback started");
    } catch (err) {
        log(`Playback error: ${err.message}`);
    }

    // Wait for audio to finish playing, then send to server
    audioPlayer.onended = async () => {
        log("Playback finished, now sending to server...");

        // Hide the player after 1 second
        setTimeout(() => {
            audioContainer.style.display = 'none';
            URL.revokeObjectURL(audioUrl); // Clean up
        }, 1000);

        // Now send to server for transcription
        await sendToServerForTranscription(audioBlob);
    };
}

/**
 * Actually send the audio to the server for transcription
 */
async function sendToServerForTranscription(audioBlob) {
    // Processing silently - no status message

    // Prepare form data
    const formData = new FormData();
    const extension = audioBlob.type.includes('webm') ? 'webm' : 'mp4';
    formData.append('file', audioBlob, `recording.${extension}`);

    try {
        log("Sending audio to server...");
        const response = await fetch('/api/audio', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        log("Server response received.");

        if (data.input_text && data.input_text.trim()) {
            // Success - clearly show what was heard
            const heardText = data.input_text.trim();
            log(`Transcribed: "${heardText}"`);

            // Show only the transcribed text (no extra prefix)
            addMessage(heardText, 'user');

            // Handle the response (play audio, animate avatar, etc.)
            if (data.text) {
                handleResponse(data);
            }
        } else {
            // Transcription failed - silent (check console log)
            log("Could not understand audio.");
            // No error message shown - cleaner UI
        }

    } catch (error) {
        console.error("Audio API error:", error);
        log(`Error: ${error.message}`);
        addMessage("⚠️ Error processing audio", 'aura');
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
        window.currentAudio = audio; // Track it

        audio.play().then(() => {
            avatar.setTalking(true);

            // Use provided face animation data if available (faster)
            if (data.face_animation) {
                log(`Using pre-calculated Lip Sync data (${data.face_animation.length} frames).`);
                startFaceSync(audio, data.face_animation, data.emotion);
            } else {
                // Fallback: Fetch Lip Sync separately
                // CALL /a2f ENDPOINT explicitly as requested
                // We need to pass the file path. standard audio_url is "/audio/filename.wav"
                const filename = data.audio_url.split('/').pop();
                // We assume the server can find it by filename in root

                log(`Fetching Lip Sync for: ${filename} ...`);
                fetch('/a2f', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ audioPath: filename, emotion: data.emotion })
                })
                    .then(r => r.json())
                    .then(a2fData => {
                        if (a2fData.blendshapes) {
                            log(`Received ${a2fData.blendshapes.length} frames of Lip Sync data.`);
                            startFaceSync(audio, a2fData.blendshapes, data.emotion);
                        }
                    })
                    .catch(e => {
                        console.error("A2F Error:", e);
                        log("Lip Sync Failed: " + e.message);
                    });
            }

        }).catch(e => {
            log(`Audio playback failed: ${e.message} `);
        });

        audio.onended = () => {
            avatar.setTalking(false);
            stopFaceSync();
            avatar.playAnimation('idle');
            window.currentAudio = null;
            log("Audio playback finished.");
        };
    } else {
        log("No audio response.");
    }

    // Animation based on emotion/keywords
    if (data.animations && data.animations.length > 0) {
        // If it's just one and it's 'talk', we might want to ignore it if we handle lip sync separately
        // But for now, let's play the sequence.
        // If the sequence contains 'talk', we might want to skip it or handle it differently?
        // Let's filter out 'talk' if we have other animations, or just play it.

        const anims = data.animations.filter(a => a !== 'talk');

        if (anims.length > 0) {
            avatar.playSequence(anims, () => {
                // Only return to idle if not talking
                if (window.currentAudio && !window.currentAudio.paused) {
                    // do nothing, let talk continue
                } else {
                    avatar.playAnimation('idle');
                }
            });
        }
    } else if (data.animation && data.animation !== 'talk') {
        // Fallback for old API
        avatar.playAnimation(data.animation, true);
    }
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

let faceInterval;
function startFaceDetection(video) {
    const statusSpan = document.getElementById('current-emotion');

    faceInterval = setInterval(async () => {
        if (!video || video.paused || video.ended || video.readyState < 2) return;

        // Detect emotions using SSD MobileNet V1 (loaded in loadFaceAPI)
        // SSD MobileNet is more accurate than TinyFaceDetector
        // minConfidence: 0.3 = minimum face detection confidence threshold
        const options = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 });

        try {
            const detections = await faceapi.detectAllFaces(video, options).withFaceExpressions();

            if (detections && detections.length > 0) {
                // Visual Feedback
                video.style.border = "3px solid #00ff00";
                video.style.boxShadow = "0 0 20px #00ff00";

                // Get dominant emotion
                const expressions = detections[0].expressions;
                const sorted = Object.entries(expressions).sort((a, b) => b[1] - a[1]);
                const dominant = sorted[0];

                // Debug log occasionally
                // if (Math.random() < 0.1) log(`Face detected: ${ dominant[0] } (${ (dominant[1] * 100).toFixed(0) }%)`);

                if (dominant[1] > 0.2) { // Extremely low threshold for debugging
                    currentEmotion = dominant[0];
                    statusSpan.textContent = currentEmotion.charAt(0).toUpperCase() + currentEmotion.slice(1) + ` (${(dominant[1] * 100).toFixed(0)}%)`;
                    statusSpan.style.color = "#00ff00";

                    // Auto-Trigger Logic
                    const now = Date.now();
                    // Ignore neutral and ensure cooldown (5s) passed (was 15s)
                    if (currentEmotion !== 'neutral' && (now - emotionCooldown > 5000)) {
                        if (currentEmotion === lastTriggeredEmotion) {
                            // Sustained check
                            if (now - emotionStartTime > 1000) { // Held for 1 second (was 2s)
                                log(`Emotion Sustained(${currentEmotion}) - Triggering Reaction!`);
                                triggerEmotionReaction(currentEmotion);
                                emotionCooldown = now;
                                lastTriggeredEmotion = null; // Reset to avoid double trigger
                            }
                        } else {
                            // New emotion started
                            lastTriggeredEmotion = currentEmotion;
                            emotionStartTime = now;
                        }
                    } else if (currentEmotion !== lastTriggeredEmotion) {
                        // Reset tracker if emotion changes
                        lastTriggeredEmotion = currentEmotion;
                        emotionStartTime = now;
                    }

                } else {
                    lastTriggeredEmotion = null; // Reset if confidence drops
                    statusSpan.style.color = "#aaa";
                }
            } else {
                video.style.border = "2px solid #333";
                video.style.boxShadow = "none";
                if (Math.random() < 0.05) log("No face detected (Check lighting/angle)");
            }
        } catch (e) {
            console.warn("Face detection error:", e);
        }

    }, 500); // Check every 500ms
}

function triggerEmotionReaction(emotion) {
    addMessage(`(Emotion Detected: ${emotion})`, 'user');

    // Play sound or visual feedback?
    // For now just console log and send

    fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: "", emotion: emotion, gesture: "none" })
    })
        .then(res => res.json())
        .then(data => handleResponse(data))
        .catch(err => console.error("Error triggering emotion:", err));
}

function stopFaceDetection() {
    if (faceInterval) clearInterval(faceInterval);
}
