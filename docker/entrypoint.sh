#!/bin/sh
set -eu

if [ "$#" -gt 0 ]; then
  exec "$@"
fi

: "${VAULT_PATH:=/vault}"
: "${OUT_DIR:=/out}"

export VAULT_PATH
export ASTRO_TELEMETRY_DISABLED="${ASTRO_TELEMETRY_DISABLED:-1}"

if [ ! -d "$VAULT_PATH" ]; then
  echo "Vault path does not exist: $VAULT_PATH" >&2
  exit 1
fi

npm run sync:vault
npm run build

if [ -n "$OUT_DIR" ]; then
  mkdir -p "$OUT_DIR"
  rm -rf "$OUT_DIR"/*
  cp -R dist/. "$OUT_DIR"/
  echo "Static site copied to $OUT_DIR"
fi
