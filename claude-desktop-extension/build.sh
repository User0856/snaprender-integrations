#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MCP_DIR="$SCRIPT_DIR/../mcp-server"
BUILD_DIR="$SCRIPT_DIR/server"

echo "Building SnapRender Claude Desktop Extension..."

# Clean previous build
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# Build the MCP server
echo "Compiling MCP server..."
cd "$MCP_DIR"
npm run build

# Copy compiled server
cp "$MCP_DIR/dist/index.js" "$BUILD_DIR/index.js"

# Install production dependencies into the extension
echo "Installing production dependencies..."
cp "$MCP_DIR/package.json" "$BUILD_DIR/package.json"
cd "$BUILD_DIR"
npm install --omit=dev --ignore-scripts 2>/dev/null

# Clean unnecessary files from node_modules
find "$BUILD_DIR/node_modules" -name "*.d.ts" -delete 2>/dev/null || true
find "$BUILD_DIR/node_modules" -name "*.map" -delete 2>/dev/null || true
find "$BUILD_DIR/node_modules" -name "*.md" -not -name "LICENSE*" -delete 2>/dev/null || true
find "$BUILD_DIR/node_modules" -name "CHANGELOG*" -delete 2>/dev/null || true
find "$BUILD_DIR/node_modules" -type d -name "__tests__" -exec rm -rf {} + 2>/dev/null || true
find "$BUILD_DIR/node_modules" -type d -name "test" -exec rm -rf {} + 2>/dev/null || true
rm -f "$BUILD_DIR/package.json" "$BUILD_DIR/package-lock.json"

cd "$SCRIPT_DIR"

# Pack the extension
if command -v mcpb &> /dev/null; then
  echo "Packing with mcpb..."
  mcpb pack .
else
  echo ""
  echo "Extension built successfully in $BUILD_DIR"
  echo ""
  echo "To create the .mcpb file, install the packing tool and run:"
  echo "  npm install -g @anthropic-ai/mcpb"
  echo "  cd $SCRIPT_DIR && mcpb pack ."
fi

echo "Done."
