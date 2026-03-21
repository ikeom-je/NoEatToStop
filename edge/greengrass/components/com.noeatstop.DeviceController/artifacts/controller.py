"""
DeviceController — デバイス制御コンポーネント

ChewingAnalyzer からの制御コマンド（ファイル IPC）を受信し、
TV 制御（Mock）を実行する。制御イベントは MQTT で AWS に通知。
管理画面からの TV ON コマンドは S3 コマンドファイル経由で受信。
"""

import os
import sys
import time
import json
import uuid
import logging
from datetime import datetime, timezone
from pathlib import Path

import boto3
from botocore.exceptions import ClientError

# --- ログ設定 ---
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S%z",
)
log = logging.getLogger("DeviceController")

# --- 環境変数 ---
THING_NAME = os.environ.get("THING_NAME", "noeatstop-edge-device")
IOT_ENDPOINT = os.environ.get("IOT_ENDPOINT", "")
S3_BUCKET = os.environ.get("S3_BUCKET", "")
AWS_REGION = os.environ.get("AWS_REGION", "ap-northeast-1")
TV_CONTROL_METHOD = os.environ.get("TV_CONTROL_METHOD", "mock")
TV_CONTROL_RETRY_COUNT = int(os.environ.get("TV_CONTROL_RETRY_COUNT", "1"))
TV_CONTROL_RETRY_INTERVAL = float(os.environ.get("TV_CONTROL_RETRY_INTERVAL", "3"))

# IPC ファイルパス
COMMAND_FILE = os.environ.get("DEVICE_COMMAND_FILE", "/tmp/device_command.json")
STATUS_FILE = os.environ.get("DEVICE_STATUS_FILE", "/tmp/device_status.json")

# S3 コマンドキー（管理画面からの制御コマンド）
S3_COMMAND_KEY = f"commands/{THING_NAME}/tv.json"

# MQTT トピック
MQTT_TOPIC = f"noeatstop/{THING_NAME}/tv-control"

# ポーリング間隔
POLL_INTERVAL = float(os.environ.get("CONTROLLER_POLL_INTERVAL", "1"))
S3_POLL_INTERVAL = float(os.environ.get("S3_POLL_INTERVAL", "5"))


class TVController:
    """TV 制御の実行（Mock / Smart TV API）"""

    def __init__(self, method: str = "mock"):
        self.method = method
        self.tv_power = "unknown"
        log.info("TVController 初期化: method=%s", method)

    def control(self, action: str) -> dict:
        """TV 制御を実行。リトライ付き。"""
        last_error = None
        for attempt in range(1 + TV_CONTROL_RETRY_COUNT):
            try:
                result = self._execute(action)
                self.tv_power = "on" if action == "turn_on" else "off"
                return {
                    "success": True,
                    "method": self.method,
                    "action": action,
                    "attempt": attempt + 1,
                }
            except Exception as e:
                last_error = str(e)
                log.warning(
                    "TV 制御失敗 (attempt %d/%d): %s",
                    attempt + 1,
                    1 + TV_CONTROL_RETRY_COUNT,
                    e,
                )
                if attempt < TV_CONTROL_RETRY_COUNT:
                    time.sleep(TV_CONTROL_RETRY_INTERVAL)

        return {
            "success": False,
            "method": self.method,
            "action": action,
            "error": last_error,
            "attempt": 1 + TV_CONTROL_RETRY_COUNT,
        }

    def _execute(self, action: str) -> bool:
        """制御の実行（メソッドに応じて分岐）"""
        if self.method == "mock":
            return self._mock_control(action)
        elif self.method == "smart_tv_api":
            return self._smart_tv_api_control(action)
        else:
            raise ValueError(f"未知の制御方式: {self.method}")

    def _mock_control(self, action: str) -> bool:
        """Mock: ログ出力のみ"""
        log.info("[MOCK] TV %s 実行", action)
        return True

    def _smart_tv_api_control(self, action: str) -> bool:
        """Smart TV API 制御（将来実装）"""
        raise NotImplementedError("Smart TV API は未実装です")


class DeviceController:
    """デバイス制御の統合管理"""

    def __init__(self):
        self.tv = TVController(method=TV_CONTROL_METHOD)

        # S3 クライアント（コマンド受信用）
        self.s3 = boto3.client("s3", region_name=AWS_REGION) if S3_BUCKET else None

        # IoT Data Plane クライアント（MQTT 送信用）
        if IOT_ENDPOINT:
            self.iot_data = boto3.client(
                "iot-data",
                region_name=AWS_REGION,
                endpoint_url=f"https://{IOT_ENDPOINT}",
            )
            log.info("MQTT 送信有効: topic=%s", MQTT_TOPIC)
        else:
            self.iot_data = None
            log.warning("IOT_ENDPOINT 未設定 — MQTT 送信は無効")

        # 状態管理
        self.last_command_mtime = 0.0
        self.last_s3_poll = 0.0
        self.processed_commands = set()

        # 初期ステータスを書き出し
        self._write_status()

        log.info(
            "DeviceController 初期化完了: method=%s, retry=%d, interval=%.0fs",
            TV_CONTROL_METHOD,
            TV_CONTROL_RETRY_COUNT,
            TV_CONTROL_RETRY_INTERVAL,
        )

    def run(self):
        """メインループ"""
        log.info("DeviceController 開始")

        while True:
            try:
                # 1. ローカル IPC コマンド確認（ChewingAnalyzer から）
                self._check_local_command()

                # 2. S3 コマンド確認（管理画面から）
                now = time.time()
                if now - self.last_s3_poll >= S3_POLL_INTERVAL:
                    self._check_s3_command()
                    self.last_s3_poll = now

            except KeyboardInterrupt:
                log.info("終了シグナルを受信")
                break
            except Exception:
                log.exception("コントローラー処理中にエラー")

            time.sleep(POLL_INTERVAL)

    def _check_local_command(self):
        """ローカルコマンドファイルを確認"""
        path = Path(COMMAND_FILE)
        if not path.exists():
            return

        mtime = path.stat().st_mtime
        if mtime <= self.last_command_mtime:
            return

        self.last_command_mtime = mtime

        try:
            with open(COMMAND_FILE, "r") as f:
                cmd = json.load(f)
        except (json.JSONDecodeError, IOError):
            return

        request_id = cmd.get("requestId", "")
        if request_id in self.processed_commands:
            return

        action = cmd.get("action")
        reason = cmd.get("reason", "unknown")
        if action not in ("turn_on", "turn_off"):
            log.warning("不明なアクション: %s", action)
            return

        log.info("ローカルコマンド受信: action=%s, reason=%s", action, reason)
        self._execute_and_report(action, reason, "edge", request_id)

    def _check_s3_command(self):
        """S3 のコマンドファイルを確認（管理画面からの制御）"""
        if not self.s3 or not S3_BUCKET:
            return

        try:
            resp = self.s3.get_object(Bucket=S3_BUCKET, Key=S3_COMMAND_KEY)
            body = json.loads(resp["Body"].read().decode("utf-8"))

            request_id = body.get("requestId", "")
            if request_id in self.processed_commands:
                # 既に処理済み → ファイル削除
                self.s3.delete_object(Bucket=S3_BUCKET, Key=S3_COMMAND_KEY)
                return

            action = body.get("action")
            reason = body.get("reason", "management_console")

            if action not in ("turn_on", "turn_off"):
                log.warning("S3 コマンド: 不明なアクション %s", action)
                self.s3.delete_object(Bucket=S3_BUCKET, Key=S3_COMMAND_KEY)
                return

            log.info("S3 コマンド受信: action=%s, reason=%s", action, reason)
            self._execute_and_report(action, reason, "console", request_id)

            # コマンドファイルを削除
            self.s3.delete_object(Bucket=S3_BUCKET, Key=S3_COMMAND_KEY)

        except self.s3.exceptions.NoSuchKey:
            pass
        except ClientError as e:
            if e.response["Error"]["Code"] != "NoSuchKey":
                log.debug("S3 コマンド確認エラー: %s", e)

    def _execute_and_report(
        self, action: str, reason: str, source: str, request_id: str
    ):
        """TV 制御を実行し、結果を報告"""
        result = self.tv.control(action)

        if request_id:
            self.processed_commands.add(request_id)
            # メモリ肥大化防止
            if len(self.processed_commands) > 1000:
                self.processed_commands.clear()

        # ステータスファイル更新
        self._write_status()

        # MQTT で結果を通知
        self._publish_event(action, reason, source, result)

        log.info(
            "TV 制御完了: action=%s, success=%s, method=%s, source=%s",
            action,
            result["success"],
            result["method"],
            source,
        )

    def _publish_event(
        self, action: str, reason: str, source: str, result: dict
    ):
        """TV 制御イベントを MQTT で送信"""
        if not self.iot_data:
            return

        now = datetime.now(timezone.utc)
        payload = {
            "deviceId": THING_NAME,
            "action": action,
            "reason": reason,
            "source": source,
            "success": result["success"],
            "method": result["method"],
            "error": result.get("error", ""),
            "tvPower": self.tv.tv_power,
            "timestamp": now.isoformat(),
            "epochSeconds": int(now.timestamp()),
        }

        try:
            self.iot_data.publish(
                topic=MQTT_TOPIC,
                qos=1,
                payload=json.dumps(payload),
            )
            log.info("MQTT 送信: %s (success=%s)", action, result["success"])
        except Exception:
            log.exception("MQTT 送信失敗")

    def _write_status(self):
        """現在のステータスをファイルに書き出し"""
        status = {
            "tvPower": self.tv.tv_power,
            "method": self.tv.method,
            "deviceId": THING_NAME,
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        }
        try:
            with open(STATUS_FILE, "w") as f:
                json.dump(status, f)
        except IOError:
            log.exception("ステータスファイル書き込み失敗")


def main():
    controller = DeviceController()
    controller.run()


if __name__ == "__main__":
    main()
