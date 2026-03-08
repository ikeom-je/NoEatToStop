#!/bin/bash
# Mac カメラ → MediaMTX (RTSP) 配信スクリプト
# ホスト側で実行: ./edge/start-camera.sh

set -e

RTSP_URL="rtsp://localhost:8554/camera"
CAMERA_INDEX="${CAMERA_INDEX:-0}"

echo "Mac カメラ (index=${CAMERA_INDEX}) → MediaMTX RTSP 配信を開始します..."
echo "RTSP URL: ${RTSP_URL}"
echo "停止するには Ctrl+C を押してください"

ffmpeg \
  -f avfoundation \
  -framerate 30 \
  -video_size 640x480 \
  -i "${CAMERA_INDEX}" \
  -c:v libx264 \
  -preset ultrafast \
  -tune zerolatency \
  -f rtsp \
  -rtsp_transport tcp \
  "${RTSP_URL}"
