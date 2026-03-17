# Greengrass V2 Docker image for Raspberry Pi (aarch64 ARM v8.0)
# Plan B: Greengrass Core + Node.js + Python + ffmpeg を単一コンテナに統合
# FrameCapture 等のカスタムコンポーネントをコンテナ内で実行する

FROM debian:bullseye-slim

ARG GREENGRASS_RELEASE_VERSION=latest
ARG GREENGRASS_ZIP_FILE=greengrass-${GREENGRASS_RELEASE_VERSION}.zip
ARG GREENGRASS_RELEASE_URI=https://d2s8p88vqu9w66.cloudfront.net/releases/${GREENGRASS_ZIP_FILE}

LABEL maintainer="NoEatToStop"
LABEL greengrass-version=${GREENGRASS_RELEASE_VERSION}

ENV TINI_KILL_PROCESS_GROUP=1 \
    GGC_ROOT_PATH=/greengrass/v2 \
    PROVISION=false \
    AWS_REGION=ap-northeast-1 \
    THING_NAME=default_thing_name \
    THING_GROUP_NAME=default_thing_group_name \
    TES_ROLE_NAME=default_tes_role_name \
    TES_ROLE_ALIAS_NAME=default_tes_role_alias_name \
    COMPONENT_DEFAULT_USER=default_component_user \
    DEPLOY_DEV_TOOLS=false \
    INIT_CONFIG=default_init_config \
    TRUSTED_PLUGIN=default_trusted_plugin_path \
    THING_POLICY_NAME=default_thing_policy_name

COPY "greengrass-entrypoint.sh" /
COPY "modify-sudoers.sh" /

# --- Base: Greengrass Core + Java 11 ---
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      openjdk-11-jre-headless \
      curl \
      unzip \
      sudo \
      tini \
      ca-certificates \
      gnupg \
    && rm -rf /var/lib/apt/lists/*

# --- Node.js 22 (LTS, NodeSource) ---
# Note: Node.js 24 は 2025-10 リリースで bullseye 向けビルドが不安定のため 22 LTS を採用
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    rm -rf /var/lib/apt/lists/*

# --- Python 3.11 (deadsnakes PPA は Debian 未対応のため、ソースビルド) ---
# bullseye の標準 Python は 3.9。3.11+ はソースビルドが必要
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      python3 \
      python3-pip \
    && rm -rf /var/lib/apt/lists/* \
    && python3 --version

# --- ffmpeg ---
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg && \
    rm -rf /var/lib/apt/lists/*

# --- Greengrass V2 インストール ---
RUN curl -sL ${GREENGRASS_RELEASE_URI} -o /tmp/${GREENGRASS_ZIP_FILE} && \
    chmod +x /greengrass-entrypoint.sh /modify-sudoers.sh && \
    mkdir -p /opt/greengrassv2 ${GGC_ROOT_PATH} && \
    unzip /tmp/${GREENGRASS_ZIP_FILE} -d /opt/greengrassv2 && \
    rm /tmp/${GREENGRASS_ZIP_FILE} && \
    ./modify-sudoers.sh

# --- FrameCapture コンポーネント用アーティファクト ---
COPY components/ /opt/greengrass-components/

ENTRYPOINT ["/greengrass-entrypoint.sh"]
