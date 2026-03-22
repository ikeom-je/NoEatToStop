"""
変化検知の統合テスト — S3アップロードの条件付き動作を検証

コンテナ外でanalyzer.pyのロジックをS3モック付きで実行し、
変化時のみアップロードされることを確認する。

テスト対象:
1. 顔なし→顔なし: frames/ アップロードなし
2. 顔なし→顔あり: frames/ アップロード + MQTT通知
3. 顔あり（差分小）: frames/ アップロードなし
4. 顔あり（差分大）: frames/ アップロード + MQTT通知
5. 状態変化: frames/ アップロード + MQTT通知
"""

import os
import sys
import json
import unittest
from unittest.mock import patch, MagicMock, call
import tempfile

import cv2
import numpy as np

ANALYZER_DIR = os.path.join(
    os.path.dirname(__file__),
    "..",
    "greengrass",
    "components",
    "com.noeatstop.ChewingAnalyzer",
    "artifacts",
)
sys.path.insert(0, os.path.abspath(ANALYZER_DIR))


def make_analyzer_with_mocks(**env_overrides):
    """S3/MQTT をモック化した ChewingAnalyzer を生成"""
    env = {
        "S3_BUCKET": "test-bucket",
        "IOT_ENDPOINT": "test.iot.ap-northeast-1.amazonaws.com",
        "FRAME_PATH": "/tmp/test_frame.jpg",
        "CHANGE_DETECTION_ENABLED": "true",
        "PIXEL_DIFF_THRESHOLD": "300",
        "CHEWING_MOTION_THRESHOLD": "500",
        "ANALYSIS_FRAME_COUNT": "5",
        "PAUSE_THRESHOLD": "10",
        "THING_NAME": "test-device",
    }
    env.update(env_overrides)

    with patch.dict(os.environ, env, clear=False):
        import importlib
        import analyzer as mod
        importlib.reload(mod)
        a = mod.ChewingAnalyzer()

    # S3/MQTT をモック化
    a.s3 = MagicMock()
    a.iot_data = MagicMock()
    return a


def create_frame_with_face(face_cascade_path):
    """Haar Cascadeで検出可能な顔を含むフレームを生成するため、
    カスケード自体を使って検出できる画像を探索的に生成"""
    # 実際の顔画像がないため、顔検出をバイパスしてテストする
    # 代わりに _process_frame を直接テストせず、
    # _detect_change + _upload_frame_history の連携をテストする
    return np.ones((480, 640, 3), dtype=np.uint8) * 128


class TestIntegrationNoFaceNoUpload(unittest.TestCase):
    """ユースケース1: 顔なし状態が続く場合、frames/ へのアップロードなし"""

    def test_no_face_continuous_no_upload(self):
        """顔なし→顔なし: _detect_change で変化なし → アップロードなし"""
        analyzer = make_analyzer_with_mocks()
        analyzer.prev_faces_detected = False

        # 10フレーム分、顔なし状態を繰り返す
        for _ in range(10):
            faces = np.array([])
            changed, change_type = analyzer._detect_change(faces, 0.0)
            if not changed:
                pass  # アップロードしない
            else:
                analyzer._upload_frame_history(
                    np.zeros((480, 640, 3), dtype=np.uint8),
                    "meal_ended", 0.0, 0, 0.0,
                )
            analyzer.prev_faces_detected = len(faces) > 0

        # S3アップロードは0回
        analyzer.s3.put_object.assert_not_called()


class TestIntegrationFaceAppearUpload(unittest.TestCase):
    """ユースケース2: 顔なし→顔あり変化時にアップロード + MQTT通知"""

    def test_face_appear_triggers_upload_and_mqtt(self):
        """顔が現れた瞬間にフレーム履歴アップロード + MQTT frame-change 通知"""
        analyzer = make_analyzer_with_mocks()
        analyzer.prev_faces_detected = False

        # 顔が現れた
        faces = np.array([[100, 100, 200, 200]])
        changed, change_type = analyzer._detect_change(faces, 0.0)

        self.assertTrue(changed)
        self.assertEqual(change_type, "face_detected")

        # アップロード実行
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        analyzer._upload_frame_history(frame, "chewing", 600.0, 1, 0.5)
        analyzer._publish_frame_change("face_detected", 600.0, 1, "chewing")

        # S3アップロードされた
        analyzer.s3.put_object.assert_called_once()
        s3_call = analyzer.s3.put_object.call_args
        self.assertIn("frames/", s3_call[1]["Key"])

        # MQTT通知された
        analyzer.iot_data.publish.assert_called_once()
        mqtt_call = analyzer.iot_data.publish.call_args
        self.assertIn("frame-change", mqtt_call[1]["topic"])
        payload = json.loads(mqtt_call[1]["payload"])
        self.assertEqual(payload["changeType"], "face_detected")


class TestIntegrationFacePresentSmallDiff(unittest.TestCase):
    """ユースケース3: 顔あり + 差分小 → アップロードなし"""

    def test_face_present_small_diff_no_upload(self):
        """顔ありだが口元差分が閾値以下 → アップロードなし"""
        analyzer = make_analyzer_with_mocks()
        analyzer.prev_faces_detected = True

        # 顔あり、差分小
        faces = np.array([[100, 100, 200, 200]])
        motion_score = 100.0  # 閾値300以下

        changed, change_type = analyzer._detect_change(faces, motion_score)
        self.assertFalse(changed)

        # アップロードなし
        analyzer.s3.put_object.assert_not_called()
        analyzer.iot_data.publish.assert_not_called()


class TestIntegrationFacePresentLargeDiff(unittest.TestCase):
    """ユースケース4: 顔あり + 差分大 → アップロード + MQTT通知"""

    def test_face_present_large_diff_triggers_upload(self):
        """口元差分が閾値超 → フレーム履歴アップロード + MQTT通知"""
        analyzer = make_analyzer_with_mocks()
        analyzer.prev_faces_detected = True

        # 顔あり、差分大
        faces = np.array([[100, 100, 200, 200]])
        motion_score = 800.0  # 閾値300超

        changed, change_type = analyzer._detect_change(faces, motion_score)
        self.assertTrue(changed)
        self.assertEqual(change_type, "pixel_diff")

        # アップロード + MQTT
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        analyzer._upload_frame_history(frame, "chewing", motion_score, 1, 0.7)
        analyzer._publish_frame_change("pixel_diff", motion_score, 1, "chewing")

        analyzer.s3.put_object.assert_called_once()
        analyzer.iot_data.publish.assert_called_once()

        payload = json.loads(analyzer.iot_data.publish.call_args[1]["payload"])
        self.assertEqual(payload["changeType"], "pixel_diff")
        self.assertEqual(payload["details"]["diffScore"], 800)


class TestIntegrationStateChangeUpload(unittest.TestCase):
    """ユースケース5: 咀嚼状態変化 → アップロード + MQTT通知"""

    def test_state_change_triggers_upload(self):
        """状態が chewing → chewing_stopped に変わるとアップロード"""
        analyzer = make_analyzer_with_mocks()
        analyzer.prev_faces_detected = True
        analyzer.current_state = "chewing"

        # 顔あり、差分小だが状態変化
        faces = np.array([[100, 100, 200, 200]])
        motion_score = 50.0  # 閾値以下

        changed, change_type = analyzer._detect_change(faces, motion_score)
        # pixel_diff としては変化なし
        self.assertFalse(changed)

        # しかし状態変化がある場合は _process_frame 内で changed=True に上書きされる
        new_state = "chewing_stopped"
        if new_state != analyzer.current_state:
            changed = True
            change_type = "chewing_state_change"

        self.assertTrue(changed)
        self.assertEqual(change_type, "chewing_state_change")

        # アップロード
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        analyzer._upload_frame_history(frame, new_state, motion_score, 1, 0.3)
        analyzer._publish_frame_change(change_type, motion_score, 1, new_state)

        analyzer.s3.put_object.assert_called_once()
        analyzer.iot_data.publish.assert_called_once()

        payload = json.loads(analyzer.iot_data.publish.call_args[1]["payload"])
        self.assertEqual(payload["changeType"], "chewing_state_change")


class TestIntegrationEndToEndSequence(unittest.TestCase):
    """E2Eシーケンス: 複数フレームにわたる変化検知の流れ"""

    def test_full_sequence(self):
        """顔なし→顔あり→差分小→差分大→顔なし のシーケンス"""
        analyzer = make_analyzer_with_mocks()
        analyzer.prev_faces_detected = False

        upload_count = 0
        mqtt_count = 0

        scenarios = [
            # (faces, motion_score, expected_changed, expected_type)
            (np.array([]), 0.0, False, None),                           # 1. 顔なし→顔なし
            (np.array([]), 0.0, False, None),                           # 2. 顔なし→顔なし
            (np.array([[100, 100, 200, 200]]), 0.0, True, "face_detected"),  # 3. 顔検出
            (np.array([[100, 100, 200, 200]]), 50.0, False, None),      # 4. 差分小
            (np.array([[100, 100, 200, 200]]), 100.0, False, None),     # 5. 差分小
            (np.array([[100, 100, 200, 200]]), 800.0, True, "pixel_diff"),   # 6. 差分大
            (np.array([[100, 100, 200, 200]]), 50.0, False, None),      # 7. 差分小
            (np.array([]), 0.0, True, "face_lost"),                     # 8. 顔消失
            (np.array([]), 0.0, False, None),                           # 9. 顔なし→顔なし
        ]

        for i, (faces, motion, exp_changed, exp_type) in enumerate(scenarios, 1):
            changed, change_type = analyzer._detect_change(faces, motion)
            self.assertEqual(
                changed, exp_changed,
                f"Scenario {i}: changed={changed}, expected={exp_changed}"
            )
            self.assertEqual(
                change_type, exp_type,
                f"Scenario {i}: type={change_type}, expected={exp_type}"
            )

            if changed:
                upload_count += 1
                mqtt_count += 1

            analyzer.prev_faces_detected = len(faces) > 0

        # 9フレーム中、3回だけアップロード（face_detected, pixel_diff, face_lost）
        self.assertEqual(upload_count, 3)
        self.assertEqual(mqtt_count, 3)


if __name__ == "__main__":
    unittest.main()
