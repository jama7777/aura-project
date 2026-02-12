// Background Service Worker
// Handles communication between the secure web page (HTTPS) and the local AURA server (HTTP)
// This bypasses Mixed Content restrictions.

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "SPEAK_TEXT") {
        console.log("Speaking:", request.text);

        fetch("http://localhost:8000/api/animate", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                text: request.text,
                emotion: request.emotion || "neutral"
            })
        })
            .then(response => response.json())
            .then(data => {
                console.log("AURA Success:", data);
                sendResponse({ success: true, data: data });
            })
            .catch(error => {
                console.error("AURA Error:", error);
                sendResponse({ success: false, error: error.message });
            });

        return true; // Keep channel open for async response
    }
});
