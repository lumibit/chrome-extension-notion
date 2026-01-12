#!/bin/bash

# Notion Extension - Package Script
# This script packages the Chrome extension for distribution as a CRX file

set -e  # Exit on any error

# Configuration
VERSION=$(grep '"version"' manifest.json | cut -d'"' -f4)
PACKAGE_DIR="dist"
CRX_FILE="extension.crx"

echo "Packaging Notion Extension v${VERSION}"

# Check if PRIVATE_KEY environment variable is set
if [ -z "$PRIVATE_KEY" ]; then
    echo "Error: PRIVATE_KEY environment variable is not set!"
    echo "   Please set the PRIVATE_KEY environment variable with your private key content:"
    echo "   export PRIVATE_KEY=\$(cat extension-key.pem)"
    exit 1
fi

# Clean previous builds
rm -rf "$PACKAGE_DIR" "$CRX_FILE"

# Create package directory and copy extension files
echo "Copying extension files..."
mkdir -p "$PACKAGE_DIR"
cp manifest.json extension-icon.png "$PACKAGE_DIR/" 2>/dev/null || true
[ -d "src" ] && cp -r src "$PACKAGE_DIR/"

# Create CRX file using Chrome's official packaging method
echo "Creating CRX package with private key..."
# Convert escaped newlines to actual newlines and write key file
echo "$PRIVATE_KEY" | sed 's/\\n/\n/g' > temp_private_key.pem

# Chrome requires PKCS#8 format, convert if needed
if grep -q "BEGIN RSA PRIVATE KEY" temp_private_key.pem 2>/dev/null; then
    echo "Converting private key to PKCS#8 format..."
    openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in temp_private_key.pem -out temp_private_key_pkcs8.pem 2>/dev/null
    if [ -f temp_private_key_pkcs8.pem ] && [ -s temp_private_key_pkcs8.pem ]; then
        mv temp_private_key_pkcs8.pem temp_private_key.pem
    else
        echo "Warning: Key conversion failed, using original key"
    fi
fi

# Verify key file is valid
if ! grep -q "BEGIN.*PRIVATE KEY" temp_private_key.pem 2>/dev/null; then
    echo "Error: Invalid private key format"
    exit 1
fi

# Find Chrome executable
CHROME_CMD=""
for cmd in chrome google-chrome google-chrome-stable chromium-browser \
           "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
           "/Applications/Chromium.app/Contents/MacOS/Chromium"; do
    if command -v "$cmd" &> /dev/null || [ -f "$cmd" ]; then
        CHROME_CMD="$cmd"
        break
    fi
done

[ -z "$CHROME_CMD" ] && { echo "Error: Chrome/Chromium not found"; exit 1; }

# Package extension with Chrome
# Chrome requires absolute paths for --pack-extension and --pack-extension-key
PACKAGE_DIR_ABS=$(cd "$PACKAGE_DIR" && pwd)
KEY_FILE_ABS=$(cd "$(dirname temp_private_key.pem)" && pwd)/$(basename temp_private_key.pem)

# On macOS, avoid --no-sandbox; on Linux/CI it's needed for headless
if [[ "$OSTYPE" == "darwin"* ]]; then
    "$CHROME_CMD" --pack-extension="$PACKAGE_DIR_ABS" --pack-extension-key="$KEY_FILE_ABS" 2>&1
else
    "$CHROME_CMD" --pack-extension="$PACKAGE_DIR_ABS" --pack-extension-key="$KEY_FILE_ABS" --no-sandbox 2>&1
fi

# Move CRX file to expected location (Chrome creates it with directory name)
[ -f "${PACKAGE_DIR}.crx" ] && mv "${PACKAGE_DIR}.crx" "$CRX_FILE"

# Clean up and verify
rm -f temp_private_key.pem
[ ! -f "$CRX_FILE" ] && { echo "Error: Failed to create CRX file"; exit 1; }

# Update version in docs/updates.xml
if [ -f docs/updates.xml ]; then
    sed -i.bak -E "s/(<updatecheck[^>]*version=')[^']*'/\1$VERSION'/" docs/updates.xml 2>/dev/null || \
    sed -i '' -E "s/(<updatecheck[^>]*version=')[^']*'/\1$VERSION'/" docs/updates.xml
    rm -f docs/updates.xml.bak
    echo "Updated docs/updates.xml to version $VERSION"
fi

# Display results
echo ""
echo "CRX package created successfully!"
echo "Package: $CRX_FILE"
echo "Size: $(du -h "$CRX_FILE" | cut -f1)" 
