# Greengrass V2 Docker image for Raspberry Pi (aarch64 ARM v8.0)
# Based on the official aws-greengrass-docker but using Debian for RPi compatibility
# Original: https://github.com/aws-greengrass/aws-greengrass-docker

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

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      openjdk-11-jre-headless \
      python3 \
      curl \
      unzip \
      wget \
      sudo \
      procps \
      tini \
    && rm -rf /var/lib/apt/lists/* \
    && wget -q ${GREENGRASS_RELEASE_URI} \
    && chmod +x /greengrass-entrypoint.sh /modify-sudoers.sh \
    && mkdir -p /opt/greengrassv2 ${GGC_ROOT_PATH} \
    && unzip ${GREENGRASS_ZIP_FILE} -d /opt/greengrassv2 \
    && rm ${GREENGRASS_ZIP_FILE} \
    && ./modify-sudoers.sh

ENTRYPOINT ["/greengrass-entrypoint.sh"]
