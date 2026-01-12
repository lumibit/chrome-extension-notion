// Initialize popup
document.addEventListener('DOMContentLoaded', () => {
    // Display space ID, block ID and lock status
    chrome.storage.local.get(['spaceId', 'blockId'], (result) => {
        document.getElementById('spaceIdValue').textContent =
            result?.spaceId || '(not found)';
        document.getElementById('blockIdValue').textContent =
            result?.blockId || '(not found)';
    });

    // Check and display lock and verification status
    updatePageStatus();

    // Log popup initialization (ignore errors if content script not ready)
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        tab && chrome.tabs.sendMessage(tab.id, { action: 'log', message: 'Popup initialized' }).catch(() => { });
    });

    // Button click handler - toggle lock status
    document.getElementById('lockPageButton').addEventListener('click', async () => {
        chrome.tabs.query({ active: true, currentWindow: true }, async ([tab]) => {
            if (!tab?.url?.includes('notion')) return;

            try {
                const response = await chrome.tabs.sendMessage(tab.id, { action: 'blockPage' });
                if (response.success) {
                    chrome.tabs.sendMessage(tab.id, { action: 'log', message: 'Page lock toggled successfully' });
                    setTimeout(() => updatePageStatus(), 500);
                } else {
                    chrome.tabs.sendMessage(tab.id, { action: 'log', message: 'Lock toggle failed' });
                }
            } catch (error) {
                // Content script not available - silent failure
            }
        });
    });

    // Button click handler - verify page
    document.getElementById('verifyPageButton').addEventListener('click', async () => {
        chrome.tabs.query({ active: true, currentWindow: true }, async ([tab]) => {
            if (!tab?.url?.includes('notion')) return;

            try {
                const response = await chrome.tabs.sendMessage(tab.id, { action: 'verifyPage' });
                if (response.success) {
                    chrome.tabs.sendMessage(tab.id, { action: 'log', message: 'Page verification toggled successfully' });
                    setTimeout(() => updatePageStatus(), 500);
                } else {
                    chrome.tabs.sendMessage(tab.id, { action: 'log', message: 'Verification toggle failed' });
                }
            } catch (error) {
                // Content script not available - silent failure
            }
        });
    });
});

// Function to check and display current lock and verification status
async function updatePageStatus() {
    chrome.tabs.query({ active: true, currentWindow: true }, async ([tab]) => {
        if (!tab?.url?.includes('notion')) {
            document.getElementById('lockStatusValue').textContent = 'Not on Notion page';
            document.getElementById('verificationStatusValue').textContent = 'Not on Notion page';
            return;
        }

        document.getElementById('lockStatusValue').textContent = 'Checking...';
        document.getElementById('verificationStatusValue').textContent = 'Checking...';

        try {
            // Get both statuses with single API call
            const response = await chrome.tabs.sendMessage(tab.id, { action: 'checkPageStatus' });

            // Update lock status
            document.getElementById('lockStatusValue').textContent =
                response?.success ? (response.locked ? '[LOCKED]' : '[UNLOCKED]') : 'Check failed';

            // Update verification status with date if available
            if (response?.success && response.verified) {
                const date = response.verificationDate;
                document.getElementById('verificationStatusValue').textContent =
                    date ? `[VERIFIED ${date}]` : '[VERIFIED]';
            } else {
                document.getElementById('verificationStatusValue').textContent =
                    response?.success ? '[NOT VERIFIED]' : 'Check failed';
            }

        } catch (error) {
            // Content script not available - show unknown status
            document.getElementById('lockStatusValue').textContent = '[UNKNOWN]';
            document.getElementById('verificationStatusValue').textContent = '[UNKNOWN]';
        }
    });
}

