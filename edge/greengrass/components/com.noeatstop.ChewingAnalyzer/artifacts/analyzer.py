"""
ChewingAnalyzer — 軽量な顔検出・咀嚼判定コンポーネント

FrameCapture が書き出す JPEG フレームを監視し、
OpenCV Haar Cascade で顔検出 → 口領域の差分量で咀嚼判定を行う。
状態変化時にエビデンス画像を S3 にアップロードする。

MQTT 通知・TV 制御コマンド連携を含む。
"""

import os
import sys
import time
import json
import uuid
import logging
from datetime import datetime, timezone
from pathlib import Path

import cv2
import numpy as np
import boto3
from botocore.exceptions import ClientError

# --- ログ設定 ---
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S%z",
)
log = logging.getLogger("ChewingAnalyzer")

# --- 環境変数から設定読み込み ---
FRAME_PATH = os.environ.get("FRAME_PATH", "/tmp/frame.jpg")
S3_BUCKET = os.environ.get("S3_BUCKET", "")
AWS_REGION = os.environ.get("AWS_REGION", "ap-northeast-1")

# 咀嚼判定パラメータ
CHEWING_MOTION_THRESHOLD = float(os.environ.get("CHEWING_MOTION_THRESHOLD", "500"))
FACE_DETECTION_SCALE = float(os.environ.get("FACE_DETECTION_SCALE", "1.3"))
MOUTH_ROI_RATIO = float(os.environ.get("MOUTH_ROI_RATIO", "0.3"))
ANALYSIS_FRAME_COUNT = int(os.environ.get("ANALYSIS_FRAME_COUNT", "5"))
PAUSE_THRESHOLD = float(os.environ.get("PAUSE_THRESHOLD", "10"))
EVIDENCE_ON_STATE_CHANGE = os.environ.get("EVIDENCE_ON_STATE_CHANGE", "true").lower() == "true"

# MQTT 設定
THING_NAME = os.environ.get("THING_NAME", "noeatstop-edge-device")
IOT_ENDPOINT = os.environ.get("IOT_ENDPOINT", "")
MQTT_TOPIC = f"noeatstop/{THING_NAME}/chewing-state"

# ポーリング間隔（FrameCapture の CAPTURE_INTERVAL に合わせる）
POLL_INTERVAL = float(os.environ.get("POLL_INTERVAL", "0.5"))

# デバイス制御 IPC ファイルパス
DEVICE_COMMAND_FILE = os.environ.get("DEVICE_COMMAND_FILE", "/tmp/device_command.json")


class ChewingAnalyzer:
    """顔検出 + 口領域差分による咀嚼判定エンジン"""

    # 状態定数
    STATE_CHEWING = "chewing"
    STATE_STOPPED = "chewing_stopped"
    STATE_ENDED = "meal_ended"
    STATE_WAITING = "waiting"  # 食事開始前

    def __init__(self):
        # Haar Cascade 読み込み（コンポーネント同梱の XML を使用）
        script_dir = os.path.dirname(os.path.abspath(__file__))
        cascade_path = os.path.join(script_dir, "haarcascade_frontalface_default.xml")
        self.face_cascade = cv2.CascadeClassifier(cascade_path)
        if self.face_cascade.empty():
            log.error("Haar Cascade の読み込みに失敗: %s", cascade_path)
            sys.exit(1)

        # S3 クライアント（エビデンスアップロード用）
        self.s3 = boto3.client("s3", region_name=AWS_REGION) if S3_BUCKET else None

        # IoT Data Plane クライアント（MQTT 送信用）
        if IOT_ENDPOINT:
            self.iot_data = boto3.client(
                "iot-data",
                region_name=AWS_REGION,
                endpoint_url=f"https://{IOT_ENDPOINT}",
            )
            log.info("MQTT 送信有効: topic=%s, endpoint=%s", MQTT_TOPIC, IOT_ENDPOINT)
        else:
            self.iot_data = None
            log.warning("IOT_ENDPOINT 未設定 — MQTT 送信は無効")

        # 分析状態
        self.prev_mouth_roi = None
        self.motion_history = []  # 直近 N フレームの motion_score
        self.current_state = self.STATE_WAITING
        self.chewing_stopped_since = None
        self.frame_count = 0
        self.last_mtime = 0.0
        self.tv_off_sent = False  # TV OFF コマンド送信済みフラグ

        log.info(
            "ChewingAnalyzer 初期化完了: threshold=%.0f, scale=%.1f, "
            "mouth_ratio=%.2f, frames=%d, pause=%.0fs",
            CHEWING_MOTION_THRESHOLD,
            FACE_DETECTION_SCALE,
            MOUTH_ROI_RATIO,
            ANALYSIS_FRAME_COUNT,
            PAUSE_THRESHOLD,
        )

    def run(self):
        """メインループ: フレームファイルを監視して分析"""
        log.info("分析開始: %s を監視中...", FRAME_PATH)

        while True:
            try:
                if self._has_new_frame():
                    self._process_frame()
            except KeyboardInterrupt:
                log.info("終了シグナルを受信")
                break
            except Exception:
                log.exception("フレーム処理中にエラー")

            time.sleep(POLL_INTERVAL)

    def _has_new_frame(self) -> bool:
        """フレームファイルが更新されたか確認"""
        path = Path(FRAME_PATH)
        if not path.exists():
            return False
        mtime = path.stat().st_mtime
        if mtime > self.last_mtime:
            self.last_mtime = mtime
            return True
        return False

    def _process_frame(self):
        """1フレームを分析"""
        frame = cv2.imread(FRAME_PATH)
        if frame is None:
            log.warning("フレーム読み込み失敗: %s", FRAME_PATH)
            return

        self.frame_count += 1
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        # 顔検出
        faces = self.face_cascade.detectMultiScale(
            gray,
            scaleFactor=FACE_DETECTION_SCALE,
            minNeighbors=5,
            minSize=(60, 60),
        )

        frame_h, frame_w = frame.shape[:2]

        if len(faces) == 0:
            new_state = self.STATE_ENDED
            motion_score = 0.0
            confidence = 0.0
            self._update_state(new_state, motion_score, frame, faces, confidence)
            self._upload_analyzed_frame(frame, faces, new_state, motion_score, confidence)
            self._upload_frame_history(frame, new_state, motion_score, len(faces), confidence)
            self.prev_mouth_roi = None
            return

        # 最大の顔を使用（最も近い人物）
        face = max(faces, key=lambda f: f[2] * f[3])
        fx, fy, fw, fh = face

        # 口領域 ROI: 顔矩形の下部
        mouth_y = int(fy + fh * (1 - MOUTH_ROI_RATIO))
        mouth_roi = gray[mouth_y : fy + fh, fx : fx + fw]

        # 口領域の差分計算
        motion_score = self._calculate_motion(mouth_roi)
        self.motion_history.append(motion_score)
        if len(self.motion_history) > ANALYSIS_FRAME_COUNT:
            self.motion_history.pop(0)

        # 咀嚼判定（直近 N フレームの平均 motion_score）
        avg_motion = sum(self.motion_history) / len(self.motion_history)
        if avg_motion > CHEWING_MOTION_THRESHOLD:
            new_state = self.STATE_CHEWING
        else:
            new_state = self.STATE_STOPPED

        # 精度（confidence）計算
        confidence = self._calculate_confidence(
            new_state, avg_motion, fw, fh, frame_w, frame_h
        )

        self._update_state(new_state, avg_motion, frame, faces, confidence)
        self._upload_analyzed_frame(frame, faces, new_state, avg_motion, confidence)
        self._upload_frame_history(frame, new_state, avg_motion, len(faces), confidence)
        self.prev_mouth_roi = mouth_roi.copy()

    def _calculate_motion(self, mouth_roi: np.ndarray) -> float:
        """前フレームとの口領域の差分量を計算"""
        if self.prev_mouth_roi is None:
            return 0.0

        # サイズを揃える（顔検出の位置ずれ対策）
        h1, w1 = self.prev_mouth_roi.shape[:2]
        h2, w2 = mouth_roi.shape[:2]
        if h1 == 0 or w1 == 0 or h2 == 0 or w2 == 0:
            return 0.0

        target_h = min(h1, h2)
        target_w = min(w1, w2)
        prev_resized = cv2.resize(self.prev_mouth_roi, (target_w, target_h))
        curr_resized = cv2.resize(mouth_roi, (target_w, target_h))

        # 絶対差分の合計（ピクセル変化量）
        diff = cv2.absdiff(prev_resized, curr_resized)
        return float(np.sum(diff))

    def _calculate_confidence(
        self,
        state: str,
        avg_motion: float,
        face_w: int,
        face_h: int,
        frame_w: int,
        frame_h: int,
    ) -> float:
        """エッジ分析の精度レベル（0.0〜1.0）を計算"""
        # 顔サイズの信頼度（顔が大きいほど高精度）
        face_area_ratio = (face_w * face_h) / max(frame_w * frame_h, 1)
        face_confidence = min(face_area_ratio * 10, 0.4)  # 最大 0.4

        # フレーム数の信頼度（分析フレームが多いほど安定）
        frame_ratio = len(self.motion_history) / ANALYSIS_FRAME_COUNT
        frame_confidence = min(frame_ratio * 0.2, 0.2)  # 最大 0.2

        # 判定の確信度（閾値からの距離）
        if CHEWING_MOTION_THRESHOLD > 0:
            motion_ratio = avg_motion / CHEWING_MOTION_THRESHOLD
            if state == self.STATE_CHEWING:
                # 閾値を超えている量が多いほど確信度高
                decision_confidence = min((motion_ratio - 1) * 0.5, 0.4)
            else:
                # 閾値を下回っている量が多いほど確信度高
                decision_confidence = min((1 - motion_ratio) * 0.5, 0.4)
            decision_confidence = max(decision_confidence, 0.0)
        else:
            decision_confidence = 0.0

        return round(min(face_confidence + frame_confidence + decision_confidence, 1.0), 3)

    def _upload_frame_history(
        self,
        frame: np.ndarray,
        state: str,
        motion_score: float,
        faces_count: int,
        confidence: float,
    ):
        """タイムスタンプ付きフレームを S3 frames/ にアップロード（フレーム履歴用）"""
        if not self.s3 or not S3_BUCKET:
            return

        try:
            now = datetime.now(timezone.utc)
            date_str = now.strftime("%Y-%m-%d")
            epoch_ms = int(now.timestamp() * 1000)
            s3_key = f"frames/{THING_NAME}/{date_str}/{epoch_ms}.jpg"

            _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 70])

            self.s3.put_object(
                Bucket=S3_BUCKET,
                Key=s3_key,
                Body=buf.tobytes(),
                ContentType="image/jpeg",
                Metadata={
                    "device_id": THING_NAME,
                    "state": state,
                    "confidence": str(confidence),
                    "motion_score": str(int(motion_score)),
                    "faces_detected": str(faces_count),
                    "frame_count": str(self.frame_count),
                    "epoch_ms": str(epoch_ms),
                },
            )
        except Exception:
            log.exception("フレーム履歴アップロード失敗")

    def _update_state(
        self,
        new_state: str,
        motion_score: float,
        frame: np.ndarray,
        faces: np.ndarray,
        confidence: float = 0.0,
    ):
        """状態遷移の管理とエビデンスアップロード"""
        now = time.time()
        prev_state = self.current_state

        # 咀嚼停止時間の追跡
        if new_state == self.STATE_STOPPED:
            if self.chewing_stopped_since is None:
                self.chewing_stopped_since = now
            stopped_duration = now - self.chewing_stopped_since
        else:
            self.chewing_stopped_since = None
            stopped_duration = 0.0

        # 状態変化ログ
        if new_state != prev_state:
            log.info(
                "状態変化: %s → %s (motion=%.0f, faces=%d)",
                prev_state,
                new_state,
                motion_score,
                len(faces),
            )
            # MQTT 送信
            self._publish_state(new_state, prev_state, motion_score, len(faces), stopped_duration, confidence)
            # エビデンスアップロード
            if EVIDENCE_ON_STATE_CHANGE and self.s3:
                self._upload_evidence(frame, faces, new_state, motion_score)
        elif new_state == self.STATE_STOPPED and stopped_duration > 0:
            log.debug(
                "咀嚼停止中: %.1f秒 / %.0f秒",
                stopped_duration,
                PAUSE_THRESHOLD,
            )
            # pauseThreshold 到達時もエビデンスアップロード
            if (
                stopped_duration >= PAUSE_THRESHOLD
                and stopped_duration - (now - self.last_mtime) < PAUSE_THRESHOLD
                and EVIDENCE_ON_STATE_CHANGE
                and self.s3
            ):
                log.info(
                    "咀嚼停止 %.0f秒到達 — TV OFF 判定 (motion=%.0f)",
                    stopped_duration,
                    motion_score,
                )
                self._upload_evidence(
                    frame, faces, "tv_off_trigger", motion_score
                )

        # TV 制御コマンドの書き出し
        if new_state == self.STATE_STOPPED and stopped_duration >= PAUSE_THRESHOLD:
            if not self.tv_off_sent:
                self._send_device_command("turn_off", f"chewing_stopped_{int(stopped_duration)}s")
                self.tv_off_sent = True
        elif new_state == self.STATE_CHEWING and self.tv_off_sent:
            self._send_device_command("turn_on", "chewing_resumed")
            self.tv_off_sent = False
        elif new_state == self.STATE_ENDED and self.tv_off_sent:
            # 食事終了時は TV ON に戻す
            self._send_device_command("turn_on", "meal_ended")
            self.tv_off_sent = False

        self.current_state = new_state

        # 定期ログ（10フレームごと）
        if self.frame_count % 10 == 0:
            log.info(
                "状態=%s, motion=%.0f, faces=%d, frame=%d",
                self.current_state,
                motion_score,
                len(faces),
                self.frame_count,
            )

    def _send_device_command(self, action: str, reason: str):
        """DeviceController へ制御コマンドを書き出し（ファイル IPC）"""
        cmd = {
            "action": action,
            "reason": reason,
            "requestId": str(uuid.uuid4()),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        try:
            with open(DEVICE_COMMAND_FILE, "w") as f:
                json.dump(cmd, f)
            log.info("デバイスコマンド送信: action=%s, reason=%s", action, reason)
        except IOError:
            log.exception("デバイスコマンド書き込み失敗")

    def _publish_state(
        self,
        state: str,
        prev_state: str,
        motion_score: float,
        faces_count: int,
        stopped_duration: float,
        confidence: float = 0.0,
    ):
        """状態変化を MQTT で送信"""
        if not self.iot_data:
            return

        now = datetime.now(timezone.utc)
        payload = {
            "deviceId": THING_NAME,
            "state": state,
            "prevState": prev_state,
            "motionScore": int(motion_score),
            "facesDetected": faces_count,
            "stoppedDuration": round(stopped_duration, 1),
            "confidence": confidence,
            "frameCount": self.frame_count,
            "timestamp": now.isoformat(),
            "epochSeconds": int(now.timestamp()),
        }

        try:
            self.iot_data.publish(
                topic=MQTT_TOPIC,
                qos=1,
                payload=json.dumps(payload),
            )
            log.info("MQTT 送信: %s → %s (motion=%d)", prev_state, state, int(motion_score))
        except Exception:
            log.exception("MQTT 送信失敗")

    def _upload_analyzed_frame(
        self,
        frame: np.ndarray,
        faces: np.ndarray,
        state: str,
        motion_score: float,
        confidence: float = 0.0,
    ):
        """バウンディングボックス付きフレームを S3 にアップロード（管理画面表示用）"""
        if not self.s3 or not S3_BUCKET:
            return

        try:
            annotated = frame.copy()

            # 状態に応じた色: chewing=緑, stopped=黄, ended=赤
            color_map = {
                self.STATE_CHEWING: (0, 255, 0),
                self.STATE_STOPPED: (0, 255, 255),
                self.STATE_ENDED: (0, 0, 255),
                self.STATE_WAITING: (128, 128, 128),
            }
            color = color_map.get(state, (255, 255, 255))

            for fx, fy, fw, fh in faces:
                # 顔バウンディングボックス
                cv2.rectangle(annotated, (fx, fy), (fx + fw, fy + fh), color, 2)
                # 口領域
                mouth_y = int(fy + fh * (1 - MOUTH_ROI_RATIO))
                cv2.rectangle(annotated, (fx, mouth_y), (fx + fw, fy + fh), (255, 0, 0), 1)

            # 状態とスコアとconfidenceのテキスト表示
            label = f"{state} motion:{int(motion_score)} conf:{confidence:.2f}"
            cv2.putText(annotated, label, (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)

            # JPEG エンコード
            _, buf = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 80])

            self.s3.put_object(
                Bucket=S3_BUCKET,
                Key="live-frames/latest-analyzed.jpg",
                Body=buf.tobytes(),
                ContentType="image/jpeg",
            )
        except Exception:
            log.exception("分析フレームアップロード失敗")

    def _upload_evidence(
        self,
        frame: np.ndarray,
        faces: np.ndarray,
        event_type: str,
        motion_score: float,
    ):
        """エビデンス画像を S3 にアップロード"""
        if not self.s3 or not S3_BUCKET:
            return

        try:
            # 顔矩形を描画したエビデンス画像を作成
            evidence = frame.copy()
            for fx, fy, fw, fh in faces:
                cv2.rectangle(evidence, (fx, fy), (fx + fw, fy + fh), (0, 255, 0), 2)
                # 口領域を描画
                mouth_y = int(fy + fh * (1 - MOUTH_ROI_RATIO))
                cv2.rectangle(
                    evidence,
                    (fx, mouth_y),
                    (fx + fw, fy + fh),
                    (0, 0, 255),
                    2,
                )

            # JPEG エンコード
            _, buf = cv2.imencode(".jpg", evidence, [cv2.IMWRITE_JPEG_QUALITY, 85])

            # S3 キー: evidence/{date}/{event_type}_{timestamp}.jpg
            now = datetime.now(timezone.utc)
            date_str = now.strftime("%Y-%m-%d")
            ts_str = now.strftime("%H%M%S")
            s3_key = f"evidence/{date_str}/{event_type}_{ts_str}.jpg"

            self.s3.put_object(
                Bucket=S3_BUCKET,
                Key=s3_key,
                Body=buf.tobytes(),
                ContentType="image/jpeg",
                Metadata={
                    "event_type": event_type,
                    "motion_score": str(int(motion_score)),
                    "state": self.current_state,
                    "frame_count": str(self.frame_count),
                },
            )
            log.info("エビデンスアップロード: s3://%s/%s", S3_BUCKET, s3_key)

        except ClientError:
            log.exception("S3 アップロード失敗")
        except Exception:
            log.exception("エビデンス作成中にエラー")


def main():
    if not S3_BUCKET:
        log.warning("S3_BUCKET 未設定 — エビデンスアップロードは無効")

    analyzer = ChewingAnalyzer()
    analyzer.run()


if __name__ == "__main__":
    main()
