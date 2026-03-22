# Requirements Document

## Introduction

NoEatToStopシステムは、子供の食事中の行動を監視し、食事動作が止まった際に自動的にテレビの電源を制御するシステムです。このシステムにより、子供が食事に集中し、テレビは補助的な情報取得手段として位置付けることを目的としています。

カメラを使用した映像認識技術とAWSクラウドサービスを組み合わせ、リアルタイムでの食事状態判定とデバイス制御を実現します。

## Glossary

- **NoEatToStopシステム**: 食事動作監視によるテレビ制御システム
- **エッジデバイス**: Docker上のIoT Greengrass Coreコンテナによる映像取得・処理装置（マシン非依存、Raspberry Pi等で動作）
- **食事動作**: 咀嚼動作の継続的な実行状態
- **咀嚼動作**: 口の動きによる食べ物を噛む行為
- **食事開始条件**: 食器の配置後に人間が食事を口に運ぶ状態
- **食事終了条件**: 食器の片付けが完了した状態
- **動作停止閾値**: 咀嚼動作が停止したと判定する時間（デフォルト10秒）
- **信頼度閾値**: 状態変化を確定するための最小信頼度（デフォルト80%）
- **管理画面**: Vue.js製のWeb管理インターフェース
- **TVコントロールインターフェース**: 外部テレビ制御システムとの統合用インターフェース
- **TVコントロール状態**: テレビ制御リクエストの実行状態と履歴情報
- **Cognito User Pool**: AWS の認証サービス。管理画面へのアクセス制御に使用
- **PKCE**: Proof Key for Code Exchange。SPA 向けセキュアな OAuth 2.0 拡張
- **Cognito Authorizer**: API Gateway 組み込みの Cognito トークン検証機能

## Requirements

### Requirement 1

**User Story:** 保護者として、子供が食事中にテレビに気を取られて食事の手が止まることを防ぎたい。そのため、食事動作をしている時のみテレビが視聴できるようにしたい。

#### Acceptance Criteria

1. WHEN USBカメラ（1080P/30frame）がエッジデバイス（Docker上のGreengrass Coreコンテナ）に接続されている THEN エッジデバイス SHALL 常時映像を取得する
2. WHEN 食器の配置後に人間が食事を口に運ぶ状態が検出された THEN システム SHALL 詳細な映像内容判定を開始する
3. WHEN 咀嚼動作が継続的に検出されている THEN システム SHALL パナソニック製テレビの電源をON状態に維持する
4. WHEN 咀嚼動作が10秒間停止した THEN システム SHALL テレビデバイスの電源を即座にOFFにする
5. WHEN 食器の片付けが完了し食事終了が検出された THEN システム SHALL 詳細な映像判定処理を停止する

### Requirement 2

**User Story:** システム管理者として、映像認識の精度を確保し、誤判定を最小限に抑えたい。そのため、エッジとクラウドの両方で映像処理を行いたい。

#### Acceptance Criteria

1. WHEN エッジデバイスで映像を処理する THEN システム SHALL IoT GreengrassのLocal Lambdaで顔検出と咀嚼動作の基本判定を実行する
2. WHEN AWS側で映像を処理する THEN システム SHALL Amazon Recognition または Bedrock（Claude）を使用して詳細な咀嚼状態判定を行う
3. WHEN 映像認識処理を実行する THEN システム SHALL デフォルト20秒間の映像データを基に食事状態を判定する
4. IF エッジ側の処理で信頼度が80%未満の場合 THEN システム SHALL クラウド側の高精度な認識処理を優先する
5. WHEN 複数の子供が同時に食事する場合 THEN システム SHALL 設定された子供数分の咀嚼動作停止を検出してからテレビをOFFにする

### Requirement 3

**User Story:** システム管理者として、映像データの適切な管理と監視を行いたい。そのため、映像の保存とログ管理機能が必要である。

#### Acceptance Criteria

1. WHEN 映像データを保存する THEN システム SHALL エッジデバイスにデフォルト10秒分の映像を一時保存する
2. WHEN 1回の食事が完了する THEN システム SHALL AWS側に1日分の映像データを保存する
3. WHEN 映像データを送信する THEN システム SHALL S3 にフレーム画像をアップロードし、presigned URL 経由で管理画面に配信する
4. WHEN システムの動作状況を監視する THEN システム SHALL IoT Greengrassを活用してログと監視データを可視化する
5. WHEN 映像データアクセスが必要な場合 THEN システム SHALL 管理画面の管理IDを持つユーザーのみにアクセス権限を付与する
6. WHEN 誤判定を検証する場合 THEN システム SHALL 判定時の画像・動画を1日分保存し、手動での誤判定フラグ入力機能を提供する

### Requirement 4

**User Story:** システム管理者として、システムの設定変更や映像確認を簡単に行いたい。そのため、Webベースの管理画面が必要である。

#### Acceptance Criteria

1. WHEN 管理画面にアクセスする THEN システム SHALL Vue.js v3 + Tailwind CSSで構築されたSPAを提供する
2. WHEN 管理画面を配信する THEN システム SHALL S3に配置されたアプリケーションをCloudFront経由で提供する
3. WHEN システム設定を変更する THEN 管理画面 SHALL 以下の設定変更機能を提供する：動作停止閾値（デフォルト10秒）、信頼度閾値（デフォルト80%）、映像データ保持期間（デフォルト1日）、映像解像度・フレームレート、リアルタイム映像更新頻度（デフォルト3秒）、子供数設定、大人検出ON/OFF設定
4. WHEN 現在の映像を確認する THEN 管理画面 SHALL 3秒間隔でのリアルタイム映像表示機能を提供する
5. WHEN 過去の食事記録を確認する THEN 管理画面 SHALL 食事中の咀嚼時間、咀嚼停止によるTV制御回数の統計情報表示機能を提供する
6. WHEN 緊急時の制御が必要な場合 THEN 管理画面 SHALL 手動でのシステム停止機能を提供する
7. WHEN 認識感度を調整する場合 THEN 管理画面 SHALL 人の顔認識、口の位置認識、咀嚼判定の各閾値設定機能を提供する
8. WHEN TVコントロール状態を監視する THEN 管理画面 SHALL 現在のTVコントロール実行状態、リクエスト履歴、成功/失敗状況を表示する
9. WHEN TVコントロールリクエストが実行中の場合 THEN 管理画面 SHALL リクエスト中であることを明確に表示する

### Requirement 5

**User Story:** 開発者として、システムの構築とデプロイを効率的に行いたい。そのため、Infrastructure as Codeを使用した自動化されたデプロイメント環境が必要である。

#### Acceptance Criteria

1. WHEN インフラストラクチャをデプロイする THEN システム SHALL AWS CDKを使用してすべてのAWSリソースを定義・デプロイする
2. WHEN フロントエンドアプリケーションをデプロイする THEN システム SHALL Vue.jsアプリをビルドしてS3にアップロード、CloudFront経由で配信する
3. WHEN デプロイを実行する THEN システム SHALL 自動化されたデプロイスクリプトでAPI URLの動的設定とファイルアップロードを実行する
4. WHEN 開発環境とプロダクション環境を管理する THEN システム SHALL 環境別の設定管理機能を提供する
4. WHEN システムをテストする THEN 開発時・本番時ともに SHALL Docker上のIoT Greengrass Coreコンテナでマシン非依存な動作をサポートする

### Requirement 6

**User Story:** システム運用者として、エラー発生時やネットワーク障害時にも安全にシステムが動作することを確保したい。そのため、適切なエラーハンドリングとフォールバック機能が必要である。

#### Acceptance Criteria

1. WHEN カメラ故障が発生した場合 THEN システム SHALL 何も処理せずTV制御も実行しない
2. WHEN 映像認識エラーが発生した場合 THEN システム SHALL デフォルト動作として制御や処理を実行しない
3. WHEN ネットワーク断絶が発生した場合 THEN システム SHALL エッジ処理のみで動作を継続する
4. WHEN TV制御リクエストが失敗した場合 THEN システム SHALL 1回のリトライを3秒間隔で実行する
5. WHEN システム全体の故障が発生した場合 THEN 管理画面 SHALL カメラオフ、クラウド送信オフ等の手動制御機能を提供する
6. WHEN TVコントロールインターフェースが利用できない場合 THEN システム SHALL エラー状態を記録し、管理画面に表示する

### Requirement 7

**User Story:** システム管理者として、システムの動作状況と性能を監視し、将来の改善に活用したい。そのため、包括的なログ記録とメトリクス収集機能が必要である。

#### Acceptance Criteria

1. WHEN システムが動作する場合 THEN システム SHALL デバイス側とクラウド側の処理・判断状態をログ記録する
2. WHEN クリティカルエラーが発生した場合 THEN システム SHALL アラート通知を送信する
3. WHEN 性能測定を実行する場合 THEN システム SHALL 食事時間の開始・停止判定、人間判定、口判定、咀嚼状態判定、TV制御成功可否の各メトリクスを記録する
4. WHEN システム応答時間を測定する場合 THEN システム SHALL 映像認識から判定結果まで3秒以内の処理を目標とする
5. WHEN 同時処理を実行する場合 THEN システム SHALL 初期段階では1ストリーム対応とする
6. WHEN TVコントロールリクエストを実行する場合 THEN システム SHALL リクエスト時刻、理由、成功/失敗、応答時間を記録する

### Requirement 8

**User Story:** 開発者として、TVコントロール機能の統合テストを確実に実行したい。そのため、インターフェース呼び出しの検証とモック機能が必要である。

#### Acceptance Criteria

1. WHEN 咀嚼停止が検出された場合 THEN システム SHALL TVコントロールインターフェースを呼び出す
2. WHEN TVコントロールインターフェースが呼び出された場合 THEN システム SHALL 呼び出し履歴を記録する
3. WHEN テスト実行時 THEN システム SHALL モックTVコントロールサービスを使用してインターフェース呼び出しを検証する
4. WHEN 統合テストを実行する場合 THEN テスト SHALL TVコントロールインターフェースの呼び出し回数と内容を確認する

### Requirement 9

**User Story:** 保護者として、管理画面に表示される検出画像や映像データが第三者に閲覧されることを防ぎたい。そのため、認証されたユーザーのみがシステムにアクセスできるようにしたい。

#### Acceptance Criteria

1. WHEN 未認証ユーザーが管理画面にアクセスする THEN システム SHALL Cognito Managed Login 画面にリダイレクトする
2. WHEN ユーザーが正しい認証情報でログインする THEN システム SHALL Authorization Code Flow with PKCE でトークンを発行し、管理画面へ遷移させる
3. WHEN 認証済みユーザーが API を呼び出す THEN システム SHALL Bearer トークンを自動付与し、Cognito Authorizer で検証する
4. WHEN 未認証の API リクエストを受信する THEN API Gateway SHALL 401 Unauthorized を返却する
5. WHEN アクセストークンが期限切れになる THEN フロントエンド SHALL リフレッシュトークンで自動更新し、更新失敗時はログアウトする
6. WHEN ユーザーがログアウトする THEN システム SHALL ローカルトークンを削除し、Cognito ログアウトエンドポイントにリダイレクトする
7. WHEN 新規ユーザーを追加する THEN 管理者 SHALL AWS CLI `admin-create-user` で招待する（セルフサインアップ無効）