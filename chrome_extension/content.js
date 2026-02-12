// Content Script
// Observes changes in ChatGPT/Grok key elements and sends text to AURA

let lastSpeakingText = "";
let isEnabled = false;

// Initialize state
chrome.storage.local.get(['enabled'], (result) => {
    isEnabled = result.enabled || false;
    if (isEnabled) startObserving();
});

// Listen for toggle updates
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (changes.enabled) {
        isEnabled = changes.enabled.newValue;
        if (isEnabled) {
            console.log("AURA Connector: Enabled");
            startObserving();
        } else {
            console.log("AURA Connector: Disabled");
            stopObserving();
        }
    }
});

let observer = null;

function startObserving() {
    if (observer) return;

    // determine host
    const host = window.location.hostname;

    observer = new MutationObserver((mutations) => {
        if (!isEnabled) return;

        // This is a simplified "last message" detector.
        // It waits for the AI to finish typing (mostly) or grabs updates.

        let textToSpeak = "";

        if (host.includes("chatgpt.com")) {
            // Selector for ChatGPT response bubbles
            const responses = document.querySelectorAll('.markdown');
            if (responses.length > 0) {
                // Get the very last response
                const lastResponse = responses[responses.length - 1];
                textToSpeak = lastResponse.innerText;
            }
        }
        else if (host.includes("x.com")) {
            // Selector for Grok/Twitter DM (This is brittle and changes often)
            // Looking for generic message bubbles
            const bubbles = document.querySelectorAll('[data-testid="messageEntry"]');
            if (bubbles.length > 0) {
                const lastBubble = bubbles[bubbles.length - 1];
                textToSpeak = lastBubble.innerText;
            }
        }

        // Logic to prevent repeating itself or speaking while typing
        // We only speak if the text is significantly different and "stable" 
        // (For a real production app, we'd check if the "Stop Generating" button is gone)

        // Simplest V1: Buttons
        // We add a "Speak with AURA" button to every message helper.
    });

    // Strategy B: Inject Buttons + Global Floating Button (Fail-safe)
    setInterval(injectButtons, 2000);
    injectGlobalButton();
}


function injectGlobalButton() {
    if (document.getElementById('aura-global-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'aura-global-btn';
    btn.innerHTML = '🗣️ AURA';
    btn.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: #6c5ce7;
        color: white;
        border: none;
        padding: 15px 20px;
        border-radius: 50px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.3);
        cursor: pointer;
        font-weight: bold;
        z-index: 999999;
        font-family: sans-serif;
        font-size: 16px;
        transition: transform 0.2s;
    `;

    btn.onmouseover = () => btn.style.transform = "scale(1.05)";
    btn.onmouseout = () => btn.style.transform = "scale(1)";

    btn.onclick = () => {
        // Find the text to speak dynamically
        let textToSpeak = "I couldn't find any text to read.";
        const host = window.location.hostname;

        if (host.includes("chatgpt.com")) {
            // Get all markdown blocks
            const blocks = document.querySelectorAll('.markdown');
            if (blocks.length > 0) {
                // Speak the last one
                textToSpeak = blocks[blocks.length - 1].innerText;
            } else {
                // Fallback: looking for any large text block
                const articles = document.querySelectorAll('article');
                if (articles.length > 0) textToSpeak = articles[articles.length - 1].innerText;
            }
        } else if (host.includes("x.com")) {
            // Grok fallback
            const tweets = document.querySelectorAll('[data-testid="tweetText"]');
            if (tweets.length > 0) textToSpeak = tweets[tweets.length - 1].innerText;
        }

        console.log("Global Speak Triggered:", textToSpeak.substring(0, 50) + "...");
        btn.innerHTML = '⏳ Sending...';

        chrome.runtime.sendMessage({ type: "SPEAK_TEXT", text: textToSpeak, emotion: "happy" }, (response) => {
            if (response && response.success) {
                btn.innerHTML = '✅ Sent!';
                setTimeout(() => btn.innerHTML = '🗣️ AURA', 2000);
            } else {
                btn.innerHTML = '❌ Error';
                console.error("BG Error:", response);
                setTimeout(() => btn.innerHTML = '🗣️ AURA', 2000);
            }
        });
    };

    document.body.appendChild(btn);
}

function stopObserving() {
    if (observer) {
        observer.disconnect();
        observer = null;
    }
}

function injectButtons() {
    if (!isEnabled) return;

    const host = window.location.hostname;
    let selector = "";

    if (host.includes("chatgpt.com")) {
        // Find the bottom toolbar of each response
        // Note: OpenAI changes class names often. We look for the "Copy" button container usually.
        // Or simply append to the .markdown container
        const messages = document.querySelectorAll('.group/conversation-turn'); // Common wrapper

        messages.forEach(msg => {
            // Check if it's an assistant message
            const isAssistant = msg.querySelector('.agent-turn') || msg.querySelector('.markdown');
            if (!isAssistant) return;

            // Avoid double injection
            if (msg.querySelector('.aura-speak-btn')) return;

            const btn = document.createElement('button');
            btn.className = 'aura-speak-btn';
            btn.innerHTML = '🗣️ AURA';
            btn.style.cssText = `
                margin-left: 10px;
                background: #6c5ce7;
                color: white;
                border: none;
                padding: 5px 10px;
                border-radius: 5px;
                cursor: pointer;
                font-size: 12px;
                z-index: 9999;
            `;

            btn.onclick = () => {
                const text = msg.querySelector('.markdown').innerText;
                chrome.runtime.sendMessage({ type: "SPEAK_TEXT", text: text, emotion: "happy" });
                btn.innerHTML = '🔊 Speaking...';
                setTimeout(() => btn.innerHTML = '🗣️ AURA', 2000);
            };

            // Find a place to append. 
            // Usually there is a button row at the bottom
            const toolbar = msg.querySelector('.text-token-text-secondary') || isAssistant;
            if (toolbar) {
                toolbar.appendChild(btn);
            }
        });
    }
}
