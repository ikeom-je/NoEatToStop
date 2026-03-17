#!/bin/sh

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

set -e

#Disable job control so that all child processes run in the same process group as the parent
set +m

# Path that initial installation files are copied to
INIT_JAR_PATH=/opt/greengrassv2
#Default options
OPTIONS="-Droot=${GGC_ROOT_PATH} -Dlog.store=FILE -Dlog.level=${LOG_LEVEL} -jar ${INIT_JAR_PATH}/lib/Greengrass.jar --provision ${PROVISION} --deploy-dev-tools ${DEPLOY_DEV_TOOLS} --aws-region ${AWS_REGION} --start false"

parse_options() {

	# If provision is true
	if [ ${PROVISION} = "true" ]; then

		if [ ! -f "/root/.aws/credentials" ] && ([[ -z "${AWS_ACCESS_KEY_ID}" ]] || [[ -z "${AWS_SECRET_ACCESS_KEY}" ]]); then
			echo "Provision is set to true, but credentials not found, neither file exist at /root/.aws/credentials nor set in environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, [AWS_SESSION_TOKEN]) . Please attach credentials and retry."
			exit 1
		fi

		# If thing name is specified, add optional argument
		# If not specified, reverts to default of "GreengrassV2IotThing_" plus a random UUID.
		if [ ${THING_NAME} != default_thing_name ]; then
		    OPTIONS="${OPTIONS} --thing-name ${THING_NAME}"

		    
		fi
		# If thing group name is specified, add optional argument
		if [ ${THING_GROUP_NAME} != default_thing_group_name ]; then
			OPTIONS="${OPTIONS} --thing-group-name ${THING_GROUP_NAME}"

		fi

               # If thing group policy is specified, add optional argument
               if [ ${THING_POLICY_NAME} != default_thing_policy_name ]; then
                       OPTIONS="${OPTIONS} --thing-policy-name ${THING_POLICY_NAME}"
               fi
	fi

  # If TRUSTED_PLUGIN is specified, add optional argument
  # If not specified, it will not use this argument
	if [ ${TRUSTED_PLUGIN} != default_trusted_plugin_path ]; then
	  OPTIONS="${OPTIONS} --trusted-plugin ${TRUSTED_PLUGIN}"
	fi

	# If TES role name is specified, add optional argument
	# If not specified, reverts to default of "GreengrassV2TokenExchangeRole"
	if [ ${TES_ROLE_NAME} != default_tes_role_name ]; then
		OPTIONS="${OPTIONS} --tes-role-name ${TES_ROLE_NAME}"
	fi

	# If TES role name is specified, add optional argument
	# If not specified, reverts to default of "GreengrassV2TokenExchangeRoleAlias"
	if [ ${TES_ROLE_ALIAS_NAME} != default_tes_role_alias_name ]; then
		OPTIONS="${OPTIONS} --tes-role-alias-name ${TES_ROLE_ALIAS_NAME}"
	fi

	# If component default user is specified, add optional argument
	# If not specified, reverts to ggc_user:ggc_group 
	if [ ${COMPONENT_DEFAULT_USER} != default_component_user ]; then
		OPTIONS="${OPTIONS} --component-default-user ${COMPONENT_DEFAULT_USER}"
	fi

	# Use optional init config argument
	# If this option is specified, the config file must be mounted to this location
	if [ ${INIT_CONFIG} != default_init_config ]; then
		if [ -f ${INIT_CONFIG} ]; then
			echo "Using specified init config file at ${INIT_CONFIG}"
			OPTIONS="${OPTIONS} --init-config ${INIT_CONFIG}"
	    else
	    	echo "WARNING: Specified init config file does not exist at ${INIT_CONFIG} !"
	    fi
	fi

	echo "Running Greengrass with the following options: ${OPTIONS}"
}

# If we have not already installed Greengrass
if [ ! -d $GGC_ROOT_PATH/alts/current/distro ]; then
	# Install Greengrass via the main installer, but do not start running
	echo "Installing Greengrass for the first time..."
	parse_options
	java ${OPTIONS}
	if [ $? -ne 0 ]; then
	  exit $?
	elif [ "${STARTUP}" = "false" ]; then
	  exit 0
  fi
else
	echo "Reusing existing Greengrass installation..."
fi

#Make loader script executable
echo "Making loader script executable..."
chmod +x $GGC_ROOT_PATH/alts/current/distro/bin/loader

# --- FrameCapture コンポーネントのローカルデプロイ準備 ---
COMPONENTS_SRC=/opt/greengrass-components
RECIPES_DIR=${GGC_ROOT_PATH}/local-recipes
ARTIFACTS_DIR=${GGC_ROOT_PATH}/local-artifacts

setup_local_components() {
  echo "Setting up local Greengrass components..."

  mkdir -p "${RECIPES_DIR}" "${ARTIFACTS_DIR}"

  # FrameCapture コンポーネント
  FRAME_CAPTURE_SRC="${COMPONENTS_SRC}/com.noeatstop.FrameCapture"
  if [ -d "${FRAME_CAPTURE_SRC}" ]; then
    # レシピをコピー
    cp "${FRAME_CAPTURE_SRC}/recipe.yaml" "${RECIPES_DIR}/com.noeatstop.FrameCapture-1.0.0.yaml"

    # アーティファクトをコピー
    ARTIFACT_DST="${ARTIFACTS_DIR}/com.noeatstop.FrameCapture/1.0.0"
    mkdir -p "${ARTIFACT_DST}"
    cp -r "${FRAME_CAPTURE_SRC}/artifacts/"* "${ARTIFACT_DST}/"

    # npm install (FrameCapture の依存関係)
    if [ -f "${ARTIFACT_DST}/package.json" ]; then
      echo "Installing FrameCapture dependencies..."
      cd "${ARTIFACT_DST}" && npm install --omit=dev 2>&1 | tail -3
      cd /
    fi

    echo "FrameCapture component prepared at ${ARTIFACT_DST}"
  fi
}

# Greengrass 起動後にローカルデプロイを実行するバックグラウンドタスク
deploy_local_components() {
  GG_CLI="${GGC_ROOT_PATH}/bin/greengrass-cli"

  # Greengrass CLI が使えるようになるまで待機
  echo "Waiting for Greengrass to be ready for local deployment..."
  for i in $(seq 1 60); do
    if [ -f "${GG_CLI}" ] && "${GG_CLI}" --version >/dev/null 2>&1; then
      break
    fi
    sleep 5
  done

  if [ ! -f "${GG_CLI}" ]; then
    echo "WARNING: Greengrass CLI not found. Skipping local component deployment."
    return
  fi

  # FrameCapture コンポーネントのデプロイ
  if [ -f "${RECIPES_DIR}/com.noeatstop.FrameCapture-1.0.0.yaml" ]; then
    echo "Deploying FrameCapture component locally..."

    # コンポーネント設定を環境変数から構築
    MERGE_CONFIG="{\"rtspUrl\":\"${RTSP_URL:-rtsp://noeatstop-mediamtx:8554/camera}\",\"s3Bucket\":\"${VIDEO_BUCKET:-}\",\"captureInterval\":\"${CAPTURE_INTERVAL:-3}\",\"awsRegion\":\"${AWS_REGION:-ap-northeast-1}\"}"

    "${GG_CLI}" deployment create \
      --recipeDir "${RECIPES_DIR}" \
      --artifactDir "${ARTIFACTS_DIR}" \
      --merge "com.noeatstop.FrameCapture=1.0.0" \
      --update-config "com.noeatstop.FrameCapture:MERGE:${MERGE_CONFIG}" \
      2>&1 || echo "WARNING: FrameCapture deployment failed. Check Greengrass logs."

    echo "FrameCapture local deployment initiated."
  fi
}

# コンポーネントの準備（npm install 等）
setup_local_components

echo "Starting Greengrass..."

# Greengrass をバックグラウンドで起動し、ローカルデプロイを実行後に待機
$GGC_ROOT_PATH/alts/current/distro/bin/loader &
GG_PID=$!

# バックグラウンドでコンポーネントデプロイ
deploy_local_components &

# Greengrass プロセスを待機
wait $GG_PID
