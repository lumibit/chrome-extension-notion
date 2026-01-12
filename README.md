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
- Default shortcut: `Ctrl+B` (Windows/Linux) or `Command+B` (Mac)
- If the keyboard shortcut doesn't work after installation, enable it at <chrome://extensions/shortcuts>

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

### EXTENSION ID

The Chrome extension ID is derived from the public key that corresponds to the private key used to sign the extension. The ID is calculated as the first 16 bytes of the SHA-256 hash of the public key, encoded using Chrome's modified base-16 scheme:

- Digits 0-9 map to 'a'-'j'
- Hex digits a-f map to 'k'-'p'

**Important**: To maintain a consistent extension ID across builds:

1. Always use the same private key stored in GitHub secrets (`PRIVATE_KEY`)
2. Never regenerate or change the private key
3. The extension ID in `docs/updates.xml` must match the ID calculated from your private key

To calculate the extension ID from a private key:

```bash
# Get hex representation
HEX_ID=$(openssl rsa -in private_key.pem -pubout -outform DER | \
  openssl dgst -sha256 -binary | \
  head -c 16 | \
  xxd -p -c 16 | \
  tr '[:upper:]' '[:lower:]')
# Convert to Chrome encoding
echo "$HEX_ID" | sed 'y/0123456789abcdef/abcdefghijklmnop/'
```

Or use the provided script:

```bash
./.github/workflows/calculate-extension-id.sh private_key.pem
```

Current extension ID: `gofhdpohklfhpgicmgopemfkjojdikco`

### UPDATES

Chrome Policy -> updates.xml -> point to crx location

The `appid` in `docs/updates.xml` must match the extension ID calculated from your signing key.

### REFERENCE

<https://developer.chrome.com/docs/apps/autoupdate#update_manifest>
