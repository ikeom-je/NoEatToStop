# NoEatToStop システム インストールガイド

## 概要

NoEatToStopシステムは、子供の食事行動を監視してTV制御を行うIoTシステムです。

## システム要件

### AWS環境
- AWS CLI設定済み
- CDK v2.100.0以上
- Node.js 18以上

### エッジデバイス
- Raspberry Pi 3B以上
- 1080P/30fps対応USBカメラ
- パナソニック製TV（2022年製50インチ推奨）

## インストール手順

### 1. AWSインフラストラクチャのデプロイ

```bash
# リポジトリクローン
git clone <repository-url>
cd NoEatToStop

# 依存関係インストール
npm install

# 環境変数設定
cp .env.example .env.local
# .env.localを編集してAWS設定を入力

# インフラデプロイ
npm run deploy:all
```

### 2. Raspberry Pi セットアップ

```bash
# Raspberry Pi上で実行
curl -sSL https://raw.githubusercontent.com/your-repo/NoEatToStop/main/scripts/setup-raspberry-pi.sh | bash
```

### 3. Webアプリケーション設定

デプロイ完了後、CloudFront URLでWebアプリにアクセス可能です。

初期ログイン情報：
- ユーザー名: admin
- パスワード: (Cognitoで設定)

## 設定項目

### 基本設定
- **動作停止閾値**: デフォルト10秒
- **信頼度閾値**: デフォルト80%
- **映像バッファ時間**: デフォルト10秒

### 映像設定
- **解像度**: デフォルト640x360
- **フレームレート**: デフォルト30fps
- **更新間隔**: デフォルト3秒

### 対象者設定
- **子供数**: 監視対象の子供数
- **大人検出除外**: ON/OFF設定

## トラブルシューティング

### カメラが認識されない
```bash
# カメラテスト
python3 ~/test-camera.py

# USBデバイス確認
lsusb | grep -i camera
```

### ネットワーク接続エラー
```bash
# 接続テスト
ping 8.8.8.8

# Greengrass状態確認
sudo systemctl status greengrass
```

### TV制御が動作しない
```bash
# TV制御テスト
python3 ~/no-eat-to-stop/tv-control/panasonic-tv.py

# ネットワーク確認
ping <TV_IP_ADDRESS>
```

## パフォーマンス調整

### 応答時間最適化
- 映像解像度を下げる（480p推奨）
- 分析間隔を調整（5秒間隔推奨）
- エッジ処理優先設定

### 精度向上
- 信頼度閾値を上げる（85%推奨）
- 複数フレーム分析を有効化
- 照明条件を最適化

## メンテナンス

### 定期メンテナンス
- 週1回: カメラレンズ清掃
- 月1回: システムログ確認
- 四半期: 設定値見直し

### ログ確認
```bash
# システムログ
sudo journalctl -u no-eat-to-stop -f

# Greengrassログ
sudo tail -f /greengrass/v2/logs/greengrass.log
```

## サポート

技術的な問題については、以下を確認してください：
1. システムログ
2. ネットワーク接続
3. カメラ動作状況
4. TV制御設定
