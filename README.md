# NOTION EXTENSION

An extension that enables locking notion pages with shortcuts

## INSTALLATION

1. Clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select this folder
5. Pin the extension to your toolbar

## USAGE

- Press shortcut on a notion page to block the page or unblock it

## FILES

- `manifest.json` - Extension configuration
- `src/background.js` - Background service worker
- `src/popup.html` - Extension popup interface
- `src/popup.js` - Extension popup logic
- `src/content.js` - Content script
- `extension-icon.png` - Extension icon

## DEVELOPMENT

Edit `src/background.js` to modify blocking criteria or `src/popup.js` to change the UI.

## CHROME EXTENSION DEVELOPMENT

### UPDATES

Chrome Policy -> updates.xml -> point to crx location

### REFERENCE

<https://developer.chrome.com/docs/apps/autoupdate#update_manifest>
