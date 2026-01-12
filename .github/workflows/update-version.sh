#!/bin/bash

# Usage: ./update-version.sh <package.json_path> [major|minor|patch]
#   package.json_path: path to the package.json file
#   version_bump_type: major, minor, or patch (default: patch)

if [ $# -lt 1 ]; then
    echo "Usage: $0 <package.json_path> [major|minor|patch]" >&2
    echo "  package.json_path: path to the package.json file" >&2
    echo "  version_bump_type: major, minor, or patch (default: patch)" >&2
    exit 1
fi

PACKAGE_JSON_PATH="$1"
VERSION_BUMP_TYPE="${2:-patch}"

# Validate package.json path
if [ ! -f "$PACKAGE_JSON_PATH" ]; then
    echo "Error: package.json not found at $PACKAGE_JSON_PATH" >&2
    exit 1
fi

# Validate version bump type
case "$VERSION_BUMP_TYPE" in
    major|minor|patch)
        ;;
    *)
        echo "Error: Invalid version bump type '$VERSION_BUMP_TYPE'. Must be major, minor, or patch." >&2
        exit 1
        ;;
esac

# Get current version from package.json
CURRENT_VERSION=$(jq -r '.version' "$PACKAGE_JSON_PATH")
echo "Current version: $CURRENT_VERSION" >&2

# Parse version components
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

# Calculate new version based on bump type
case "$VERSION_BUMP_TYPE" in
    major)
        NEW_MAJOR=$((MAJOR + 1))
        NEW_MINOR=0
        NEW_PATCH=0
        NEW_VERSION="$NEW_MAJOR.$NEW_MINOR.$NEW_PATCH"
        ;;
    minor)
        NEW_MAJOR=$MAJOR
        NEW_MINOR=$((MINOR + 1))
        NEW_PATCH=0
        NEW_VERSION="$NEW_MAJOR.$NEW_MINOR.$NEW_PATCH"
        ;;
    patch)
        NEW_MAJOR=$MAJOR
        NEW_MINOR=$MINOR
        NEW_PATCH=$((PATCH + 1))
        NEW_VERSION="$NEW_MAJOR.$NEW_MINOR.$NEW_PATCH"
        ;;
esac

# Log the new version
echo "New version: $NEW_VERSION" >&2

# Return only the new version
echo "$NEW_VERSION"

