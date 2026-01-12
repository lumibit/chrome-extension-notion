// Captures selected request headers for Notion requests and stores them.
(function () {
    // Capture all relevant headers for Notion API calls
    // Note: We can't capture cookies directly, but we can capture other auth headers
    const CAPTURE_HEADERS = [
        'accept',
        'accept-language',
        'content-type',
        'notion-audit-log-platform',
        'notion-client-version',
        'x-notion-active-user-header',
        'x-notion-space-id',
        'priority',
        'sec-ch-ua',
        'sec-ch-ua-mobile',
        'sec-ch-ua-platform',
        'sec-fetch-dest',
        'sec-fetch-mode',
        'sec-fetch-site'
    ];

    function toLowerSet(list) {
        const set = new Set();
        for (const item of list) set.add(item.toLowerCase());
        return set;
    }

    const captureHeaderSet = toLowerSet(CAPTURE_HEADERS);

    function indexHeadersByName(requestHeaders) {
        const indexed = {};
        if (!Array.isArray(requestHeaders)) return picked;
        for (const header of requestHeaders) {
            const name = header && header.name ? header.name : '';
            if (!name) continue;
            indexed[name] = header.value || '';
        }
        return indexed;
    }

    function pickHeadersForApi(requestHeaders) {
        const rawIndexed = indexHeadersByName(requestHeaders);
        const rawOut = {};
        const apiOut = {};

        // Save all encountered headers (raw) and a clean subset for API usage (apiOut)
        for (const [name, value] of Object.entries(rawIndexed)) {
            rawOut[name] = value;
            const lower = name.toLowerCase();
            if (captureHeaderSet.has(lower)) {
                // normalize keys to standard lower-case names commonly used in fetch header objects
                apiOut[lower] = value;
            }
        }
        return { rawOut, apiOut };
    }

    chrome.webRequest.onBeforeSendHeaders.addListener(
        (details) => {
            const { rawOut, apiOut } = pickHeadersForApi(details.requestHeaders);
            const updates = {};
            if (Object.keys(rawOut).length > 0) {
                updates.notionHeadersRaw = rawOut;
            }
            if (Object.keys(apiOut).length > 0) {
                updates.notionHeadersForApi = apiOut;
                // Also sync spaceId from header if present
                if (apiOut['x-notion-space-id']) {
                    updates.spaceId = apiOut['x-notion-space-id'];
                }
            }
            if (Object.keys(updates).length > 0) {
                chrome.storage.local.set(updates);
            }
        },
        {
            urls: [
                "https://notion.so/*",
                "https://www.notion.so/*",
                "https://api.notion.so/*"
            ]
        },
        ["requestHeaders", "extraHeaders"]
    );

           // Handle keyboard shortcuts
           chrome.commands.onCommand.addListener((command) => {
               if (command === 'lock-page') {
                   lockCurrentPage();
               }
           });

    // Function to lock the current active page
    async function lockCurrentPage() {
        try {
            // Get current active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

            if (!tab?.url?.includes('notion')) {
                return;
            }

            // Send block request to content script
            const response = await chrome.tabs.sendMessage(tab.id, { action: 'blockPage' });

            if (response.success) {
                chrome.tabs.sendMessage(tab.id, { action: 'log', message: 'Page lock toggled successfully' });
            } else {
                chrome.tabs.sendMessage(tab.id, { action: 'log', message: 'Toggle failed: ' + response.error });
            }
        } catch (error) {
            // Extension context may be invalidated - silently ignore
        }
    }
})();


