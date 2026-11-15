#!/usr/bin/env bash
# Step 0: repo की सफ़ाई। GitHub clone के root से चलाएं।
set -euo pipefail

# 1. icon-192 को सही folder में लाएं (trailing-space वाले folder से)
if [ -d "public/icons " ] && [ -f "public/icons /icon-192.png" ]; then
  mkdir -p public/icons
  mv "public/icons /icon-192.png" "public/icons/icon-192.png"
  rmdir "public/icons "
  echo "ok: icon-192.png सही जगह पर"
fi

# 2. stray duplicate हटाएं, सिर्फ़ तब जब वो असली फ़ाइल की हूबहू नकल हो
if [ -f "lib/lib/usage-rules.ts " ] && cmp -s "lib/usage-rules.ts" "lib/lib/usage-rules.ts "; then
  rm -r lib/lib
  echo "ok: lib/lib हटाया (identical duplicate)"
fi

# 3. बेकार route (कोई reference नहीं) हटाएं
if [ -f "app/api/finance/answer/route.ts " ]; then
  rm "app/api/finance/answer/route.ts "
  rmdir app/api/finance/answer 2>/dev/null || true
  echo "ok: बेकार finance/answer route हटाया"
fi

# 4. font folder बनाएं (फ़ाइल आपको रखनी है, नीचे देखें)
mkdir -p public/fonts

# 5. जांच: कोई trailing-space वाला नाम बाकी न हो
if find . -path ./node_modules -prune -o -name "* " -print | grep -q .; then
  echo "चेतावनी: अभी भी trailing-space वाले नाम हैं:"
  find . -path ./node_modules -prune -o -name "* " -print
  exit 1
fi

echo "Step 0 cleanup पूरा। अब font फ़ाइल रखें और build चलाएं।"