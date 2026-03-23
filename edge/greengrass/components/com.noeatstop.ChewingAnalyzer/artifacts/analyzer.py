"""
ChewingAnalyzer — 軽量な顔検出・咀嚼判定コンポーネント

FrameCapture が書き出す JPEG フレームを監視し、
OpenCV Haar Cascade で顔検出 → 口領域の差分量で咀嚼判定を行う。
変化検知時のみエビデンス画像を S3 にアップロードし、MQTT で通知する。

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

# 変化検知パラメータ
CHANGE_DETECTION_ENABLED = os.environ.get("CHANGE_DETECTION_ENABLED", "true").lower() == "true"
PIXEL_DIFF_THRESHOLD = float(os.environ.get("PIXEL_DIFF_THRESHOLD", "300"))

# MQTT 設定
THING_NAME = os.environ.get("THING_NAME", "noeatstop-edge-device")
IOT_ENDPOINT = os.environ.get("IOT_ENDPOINT", "")
MQTT_TOPIC = f"noeatstop/{THING_NAME}/chewing-state"
MQTT_FRAME_CHANGE_TOPIC = f"noeatstop/{THING_NAME}/frame-change"

# ポーリング間隔（FrameCapture の CAPTURE_INTERVAL に合わせる）
POLL_INTERVAL = float(os.environ.get("POLL_INTERVAL", "0.5"))

# デバイス制御 IPC ファイルパス
DEVICE_COMMAND_FILE = os.environ.get("DEVICE_COMMAND_FILE", "/tmp/device_command.json")

# 動的設定ファイル（DeviceController が MQTT 受信時に書き出す）
SETTINGS_FILE = os.environ.get("SETTINGS_FILE", "/tmp/analyzer_settings.json")
SETTINGS_CHECK_INTERVAL = 10  # 設定ファイル確認間隔（フレーム数）


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
        self.settings_mtime = 0.0  # 設定ファイルの最終更新時刻

        # 変化検知状態
        self.prev_faces_detected = False
        self.change_detection_enabled = CHANGE_DETECTION_ENABLED
        self.pixel_diff_threshold = PIXEL_DIFF_THRESHOLD

        # 動的パラメータ（設定ファイルで上書き可能）
        self.chewing_threshold = CHEWING_MOTION_THRESHOLD
        self.face_scale = FACE_DETECTION_SCALE
        self.mouth_ratio = MOUTH_ROI_RATIO
        self.analysis_frames = ANALYSIS_FRAME_COUNT
        self.pause_threshold = PAUSE_THRESHOLD

        log.info(
            "ChewingAnalyzer 初期化完了: threshold=%.0f, scale=%.1f, "
            "mouth_ratio=%.2f, frames=%d, pause=%.0fs, "
            "change_detection=%s, pixel_diff_threshold=%.0f",
            self.chewing_threshold,
            self.face_scale,
            self.mouth_ratio,
            self.analysis_frames,
            self.pause_threshold,
            self.change_detection_enabled,
            self.pixel_diff_threshold,
        )

    def run(self):
        """メインループ: フレームファイルを監視して分析"""
        log.info("分析開始: %s を監視中...", FRAME_PATH)

        while True:
            try:
                # 定期的に設定ファイルを確認
                if self.frame_count % SETTINGS_CHECK_INTERVAL == 0:
                    self._reload_settings()

                if self._has_new_frame():
                    self._process_frame()
            except KeyboardInterrupt:
                log.info("終了シグナルを受信")
                break
            except Exception:
                log.exception("フレーム処理中にエラー")

            time.sleep(POLL_INTERVAL)

    def _reload_settings(self):
        """設定ファイルが更新されていれば再読み込み"""
        path = Path(SETTINGS_FILE)
        if not path.exists():
            return

        mtime = path.stat().st_mtime
        if mtime <= self.settings_mtime:
            return

        self.settings_mtime = mtime
        try:
            with open(SETTINGS_FILE, "r") as f:
                settings = json.load(f)

            changed = False
            mapping = {
                "chewingMotionThreshold": ("chewing_threshold", float),
                "faceDetectionScale": ("face_scale", float),
                "mouthRoiRatio": ("mouth_ratio", float),
                "analysisFrameCount": ("analysis_frames", int),
                "pauseThreshold": ("pause_threshold", float),
                "changeDetectionEnabled": ("change_detection_enabled", lambda v: str(v).lower() == "true"),
                "pixelDiffThreshold": ("pixel_diff_threshold", float),
            }
            for key, (attr, conv) in mapping.items():
                if key in settings:
                    new_val = conv(settings[key])
                    if getattr(self, attr) != new_val:
                        old_val = getattr(self, attr)
                        setattr(self, attr, new_val)
                        log.info("設定変更: %s = %s → %s", key, old_val, new_val)
                        changed = True

            if changed:
                log.info(
                    "設定リロード完了: threshold=%.0f, scale=%.1f, "
                    "mouth_ratio=%.2f, frames=%d, pause=%.0fs, "
                    "change_detection=%s, pixel_diff=%.0f",
                    self.chewing_threshold,
                    self.face_scale,
                    self.mouth_ratio,
                    self.analysis_frames,
                    self.pause_threshold,
                    self.change_detection_enabled,
                    self.pixel_diff_threshold,
                )
        except Exception:
            log.exception("設定ファイル読み込みエラー")

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

    def _detect_change(self, faces, motion_score: float) -> tuple:
        """フレーム変化を検知し、変化タイプを返す。

        Returns:
            (changed: bool, change_type: str or None)
        """
        if not self.change_detection_enabled:
            return True, None

        has_faces = len(faces) > 0

        # 顔検出有無の変化
        if has_faces != self.prev_faces_detected:
            change_type = "face_detected" if has_faces else "face_lost"
            return True, change_type

        # 顔検出領域（口元）の差分が閾値超
        if has_faces and motion_score > self.pixel_diff_threshold:
            return True, "pixel_diff"

        return False, None

    def _process_frame(self):
        """1フレームを分析"""
        frame = cv2.imread(FRAME_PATH)
        if frame is None:
            log.warning("フレーム読み込み失敗: %s", FRAME_PATH)
            return

        self.frame_count += 1
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        # 顔検出（動的パラメータ使用）
        faces = self.face_cascade.detectMultiScale(
            gray,
            scaleFactor=self.face_scale,
            minNeighbors=5,
            minSize=(60, 60),
        )

        frame_h, frame_w = frame.shape[:2]

        if len(faces) == 0:
            new_state = self.STATE_ENDED
            motion_score = 0.0
            confidence = 0.0

            # 変化検知
            changed, change_type = self._detect_change(faces, motion_score)
            self.prev_faces_detected = False

            self._update_state(new_state, motion_score, frame, faces, confidence)
            self._upload_analyzed_frame(frame, faces, new_state, motion_score, confidence)

            # 変化時のみフレーム履歴をアップロード
            if changed:
                self._upload_frame_history(frame, faces, new_state, motion_score, len(faces), confidence)
                if change_type:
                    self._publish_frame_change(change_type, motion_score, len(faces), new_state)

            self.prev_mouth_roi = None
            return

        # 最大の顔を使用（最も近い人物）
        face = max(faces, key=lambda f: f[2] * f[3])
        fx, fy, fw, fh = face

        # 口領域 ROI: 顔矩形の下部（動的パラメータ使用）
        mouth_y = int(fy + fh * (1 - self.mouth_ratio))
        mouth_roi = gray[mouth_y : fy + fh, fx : fx + fw]

        # 口領域の差分計算
        motion_score = self._calculate_motion(mouth_roi)
        self.motion_history.append(motion_score)
        if len(self.motion_history) > self.analysis_frames:
            self.motion_history.pop(0)

        # 咀嚼判定（直近 N フレームの平均 motion_score、動的パラメータ使用）
        avg_motion = sum(self.motion_history) / len(self.motion_history)
        if avg_motion > self.chewing_threshold:
            new_state = self.STATE_CHEWING
        else:
            new_state = self.STATE_STOPPED

        # 精度（confidence）計算
        confidence = self._calculate_confidence(
            new_state, avg_motion, fw, fh, frame_w, frame_h
        )

        # 変化検知（口元差分ベース）
        changed, change_type = self._detect_change(faces, motion_score)
        self.prev_faces_detected = True

        # 咀嚼状態変化も変化イベントとして扱う
        if new_state != self.current_state:
            changed = True
            change_type = "chewing_state_change"

        self._update_state(new_state, avg_motion, frame, faces, confidence)
        self._upload_analyzed_frame(frame, faces, new_state, avg_motion, confidence)

        # 変化時のみフレーム履歴をアップロード
        if changed:
            self._upload_frame_history(frame, faces, new_state, avg_motion, len(faces), confidence)
            if change_type:
                self._publish_frame_change(change_type, motion_score, len(faces), new_state)

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
        frame_ratio = len(self.motion_history) / self.analysis_frames
        frame_confidence = min(frame_ratio * 0.2, 0.2)  # 最大 0.2

        # 判定の確信度（閾値からの距離）
        if self.chewing_threshold > 0:
            motion_ratio = avg_motion / self.chewing_threshold
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

    def _annotate_frame(
        self,
        frame: np.ndarray,
        faces: np.ndarray,
        state: str,
        motion_score: float,
        confidence: float,
    ) -> np.ndarray:
        """フレームにBB・状態・スコアをオーバーレイ描画"""
        annotated = frame.copy()

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
            mouth_y = int(fy + fh * (1 - self.mouth_ratio))
            cv2.rectangle(annotated, (fx, mouth_y), (fx + fw, fy + fh), (255, 0, 0), 1)

        # 状態・スコア・confidenceのテキスト表示
        label = f"{state} motion:{int(motion_score)} conf:{confidence:.2f}"
        cv2.putText(annotated, label, (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)

        return annotated

    def _upload_frame_history(
        self,
        frame: np.ndarray,
        faces: np.ndarray,
        state: str,
        motion_score: float,
        faces_count: int,
        confidence: float,
    ):
        """変化検知時のみ: BB付きフレームを S3 frames/ にアップロード"""
        if not self.s3 or not S3_BUCKET:
            return

        try:
            now = datetime.now(timezone.utc)
            date_str = now.strftime("%Y-%m-%d")
            epoch_ms = int(now.timestamp() * 1000)
            s3_key = f"frames/{THING_NAME}/{date_str}/{epoch_ms}.jpg"

            annotated = self._annotate_frame(frame, faces, state, motion_score, confidence)
            _, buf = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 70])

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
                self.pause_threshold,
            )
            # pauseThreshold 到達時もエビデンスアップロード
            if (
                stopped_duration >= PAUSE_THRESHOLD
                and stopped_duration - (now - self.last_mtime) < self.pause_threshold
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
        if new_state == self.STATE_STOPPED and stopped_duration >= self.pause_threshold:
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

    def _publish_frame_change(
        self,
        change_type: str,
        motion_score: float,
        faces_count: int,
        chewing_state: str,
    ):
        """フレーム変化イベントを MQTT で送信"""
        if not self.iot_data:
            return

        now = datetime.now(timezone.utc)
        date_str = now.strftime("%Y-%m-%d")
        epoch_ms = int(now.timestamp() * 1000)
        s3_key = f"frames/{THING_NAME}/{date_str}/{epoch_ms}.jpg"

        payload = {
            "deviceId": THING_NAME,
            "timestamp": now.isoformat(),
            "changeType": change_type,
            "details": {
                "diffScore": int(motion_score),
                "facesDetected": faces_count,
                "chewingState": chewing_state,
            },
            "s3Key": s3_key,
        }

        try:
            self.iot_data.publish(
                topic=MQTT_FRAME_CHANGE_TOPIC,
                qos=0,
                payload=json.dumps(payload),
            )
            log.info("フレーム変化通知: type=%s, motion=%d", change_type, int(motion_score))
        except Exception:
            log.exception("フレーム変化 MQTT 送信失敗")

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
            annotated = self._annotate_frame(frame, faces, state, motion_score, confidence)
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
                mouth_y = int(fy + fh * (1 - self.mouth_ratio))
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
