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

# --- コンポーネントの準備 ---
COMPONENTS_SRC=/opt/greengrass-components
FRAME_CAPTURE_WORK=/opt/frame-capture
CHEWING_ANALYZER_WORK=/opt/chewing-analyzer

setup_frame_capture() {
  echo "Setting up FrameCapture..."

  FRAME_CAPTURE_SRC="${COMPONENTS_SRC}/com.noeatstop.FrameCapture/artifacts"
  if [ ! -d "${FRAME_CAPTURE_SRC}" ]; then
    echo "WARNING: FrameCapture artifacts not found at ${FRAME_CAPTURE_SRC}"
    return 1
  fi

  mkdir -p "${FRAME_CAPTURE_WORK}"
  cp -r "${FRAME_CAPTURE_SRC}/"* "${FRAME_CAPTURE_WORK}/"

  # npm install（初回のみ、node_modules が無い場合）
  if [ -f "${FRAME_CAPTURE_WORK}/package.json" ] && [ ! -d "${FRAME_CAPTURE_WORK}/node_modules" ]; then
    echo "Installing FrameCapture dependencies..."
    cd "${FRAME_CAPTURE_WORK}" && npm install --omit=dev 2>&1 | tail -5
    cd /
  fi

  echo "FrameCapture ready at ${FRAME_CAPTURE_WORK}"
}

# FrameCapture プロセスをバックグラウンドで起動
run_frame_capture() {
  if [ ! -f "${FRAME_CAPTURE_WORK}/capture.js" ]; then
    echo "WARNING: capture.js not found. FrameCapture will not start."
    return
  fi

  if [ -z "${VIDEO_BUCKET}" ]; then
    echo "WARNING: VIDEO_BUCKET not set. FrameCapture will not start."
    return
  fi

  echo "Starting FrameCapture process..."
  export RTSP_URL="${RTSP_URL:-rtsp://noeatstop-mediamtx:8554/camera}"
  export S3_BUCKET="${VIDEO_BUCKET}"
  export CAPTURE_INTERVAL="${CAPTURE_INTERVAL:-3}"
  export AWS_REGION="${AWS_REGION:-ap-northeast-1}"

  cd "${FRAME_CAPTURE_WORK}" && node capture.js &
  FRAME_CAPTURE_PID=$!
  echo "FrameCapture started (PID: ${FRAME_CAPTURE_PID})"
}

# --- ChewingAnalyzer コンポーネントの準備 ---
setup_chewing_analyzer() {
  echo "Setting up ChewingAnalyzer..."

  ANALYZER_SRC="${COMPONENTS_SRC}/com.noeatstop.ChewingAnalyzer/artifacts"
  if [ ! -d "${ANALYZER_SRC}" ]; then
    echo "WARNING: ChewingAnalyzer artifacts not found at ${ANALYZER_SRC}"
    return 1
  fi

  mkdir -p "${CHEWING_ANALYZER_WORK}"
  cp -r "${ANALYZER_SRC}/"* "${CHEWING_ANALYZER_WORK}/"

  # 依存パッケージ確認（Docker ビルド時にインストール済み）
  if python3 -c "import boto3, cv2" 2>/dev/null; then
    echo "ChewingAnalyzer dependencies OK"
  else
    echo "WARNING: ChewingAnalyzer dependencies missing (boto3 or cv2)"
  fi

  echo "ChewingAnalyzer ready at ${CHEWING_ANALYZER_WORK}"
}

# ChewingAnalyzer プロセスをバックグラウンドで起動
run_chewing_analyzer() {
  if [ ! -f "${CHEWING_ANALYZER_WORK}/analyzer.py" ]; then
    echo "WARNING: analyzer.py not found. ChewingAnalyzer will not start."
    return
  fi

  echo "Starting ChewingAnalyzer process..."
  export FRAME_PATH="/tmp/frame.jpg"
  export S3_BUCKET="${VIDEO_BUCKET}"
  export AWS_REGION="${AWS_REGION:-ap-northeast-1}"

  cd "${CHEWING_ANALYZER_WORK}" && python3 analyzer.py &
  CHEWING_ANALYZER_PID=$!
  echo "ChewingAnalyzer started (PID: ${CHEWING_ANALYZER_PID})"
}

# コンポーネントの準備
setup_frame_capture
setup_chewing_analyzer

echo "Starting Greengrass..."

# Greengrass Nucleus をバックグラウンドで起動
$GGC_ROOT_PATH/alts/current/distro/bin/loader &
GG_PID=$!

# Greengrass 起動を少し待ってから FrameCapture を開始
sleep 10
run_frame_capture

# FrameCapture が最初のフレームを書き出すまで待機
echo "Waiting for first frame..."
sleep 5
run_chewing_analyzer

# Greengrass プロセスを待機（メインプロセス）
wait $GG_PID
