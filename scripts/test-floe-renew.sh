#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d -t floe-renew-test-XXXXXX)"
trap 'rm -rf "$TMP_DIR"' EXIT

FAKE_CURL_LOG="$TMP_DIR/curl.log"
FAKE_CURL_CAPTURE="$TMP_DIR/curl.capture"

cat >"$TMP_DIR/curl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

log="${FAKE_CURL_LOG:?missing FAKE_CURL_LOG}"
capture="${FAKE_CURL_CAPTURE:?missing FAKE_CURL_CAPTURE}"

method=""
url=""
body=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    -X)
      method="${2:-}"
      shift 2
      ;;
    -d)
      body="${2:-}"
      shift 2
      ;;
    http://*|https://*)
      url="$1"
      shift
      ;;
    *)
      shift
      ;;
  esac
done

printf '%s\t%s\t%s\n' "$method" "$url" "$body" >"$capture"
printf '{"success":true,"fileId":"0xfeedface","walrusEndEpoch":42}\n'
EOF
chmod +x "$TMP_DIR/curl"

PATH="$TMP_DIR:$PATH" \
FAKE_CURL_LOG="$FAKE_CURL_LOG" \
FAKE_CURL_CAPTURE="$FAKE_CURL_CAPTURE" \
bash "$ROOT_DIR/scripts/floe.sh" renew 0x0000000000000000000000000000000000000000000000000000000000000001 --epochs 12 --api http://example.test/v1/uploads --json >"$TMP_DIR/output.json"

jq -e '
  .success == true and
  .fileId == "0xfeedface" and
  .walrusEndEpoch == 42
' "$TMP_DIR/output.json" >/dev/null

expected_url='http://example.test/v1/files/0x0000000000000000000000000000000000000000000000000000000000000001/renew'
expected_body='{"epochs":12}'

actual_method="$(cut -f1 "$FAKE_CURL_CAPTURE")"
actual_url="$(cut -f2 "$FAKE_CURL_CAPTURE")"
actual_body="$(cut -f3 "$FAKE_CURL_CAPTURE")"

[[ "$actual_method" == "POST" ]]
[[ "$actual_url" == "$expected_url" ]]
[[ "$actual_body" == "$expected_body" ]]

echo "renew shell wrapper test passed"
