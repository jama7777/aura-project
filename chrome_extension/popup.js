document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('toggle');
    const status = document.getElementById('status');

    // Load saved state
    chrome.storage.local.get(['enabled'], (result) => {
        toggle.checked = result.enabled || false;
        updateStatus();
    });

    toggle.addEventListener('change', () => {
        const isEnabled = toggle.checked;
        chrome.storage.local.set({ enabled: isEnabled }, () => {
            updateStatus();
        });
    });

    function updateStatus() {
        if (toggle.checked) {
            status.textContent = "Status: Listening for buttons...";
            status.style.color = "#00ff00";
        } else {
            status.textContent = "Status: Disabled";
            status.style.color = "#aaa";
        }
    }
});
