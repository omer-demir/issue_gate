FROM node:24-bookworm

ARG FLUTTER_VERSION=3.35.7

USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates caddy curl git libglu1-mesa unzip xz-utils zip \
    && rm -rf /var/lib/apt/lists/*

ENV FLUTTER_ROOT=/home/node/flutter
ENV PATH="/home/node/flutter/bin:/home/node/flutter/bin/cache/dart-sdk/bin:${PATH}"
ENV CI=true

USER node
RUN git clone --depth 1 --branch "${FLUTTER_VERSION}" https://github.com/flutter/flutter.git "${FLUTTER_ROOT}" \
    && flutter config --no-analytics --no-enable-android --no-enable-linux-desktop --no-enable-web \
    && dart --disable-analytics \
    && flutter precache --no-android --no-ios --no-web --no-windows --no-macos \
    && flutter --version \
    && node --version \
    && npm --version \
    && caddy version
