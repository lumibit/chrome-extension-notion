#!/bin/bash

# Notion Extension - Package Script
# This script packages the Chrome extension for distribution as a CRX file

set -e  # Exit on any error

# Configuration
EXTENSION_NAME="notion"
VERSION=$(grep '"version"' manifest.json | cut -d'"' -f4)
PACKAGE_DIR="dist"
ZIP_FILE="notion.zip"
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
if [ -d "$PACKAGE_DIR" ]; then
    echo "Cleaning previous build..."
    rm -rf "$PACKAGE_DIR"
fi

# Remove previous CRX file if it exists
if [ -f "$CRX_FILE" ]; then
    echo "Removing previous CRX file..."
    rm -f "$CRX_FILE"
fi

# Create package directory
echo "Creating package directory..."
mkdir -p "$PACKAGE_DIR"

# Copy extension files
echo "Copying extension files..."
# Copy root-level extension files
cp manifest.json "$PACKAGE_DIR/" 2>/dev/null || true
cp extension-icon.png "$PACKAGE_DIR/" 2>/dev/null || true

# Copy all files from src/ directory
if [ -d "src" ]; then
    find src -type f | while IFS= read -r file; do
        # Ensure target directory exists
        target_dir=$(dirname "$PACKAGE_DIR/$file")
        mkdir -p "$target_dir"
        cp "$file" "$PACKAGE_DIR/$file"
    done
fi

# Create zip file (required for CRX creation)
echo "Creating temporary zip package..."
cd "$PACKAGE_DIR"
zip -r "../$ZIP_FILE" . -x "*.DS_Store" "*/.DS_Store"
cd ..

# Create CRX file using Chrome's crx tool
echo "Creating CRX package with private key..."
if command -v crx &> /dev/null; then
    # Write private key from environment variable to temporary file
    # GitHub secrets may store newlines as \n (escaped), so we need to convert them to actual newlines
    # Use printf with %b to interpret escape sequences like \n
    printf '%b\n' "$PRIVATE_KEY" > temp_private_key.pem
    
    # Convert private key to PKCS#8 format (required for Node.js v20 OpenSSL)
    # Chrome extensions typically use PKCS#1 format, but Node.js v20 requires PKCS#8
    echo "Converting private key to PKCS#8 format for Node.js v20 compatibility..."
    if openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in temp_private_key.pem -out temp_private_key_pkcs8.pem 2>&1; then
        if [ -f temp_private_key_pkcs8.pem ] && [ -s temp_private_key_pkcs8.pem ]; then
            KEY_FILE="temp_private_key_pkcs8.pem"
            echo "Key successfully converted to PKCS#8 format"
        else
            KEY_FILE="temp_private_key.pem"
            echo "Conversion produced empty file, using original key"
        fi
    else
        # If conversion fails, the key might already be in PKCS#8 format
        KEY_FILE="temp_private_key.pem"
        echo "Key conversion failed, using original key (may already be in compatible format)"
    fi
    
    # Use crx tool with the converted key
    crx pack "$PACKAGE_DIR" -p "$KEY_FILE" -o "$CRX_FILE"
    
    # Clean up temporary key files
    rm -f temp_private_key.pem temp_private_key_pkcs8.pem
    
    # Verify CRX file was created
    if [ ! -f "$CRX_FILE" ]; then
        echo "Error: Failed to create CRX file"
        exit 1
    fi
else
    echo "Error: 'crx' tool not found!"
    echo "   Please install the 'crx' tool to create CRX files: npm install -g crx@latest"
    exit 1
fi


# Keep the package directory for unpacked loading
echo "Package directory kept for unpacked loading: $PACKAGE_DIR"
rm -f "$ZIP_FILE"

# Update the version in updates.xml from manifest.json

# Extract version from manifest.json
MANIFEST_VERSION=$(grep '"version"' manifest.json | head -1 | sed -E 's/.*"version": *"([^"]+)".*/\1/')

if [ -z "$MANIFEST_VERSION" ]; then
    echo "Error: Could not extract version from manifest.json"
    exit 1
fi

# Update the version attribute in updates.xml
if [ -f updates.xml ]; then
    # Use sed to replace the version attribute in the updatecheck tag
    sed -i.bak -E "s/(<updatecheck[^>]*version=')[^']*'/\1$MANIFEST_VERSION'/" updates.xml
    rm -f updates.xml.bak
    echo "Updated updates.xml to version $MANIFEST_VERSION"
else
    echo "Warning: updates.xml not found, skipping version update."
fi


# Display results
echo ""
if [ -f "$CRX_FILE" ]; then
    echo "CRX package created successfully!"
    echo "Package: $CRX_FILE"
    echo "Size: $(du -h "$CRX_FILE" | cut -f1)"
else
    echo "CRX package could not be created, but ZIP file was available"
    echo "   Please ensure Chrome/Chromium is installed or use the 'crx' tool."
fi 
