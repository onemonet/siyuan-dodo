pnpm run build
PLUGIN_NAME=$(node -p "require('./plugin.json').name")
TARGET_DIR="${SIYUAN_PLUGIN_DIR:-$HOME/SiYuan/data/plugins}"
rm -rf "$TARGET_DIR/$PLUGIN_NAME"
cp -r "$(pwd)/dist" "$TARGET_DIR/$PLUGIN_NAME"
