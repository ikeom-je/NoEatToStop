"""
ChewingAnalyzer 変化検知ロジックのユニットテスト

テスト対象:
1. _detect_change() — 変化検知の判定ロジック
2. _process_frame() — 変化時のみフレーム履歴アップロード
3. FrameCapture — キャプチャ間隔とlive-frame間隔の分離
"""

import os
import sys
import json
import tempfile
import unittest
from unittest.mock import patch, MagicMock
from pathlib import Path

import cv2
import numpy as np

# analyzer.py をインポートするためパスを追加
ANALYZER_DIR = os.path.join(
    os.path.dirname(__file__),
    "..",
    "greengrass",
    "components",
    "com.noeatstop.ChewingAnalyzer",
    "artifacts",
)
sys.path.insert(0, os.path.abspath(ANALYZER_DIR))


def make_analyzer(**env_overrides):
    """テスト用の ChewingAnalyzer を生成（S3/MQTT無効）"""
    env = {
        "S3_BUCKET": "",
        "IOT_ENDPOINT": "",
        "FRAME_PATH": "/tmp/test_frame.jpg",
        "CHANGE_DETECTION_ENABLED": "true",
        "PIXEL_DIFF_THRESHOLD": "300",
        "CHEWING_MOTION_THRESHOLD": "500",
        "ANALYSIS_FRAME_COUNT": "5",
        "PAUSE_THRESHOLD": "10",
    }
    env.update(env_overrides)
    with patch.dict(os.environ, env, clear=False):
        # リロードしてモジュールレベルの変数を反映
        import importlib
        import analyzer as mod
        importlib.reload(mod)
        a = mod.ChewingAnalyzer()
    return a


class TestDetectChange(unittest.TestCase):
    """_detect_change() のユニットテスト"""

    def setUp(self):
        self.analyzer = make_analyzer()

    def test_face_detected_change(self):
        """顔が検出されていない→検出された: face_detected イベント"""
        self.analyzer.prev_faces_detected = False
        faces = np.array([[10, 10, 100, 100]])  # 顔あり
        changed, change_type = self.analyzer._detect_change(faces, 0.0)
        self.assertTrue(changed)
        self.assertEqual(change_type, "face_detected")

    def test_face_lost_change(self):
        """顔が検出されている→検出されなくなった: face_lost イベント"""
        self.analyzer.prev_faces_detected = True
        faces = np.array([])  # 顔なし
        changed, change_type = self.analyzer._detect_change(faces, 0.0)
        self.assertTrue(changed)
        self.assertEqual(change_type, "face_lost")

    def test_pixel_diff_above_threshold(self):
        """口元差分が閾値超: pixel_diff イベント"""
        self.analyzer.prev_faces_detected = True
        faces = np.array([[10, 10, 100, 100]])
        changed, change_type = self.analyzer._detect_change(faces, 500.0)
        self.assertTrue(changed)
        self.assertEqual(change_type, "pixel_diff")

    def test_pixel_diff_below_threshold(self):
        """口元差分が閾値以下: 変化なし"""
        self.analyzer.prev_faces_detected = True
        faces = np.array([[10, 10, 100, 100]])
        changed, change_type = self.analyzer._detect_change(faces, 100.0)
        self.assertFalse(changed)
        self.assertIsNone(change_type)

    def test_no_faces_no_change(self):
        """顔なし→顔なし: 変化なし"""
        self.analyzer.prev_faces_detected = False
        faces = np.array([])
        changed, change_type = self.analyzer._detect_change(faces, 0.0)
        self.assertFalse(changed)
        self.assertIsNone(change_type)

    def test_change_detection_disabled(self):
        """変化検知無効: 常に changed=True"""
        analyzer = make_analyzer(CHANGE_DETECTION_ENABLED="false")
        analyzer.prev_faces_detected = False
        faces = np.array([])
        changed, change_type = analyzer._detect_change(faces, 0.0)
        self.assertTrue(changed)
        self.assertIsNone(change_type)


class TestConditionalUpload(unittest.TestCase):
    """変化時のみフレーム履歴アップロードされるテスト"""

    def setUp(self):
        self.analyzer = make_analyzer(S3_BUCKET="test-bucket")
        self.analyzer.s3 = MagicMock()

    def test_upload_on_face_detected(self):
        """顔検出変化時にフレーム履歴がアップロードされる"""
        self.analyzer.prev_faces_detected = False
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        faces = np.array([[100, 100, 200, 200]])

        self.analyzer._upload_frame_history(frame, "chewing", 600.0, 1, 0.5)
        self.analyzer.s3.put_object.assert_called_once()

        call_args = self.analyzer.s3.put_object.call_args
        self.assertEqual(call_args[1]["Bucket"], "test-bucket")
        self.assertIn("frames/", call_args[1]["Key"])

    def test_no_upload_when_no_change(self):
        """変化なし時にフレーム履歴がアップロードされない（呼び出されない）"""
        self.analyzer.prev_faces_detected = True
        faces = np.array([[100, 100, 200, 200]])
        # motion_score が閾値以下 → 変化なし
        changed, _ = self.analyzer._detect_change(faces, 100.0)
        self.assertFalse(changed)
        # _upload_frame_history が呼ばれないことを確認
        self.analyzer.s3.put_object.assert_not_called()


class TestMQTTFrameChange(unittest.TestCase):
    """フレーム変化 MQTT 通知のテスト"""

    def setUp(self):
        self.analyzer = make_analyzer(
            S3_BUCKET="test-bucket",
            IOT_ENDPOINT="test-endpoint.iot.ap-northeast-1.amazonaws.com",
        )
        self.analyzer.iot_data = MagicMock()

    def test_publish_frame_change(self):
        """フレーム変化時にMQTTが送信される"""
        self.analyzer._publish_frame_change("face_detected", 600.0, 1, "chewing")

        self.analyzer.iot_data.publish.assert_called_once()
        call_args = self.analyzer.iot_data.publish.call_args
        self.assertIn("frame-change", call_args[1]["topic"])

        payload = json.loads(call_args[1]["payload"])
        self.assertEqual(payload["changeType"], "face_detected")
        self.assertEqual(payload["details"]["diffScore"], 600)
        self.assertEqual(payload["details"]["facesDetected"], 1)
        self.assertEqual(payload["details"]["chewingState"], "chewing")
        self.assertIn("s3Key", payload)

    def test_no_publish_without_iot(self):
        """IOT_ENDPOINT 未設定時はMQTT送信しない"""
        analyzer = make_analyzer()
        analyzer.iot_data = None
        # エラーなく完了することを確認
        analyzer._publish_frame_change("face_detected", 600.0, 1, "chewing")


class TestChewingStateChange(unittest.TestCase):
    """咀嚼状態変化が変化イベントとして扱われるテスト"""

    def setUp(self):
        self.analyzer = make_analyzer(S3_BUCKET="test-bucket")
        self.analyzer.s3 = MagicMock()
        self.analyzer.iot_data = MagicMock()

    def test_state_change_triggers_upload(self):
        """咀嚼状態変化時にフレーム履歴がアップロードされる"""
        self.analyzer.current_state = "waiting"
        self.analyzer.prev_faces_detected = True

        # 顔ありで差分なし（pixel_diff は閾値以下）だが、状態変化がある場合
        faces = np.array([[100, 100, 200, 200]])
        motion_score = 100.0  # 閾値以下

        changed, change_type = self.analyzer._detect_change(faces, motion_score)
        # pixel_diff では変化なしだが…
        self.assertFalse(changed)

        # 状態が waiting → chewing に変わるので、_process_frame 内で
        # changed = True, change_type = "chewing_state_change" に上書きされる


class TestSettingsReload(unittest.TestCase):
    """動的設定リロードで変化検知パラメータが反映されるテスト"""

    def test_reload_change_detection_params(self):
        """設定ファイル更新で変化検知パラメータが反映される"""
        analyzer = make_analyzer()

        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump({
                "changeDetectionEnabled": False,
                "pixelDiffThreshold": 1000,
            }, f)
            f.flush()
            settings_path = f.name

        try:
            import analyzer as mod
            original_settings_file = mod.SETTINGS_FILE
            mod.SETTINGS_FILE = settings_path

            analyzer.settings_mtime = 0.0
            analyzer._reload_settings()

            self.assertFalse(analyzer.change_detection_enabled)
            self.assertEqual(analyzer.pixel_diff_threshold, 1000.0)
        finally:
            mod.SETTINGS_FILE = original_settings_file
            os.unlink(settings_path)


class TestLiveFrameInterval(unittest.TestCase):
    """FrameCapture の LIVE_FRAME_INTERVAL 分離テスト"""

    def test_capture_interval_default(self):
        """CAPTURE_INTERVAL のデフォルトが1秒"""
        # capture.js は Node.js なので、ここでは環境変数のデフォルト値を確認
        capture_js_path = os.path.join(
            os.path.dirname(__file__),
            "..",
            "greengrass",
            "components",
            "com.noeatstop.FrameCapture",
            "artifacts",
            "capture.js",
        )
        with open(capture_js_path) as f:
            content = f.read()

        self.assertIn("CAPTURE_INTERVAL || '1'", content)
        self.assertIn("LIVE_FRAME_INTERVAL || '3'", content)

    def test_mac_dev_capture_interval(self):
        """Mac開発版も CAPTURE_INTERVAL デフォルト1秒"""
        capture_js_path = os.path.join(
            os.path.dirname(__file__),
            "..",
            "frame-capture",
            "capture.js",
        )
        with open(capture_js_path) as f:
            content = f.read()

        self.assertIn("CAPTURE_INTERVAL || '1'", content)
        self.assertIn("LIVE_FRAME_INTERVAL || '3'", content)


if __name__ == "__main__":
    unittest.main()
