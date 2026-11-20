#!/usr/bin/env bash
# Sthamly: repo ki safai (dobara). Repo ke root se chalayein: bash scripts/step0-cleanup.sh
# Sirf wahi karti hai jo pakka sahi hai. Jo file do jagah alag hai, usse nahi chhedti, sirf batati hai.
set -euo pipefail

failed=0

info() { echo "ok: $*"; }
warn() { echo "chetavni: $*"; }

# src ko dst par le jaata hai.
# dst par pehle se same copy ho to src hata deta hai. Alag copy ho to kuch nahi karta.
move_file() {
  local src="$1" dst="$2"
  [ -f "$src" ] || return 0
  mkdir -p "$(dirname "$dst")"
  if [ -f "$dst" ]; then
    if cmp -s "$src" "$dst"; then
      rm "$src"
      info "$src hataya (destination par same copy hai)"
    else
      warn "$src aur $dst alag hain. Dono ko khud dekh kar decide karein. Ye file nahi chhedi."
      return 1
    fi
  else
    mv "$src" "$dst"
    info "$src -> $dst"
  fi
}

# 1. public/icons (trailing space wala folder) ki icon sahi folder mein.
move_file "public/icons /icon-192.png" "public/icons/icon-192.png" || failed=1
rmdir "public/icons " 2>/dev/null || true

# 2. Root par ' worker' (leading space) folder ki test file worker/test/ mein.
move_file " worker/test/rls.test.ts" "worker/test/rls.test.ts" || failed=1
rmdir " worker/test" 2>/dev/null || true
rmdir " worker" 2>/dev/null || true

# 3. Notebook route ka trailing-space duplicate. Asli route.ts se same ho to hata dega.
move_file "app/api/notebook/notes/[id]/route.ts " "app/api/notebook/notes/[id]/route.ts" || failed=1

# 4. Nested worker/src/worker ka duplicate images route.
#    Uske imports galat path par hain (kabhi compile nahi hoga). Sahi version worker/src/routes/images.ts hai.
if [ -d "worker/src/worker" ]; then
  if [ -f "worker/src/routes/images.ts" ]; then
    rm -r "worker/src/worker"
    info "worker/src/worker hataya (duplicate images route)"
  else
    warn "worker/src/routes/images.ts nahi mila. worker/src/worker nahi hataya."
    failed=1
  fi
fi

# 5. Hindi PDF ke liye font folder. Font file khud aapko rakhni hai.
mkdir -p "public/fonts"
info "public/fonts/ taiyaar hai"

# 6. Final check: koi bhi naam jo space se shuru ya khatam ho, wo baaki nahi hona chahiye.
bad=$(find . \( -path ./node_modules -o -path ./.git \) -prune -o \( -name '* ' -o -name ' *' \) -print)
if [ -n "$bad" ]; then
  warn "ye naam abhi bhi space wale hain:"
  echo "$bad"
  failed=1
fi

echo
if [ "$failed" -ne 0 ]; then
  echo "Cleanup poora nahi hua. Upar ki chetavniyan dekhein."
  exit 1
fi

echo "Cleanup poora hua. Ab ye manual steps baaki hain:"
echo "  - NotoSansDevanagari-Regular.ttf ko public/fonts/ mein rakhein."
echo "  - root, web, worker aur shell mein 'npm install' chalakar package-lock.json banayein aur commit karein (CI ke liye zaroori)."
echo "  - worker/wrangler.toml ke production placeholders (REPLACE-WITH-PROD-*) tab bharein jab prod setup ho."