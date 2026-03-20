# Greengrass V2 + Node.js 22 + Python 3 + ffmpeg + OpenCV
# Plan B/C: 単一コンテナ統合（RPi 3B 向け、ChewingAnalyzer 含む）

FROM debian:bullseye-slim

ARG GREENGRASS_RELEASE_VERSION=latest
ARG GREENGRASS_ZIP_FILE=greengrass-${GREENGRASS_RELEASE_VERSION}.zip
ARG GREENGRASS_RELEASE_URI=https://d2s8p88vqu9w66.cloudfront.net/releases/${GREENGRASS_ZIP_FILE}

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

# 全依存を単一 RUN で install → cleanup してレイヤーサイズを最小化
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      openjdk-11-jre-headless \
      python3 \
      python3-pip \
      python3-numpy \
      python3-opencv \
      ffmpeg \
      curl \
      unzip \
      sudo \
      tini \
      ca-certificates \
      gnupg \
    && \
    # Python パッケージ（ChewingAnalyzer 用）
    pip3 install --no-cache-dir boto3 && \
    # Node.js 22 LTS (NodeSource)
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    # Greengrass V2
    curl -sL ${GREENGRASS_RELEASE_URI} -o /tmp/gg.zip && \
    chmod +x /greengrass-entrypoint.sh /modify-sudoers.sh && \
    mkdir -p /opt/greengrassv2 ${GGC_ROOT_PATH} && \
    unzip /tmp/gg.zip -d /opt/greengrassv2 && \
    /modify-sudoers.sh && \
    # Cleanup
    rm -f /tmp/gg.zip && \
    apt-get purge -y --auto-remove gnupg unzip python3-pip && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* /root/.npm

# FrameCapture コンポーネント
COPY components/ /opt/greengrass-components/

ENTRYPOINT ["/greengrass-entrypoint.sh"]
