# Greengrass V2 + Node.js (nvm) + Python 3.11 + ffmpeg (static)
# Plan B: 単一コンテナ統合（RPi 3B 向け最小構成）
# Bookworm-slim: Python 3.11 標準、Java 17 JRE-headless
# Node.js: nvm 経由（apt/NodeSource 不要、バージョン切替可能）
# ffmpeg: 静的バイナリ（apt 版は libllvm15 等 300MB+ の依存を回避）

FROM debian:bookworm-slim

ARG GREENGRASS_RELEASE_VERSION=latest
ARG GREENGRASS_ZIP_FILE=greengrass-${GREENGRASS_RELEASE_VERSION}.zip
ARG GREENGRASS_RELEASE_URI=https://d2s8p88vqu9w66.cloudfront.net/releases/${GREENGRASS_ZIP_FILE}
ARG FFMPEG_STATIC_URL=https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-arm64-static.tar.xz
ARG NODE_VERSION=22

ENV TINI_KILL_PROCESS_GROUP=1 \
    GGC_ROOT_PATH=/greengrass/v2 \
    NVM_DIR=/usr/local/nvm \
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

# 単一 RUN: apt 最小 + nvm + 静的 ffmpeg + Greengrass → cleanup
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      openjdk-17-jre-headless \
      python3 \
      curl \
      unzip \
      sudo \
      tini \
      ca-certificates \
      xz-utils \
    && \
    # nvm + Node.js
    mkdir -p ${NVM_DIR} && \
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash && \
    . ${NVM_DIR}/nvm.sh && \
    nvm install ${NODE_VERSION} && \
    nvm alias default ${NODE_VERSION} && \
    ln -s ${NVM_DIR}/versions/node/$(nvm current) ${NVM_DIR}/versions/node/default && \
    # 静的 ffmpeg バイナリ
    curl -sL ${FFMPEG_STATIC_URL} -o /tmp/ff.tar.xz && \
    cd /tmp && tar xf ff.tar.xz --wildcards "*/ffmpeg" --strip-components=1 && \
    mv /tmp/ffmpeg /usr/local/bin/ffmpeg && \
    # Greengrass V2
    curl -sL ${GREENGRASS_RELEASE_URI} -o /tmp/gg.zip && \
    chmod +x /greengrass-entrypoint.sh /modify-sudoers.sh && \
    mkdir -p /opt/greengrassv2 ${GGC_ROOT_PATH} && \
    unzip /tmp/gg.zip -d /opt/greengrassv2 && \
    /modify-sudoers.sh && \
    # Cleanup
    rm -rf /tmp/* && \
    apt-get purge -y --auto-remove unzip xz-utils && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /var/tmp/* /root/.npm

# nvm の Node.js を PATH に追加
ENV PATH="${NVM_DIR}/versions/node/default/bin:${PATH}"

# FrameCapture コンポーネント
COPY components/ /opt/greengrass-components/

ENTRYPOINT ["/greengrass-entrypoint.sh"]
