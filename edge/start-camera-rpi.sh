#!/bin/bash
# Raspberry Pi カメラ → MediaMTX (RTSP) 配信スクリプト
# ホスト側（ラズパイ）で実行: ./edge/start-camera-rpi.sh

set -e

RTSP_URL="rtsp://localhost:8554/camera"
CAMERA_DEVICE="${CAMERA_DEVICE:-/dev/video0}"
VIDEO_SIZE="${VIDEO_SIZE:-640x480}"
FRAMERATE="${FRAMERATE:-30}"

echo "Raspberry Pi カメラ (${CAMERA_DEVICE}) → MediaMTX RTSP 配信を開始します..."
echo "RTSP URL: ${RTSP_URL}"
echo "解像度: ${VIDEO_SIZE}, フレームレート: ${FRAMERATE}fps"
echo "停止するには Ctrl+C を押してください"

ffmpeg \
  -f v4l2 \
  -input_format mjpeg \
  -framerate "${FRAMERATE}" \
  -video_size "${VIDEO_SIZE}" \
  -i "${CAMERA_DEVICE}" \
  -c:v libx264 \
  -preset ultrafast \
  -tune zerolatency \
  -f rtsp \
  -rtsp_transport tcp \
  "${RTSP_URL}"
