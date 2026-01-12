// Extracts the first path segment after notion.so/ as spaceId and stores it.
(function () {
    function extractSpaceId(url) {
        try {
            const match = url.match(/^https?:\/\/(?:www\.)?notion\.so\/([^\/?#]+)/i);
            if (!match) return null;
            return decodeURIComponent(match[1]);
        } catch (e) {
            return null;
        }
    }

    function extractBlockId(url) {
        try {
            // Check URL parameters first (highest priority)
            const urlObj = new URL(url);
            const params = urlObj.searchParams;

            // Priority 1: 'p' parameter (page ID in database views with sub-pages)
            if (params.has('p')) {
                const compressedUuid = params.get('p');
                return compressedUuid.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
            }

            // Priority 2: Extract from URL path only (before query parameters)
            const pathOnly = url.split('?')[0];

            // Pattern 1: 32-character hex at the end of path (compressed UUID)
            let match = pathOnly.match(/([a-f0-9]{32})$/i);
            if (match) {
                return match[1].replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
            }

            // Pattern 2: Compressed UUID after dash in path
            match = pathOnly.match(/\/([^\/]+)-([a-f0-9]{32})$/i);
            if (match) {
                return match[2].replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
            }

            // Pattern 3: Standard UUID format (with dashes) - fallback for compatibility
            match = url.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i);
            if (match) {
                return match[1];
            }

            // Fallback: Try to find any 32-character hex string
            match = url.match(/([a-f0-9]{32})/i);
            if (match) {
                return match[1].replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
            }

            return null;
        } catch (e) {
            return null;
        }
    }

    function updateSpaceIdFromLocation() {
        try {
            const currentUrl = window.location.href;
            const spaceId = extractSpaceId(currentUrl);
            const blockId = extractBlockId(currentUrl);

            const updates = {};
            if (spaceId) updates.spaceId = spaceId;
            if (blockId) updates.blockId = blockId;
            if (Object.keys(updates).length > 0) {
                chrome.storage.local.set(updates);
            }
        } catch (error) {
            // Extension context may be invalidated - silently ignore
        }
    }

    // Initial capture
    updateSpaceIdFromLocation();

    // Simple URL change detection for SPA navigation
    let lastUrl = window.location.href;
    setInterval(() => {
        const current = window.location.href;
        if (current !== lastUrl) {
            lastUrl = current;
            updateSpaceIdFromLocation();
        }
    }, 1000);

    // Expose captured headers to the content script context for convenience
    function refreshHeadersExposure() {
        chrome.storage.local.get(['notionHeadersForApi'], (result) => {
            const headers = result && result.notionHeadersForApi ? result.notionHeadersForApi : {};
            // Expose on window (isolated world). Extension components should still read from storage.
            window.notionHeaders = headers;
        });
    }
    refreshHeadersExposure();
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && (changes.notionHeadersForApi || changes.spaceId)) {
            refreshHeadersExposure();
        }
    });

    // Lightweight cache to prevent duplicate loadPageChunk calls
    let statusInFlight = null;
    let lastStatus = null;
    let lastStatusBlockId = null;
    let lastStatusTimeMs = 0;
    const STATUS_TTL_MS = 400; // short-lived cache

    async function getPageStatusCached() {
        const { blockId } = await new Promise(resolve => chrome.storage.local.get(['blockId'], resolve)).catch(() => ({}));
        if (!blockId) return { locked: false, verified: false, verificationDate: null };

        const now = Date.now();
        if (statusInFlight && lastStatusBlockId === blockId) {
            return statusInFlight;
        }
        if (lastStatus && lastStatusBlockId === blockId && (now - lastStatusTimeMs) < STATUS_TTL_MS) {
            return lastStatus;
        }
        statusInFlight = (async () => {
            const res = await checkPageStatus();
            lastStatus = res;
            lastStatusBlockId = blockId;
            lastStatusTimeMs = Date.now();
            statusInFlight = null;
            return res;
        })();
        return statusInFlight;
    }

    // Handle block page requests
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'log') {
            console.log('[Notion Extension]', message.message);
        } else if (message.action === 'blockPage') {
            blockPageFromContentScript()
                .then(result => sendResponse({ success: true, result }))
                .catch(error => sendResponse({ success: false, error: error.message }));
            return true;
        } else if (message.action === 'checkPageStatus') {
            getPageStatusCached()
                .then(status => sendResponse({
                    success: true,
                    locked: status.locked,
                    verified: status.verified,
                    verificationDate: status.verificationDate
                }))
                .catch(error => sendResponse({ success: false, error: error.message }));
            return true;
        } else if (message.action === 'checkLockStatus') {
            getPageStatusCached()
                .then(status => sendResponse({ success: true, locked: status.locked }))
                .catch(error => sendResponse({ success: false, error: error.message }));
            return true;
        } else if (message.action === 'checkVerificationStatus') {
            getPageStatusCached()
                .then(status => sendResponse({ success: true, verified: status.verified }))
                .catch(error => sendResponse({ success: false, error: error.message }));
            return true;
        } else if (message.action === 'verifyPage') {
            verifyPageFromContentScript()
                .then(result => sendResponse({ success: true, result }))
                .catch(error => sendResponse({ success: false, error: error.message }));
            return true;
        }
    });

    // Helper function to get user ID from multiple sources
    async function getUserId() {
        const headerKey = 'x-notion-active-user-header';
        let userId = window.notionHeaders?.[headerKey];

        if (!userId) {
            // Fallback 1: get headers directly from storage
            const { notionHeadersForApi } = await new Promise(resolve =>
                chrome.storage.local.get(['notionHeadersForApi'], resolve)
            ).catch(() => ({}));
            userId = notionHeadersForApi?.[headerKey];
        }

        if (!userId) {
            // Fallback 2: extract from cookies (notion_user_id cookie)
            const cookies = document.cookie.split(';');
            for (const cookie of cookies) {
                const [name, value] = cookie.trim().split('=');
                if (name === 'notion_user_id' && value) {
                    userId = value;
                    break;
                }
            }
        }

        return userId;
    }

    // Check both lock and verification status with single API call
    async function checkPageStatus() {
        try {
            // Get block ID from storage (extracted from current page URL)
            const { blockId } = await new Promise(resolve =>
                chrome.storage.local.get(['blockId'], resolve)
            ).catch(() => ({}));
            if (!blockId) {
                return { locked: false, verified: false, verificationDate: null };
            }

            // Get space ID from storage
            const { spaceId } = await new Promise(resolve =>
                chrome.storage.local.get(['spaceId'], resolve)
            ).catch(() => ({}));

            if (!spaceId) {
                return { locked: false, verified: false, verificationDate: null };
            }

            // Get page info to check both lock and verification status
            const checkUrl = `https://www.notion.so/api/v3/loadPageChunk`;
            const checkHeaders = {
                'accept': '*/*',
                'content-type': 'application/json'
            };
            const checkBody = JSON.stringify({
                pageId: blockId,
                limit: 50,
                chunkNumber: 0,
                verticalColumns: false
            });

            const response = await fetch(checkUrl, {
                method: 'POST',
                headers: checkHeaders,
                body: checkBody,
                credentials: 'same-origin'
            });

            if (!response.ok) {
                return { locked: false, verified: false, verificationDate: null };
            }

            const pageData = await response.json();

            // Check if the page block has format.block_locked = true
            const block = pageData?.recordMap?.block?.[blockId]?.value;
            const isLocked = block?.format?.block_locked === true;

            // Check if the page block has verification properties set
            const verification = block?.properties?.verification;
            const verificationOwner = block?.properties?.verification_owner;
            const isVerified = verification && verificationOwner &&
                Array.isArray(verification) && verification.length > 0 &&
                Array.isArray(verificationOwner) && verificationOwner.length > 0;

            // Extract verification date from verification property
            let verificationDate = null;
            if (isVerified && Array.isArray(verification) && verification.length >= 3) {
                // Structure: [["‣", [["u", userId]]], [","], ["‣", [["d", {date object}]]]]
                // Date is in verification[2][1][0][1].start_date
                try {
                    const dateElement = verification[2]?.[1]?.[0];
                    if (dateElement && dateElement[0] === 'd' && dateElement[1]?.start_date) {
                        verificationDate = dateElement[1].start_date;
                    }
                } catch (e) {
                    // Date extraction failed, but verification is still true
                }
            }

            return { locked: isLocked, verified: isVerified, verificationDate };

        } catch (error) {
            // If we can't check, assume both false
            return { locked: false, verified: false, verificationDate: null };
        }
    }

    // Block page function that runs in the content script context
    async function blockPageFromContentScript() {
        try {
            // Get block ID from storage (extracted from current page URL)
            const { blockId } = await new Promise(resolve =>
                chrome.storage.local.get(['blockId'], resolve)
            ).catch(() => ({}));
            if (!blockId) {
                throw new Error('Extension context invalidated');
            }

            // Get space ID from storage
            const { spaceId } = await new Promise(resolve =>
                chrome.storage.local.get(['spaceId'], resolve)
            ).catch(() => ({}));

            if (!spaceId) {
                throw new Error('No space ID found. Please visit a Notion page first.');
            }

            // Get user ID
            const userId = await getUserId();
            if (!userId) {
                throw new Error('User ID not found in headers or cookies');
            }

            // Check current lock status and toggle
            const currentlyLocked = await checkPageStatus().then(s => s.locked);
            const newLockState = !currentlyLocked;

            // Generate IDs
            const requestId = crypto.randomUUID();
            const transactionId = crypto.randomUUID();

            // Build payload with the toggled state
            const payload = {
                requestId,
                transactions: [{
                    id: transactionId,
                    spaceId,
                    debug: { userAction: "actionRegistry.createToggleAction" },
                    operations: [
                        {
                            pointer: { id: blockId, table: "block", spaceId },
                            path: ["format"],
                            command: "update",
                            args: { block_locked: newLockState, block_locked_by: userId }
                        },
                        {
                            pointer: { id: blockId, table: "block", spaceId },
                            path: [],
                            command: "update",
                            args: {
                                last_edited_time: Date.now(),
                                last_edited_by_id: userId,
                                last_edited_by_table: "notion_user"
                            }
                        }
                    ]
                }]
            };

            // Make API call from content script context (has full cookie access)
            const apiUrl = 'https://www.notion.so/api/v3/saveTransactionsFanout';
            const requestHeaders = {
                'accept': '*/*',
                'content-type': 'application/json'
            };
            const requestBody = JSON.stringify(payload);

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: requestHeaders,
                body: requestBody,
                credentials: 'same-origin'
            });
            if (!response.ok) {
                throw new Error(`API Error ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            throw error;
        }
    }

    // Verify page function that runs in the content script context
    async function verifyPageFromContentScript() {
        try {
            // Get block ID from storage (extracted from current page URL)
            const { blockId } = await new Promise(resolve =>
                chrome.storage.local.get(['blockId'], resolve)
            ).catch(() => ({}));
            if (!blockId) {
                throw new Error('Extension context invalidated');
            }

            // Get space ID from storage
            const { spaceId } = await new Promise(resolve =>
                chrome.storage.local.get(['spaceId'], resolve)
            ).catch(() => ({}));

            if (!spaceId) {
                throw new Error('No space ID found. Please visit a Notion page first.');
            }

            // Get user ID
            const userId = await getUserId();
            if (!userId) {
                throw new Error('User ID not found in headers or cookies');
            }

            // Generate IDs
            const requestId = crypto.randomUUID();
            const transactionId = crypto.randomUUID();

            // Build payload for verification (matching successful curl request)
            const payload = {
                requestId,
                transactions: [{
                    id: transactionId,
                    spaceId,
                    debug: { userAction: "PageAddVerificationButton.verifyPage" },
                    operations: [
                        {
                            pointer: { id: blockId, table: "block", spaceId },
                            path: ["properties", "verification"],
                            command: "set",
                            args: [
                                ["‣", [["u", userId]]],
                                [","],
                                ["‣", [["d", {
                                    type: "datetime",
                                    start_date: new Date().toISOString().split('T')[0],
                                    start_time: "00:00",
                                    time_zone: "Europe/Berlin"
                                }]]]
                            ]
                        },
                        {
                            path: ["properties", "verification_owner"],
                            pointer: { id: blockId, table: "block", spaceId },
                            command: "addPersonAfter",
                            args: {
                                pointer: {
                                    table: "notion_user",
                                    id: userId
                                }
                            }
                        },
                        {
                            pointer: { id: blockId, table: "block", spaceId },
                            path: [],
                            command: "update",
                            args: {
                                last_edited_time: Date.now(),
                                last_edited_by_id: userId,
                                last_edited_by_table: "notion_user"
                            }
                        }
                    ]
                }]
            };

            // Make API call from content script context (has full cookie access)
            const apiUrl = 'https://www.notion.so/api/v3/saveTransactionsFanout';
            const requestHeaders = {
                'accept': '*/*',
                'content-type': 'application/json'
            };
            const requestBody = JSON.stringify(payload);

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: requestHeaders,
                body: requestBody,
                credentials: 'same-origin'
            });

            if (!response.ok) {
                throw new Error(`API Error ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            throw error;
        }
    }
})();


