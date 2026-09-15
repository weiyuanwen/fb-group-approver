#!/usr/bin/env bash
# Xác minh Node, thư viện Chrome, và (nếu có) session Facebook.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== Node =="
command -v node
node -v
[[ "$(node -p "process.versions.node.split('.')[0]")" -ge 20 ]]
echo "OK node >= 20"

echo
echo "== npm =="
command -v npm
npm -v

echo
echo "== Chrome system libs (Ubuntu) =="
if command -v dpkg >/dev/null 2>&1; then
  missing=0
  for pkg in libnss3 libgbm1 libatk-bridge2.0-0t64 libasound2t64 fonts-liberation; do
    if dpkg -s "$pkg" >/dev/null 2>&1; then
      echo "OK  $pkg"
    else
      echo "MISS $pkg"
      missing=1
    fi
  done
  if [[ "$missing" -ne 0 ]]; then
    echo "Thiếu gói. Chạy: bash scripts/install-ubuntu.sh"
    exit 1
  fi
else
  echo "Bỏ qua dpkg (không phải Ubuntu)."
fi

echo
echo "== Puppeteer Chrome binary =="
if [[ ! -d node_modules/puppeteer ]]; then
  echo "Chưa npm install. Chạy: npm install"
  exit 1
fi

echo
echo "== Launch Chrome =="
node --input-type=module <<'JS'
import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
});
const version = await browser.version();
console.log('OK Chrome', version);
await browser.close();
JS

if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  set -a
  source .env
  set +a
fi
PROFILE="${FB_USER_DATA_DIR:-./data/chrome-profile}"
echo
echo "== Session dir: $PROFILE =="
if [[ -d "$PROFILE" ]] && [[ -n "$(ls -A "$PROFILE" 2>/dev/null || true)" ]]; then
  echo "OK có userDataDir"
else
  echo "CHƯA CÓ session. Chạy npm run login trên máy cá nhân rồi rsync lên VPS."
fi

echo
echo "check-env xong."
