const { execSync } = require('child_process');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

const RTSP_URL = process.env.RTSP_URL || 'rtsp://mediamtx:8554/camera';
const S3_BUCKET = process.env.S3_BUCKET;
const CAPTURE_INTERVAL = parseInt(process.env.CAPTURE_INTERVAL || '1', 10);
const LIVE_FRAME_INTERVAL = parseInt(process.env.LIVE_FRAME_INTERVAL || '3', 10);
const S3_KEY = 'live-frames/latest.jpg';
const TMP_FILE = '/tmp/frame.jpg';

if (!S3_BUCKET) {
  console.error('S3_BUCKET environment variable is required');
  process.exit(1);
}

const s3 = new S3Client({ region: process.env.AWS_REGION || 'ap-northeast-1' });

let lastLiveUpload = 0;

async function captureFrame() {
  try {
    execSync(
      `ffmpeg -y -rtsp_transport tcp -i "${RTSP_URL}" -frames:v 1 -q:v 2 ${TMP_FILE}`,
      { timeout: 10000, stdio: 'pipe' },
    );
    return true;
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Capture failed:`, err.message);
    return false;
  }
}

async function uploadLiveFrame() {
  try {
    const body = fs.readFileSync(TMP_FILE);
    await s3.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: S3_KEY,
      Body: body,
      ContentType: 'image/jpeg',
    }));
    console.log(`[${new Date().toISOString()}] Live frame uploaded to s3://${S3_BUCKET}/${S3_KEY}`);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Live frame upload failed:`, err.message);
  }
}

async function main() {
  console.log(
    `Frame capture started: capture=${CAPTURE_INTERVAL}s, live_upload=${LIVE_FRAME_INTERVAL}s, bucket=${S3_BUCKET}`
  );

  while (true) {
    const captured = await captureFrame();

    // live-frames は LIVE_FRAME_INTERVAL ごとにアップロード
    if (captured) {
      const now = Date.now();
      if (now - lastLiveUpload >= LIVE_FRAME_INTERVAL * 1000) {
        await uploadLiveFrame();
        lastLiveUpload = now;
      }
    }

    await new Promise((r) => setTimeout(r, CAPTURE_INTERVAL * 1000));
  }
}

main();
