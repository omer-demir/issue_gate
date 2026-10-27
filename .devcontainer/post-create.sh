#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

npm ci --prefix backend
npm ci --prefix web

if [[ ! -e web/.env.local ]]; then
    cp web/.env.example web/.env.local
fi

cd mobile
flutter pub get
