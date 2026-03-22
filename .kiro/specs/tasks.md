# Implementation Plan

- [x] 1. Set up project structure and core CDK infrastructure
  - Create CDK project structure with TypeScript
  - Define core AWS resources (VPC, IAM roles, S3 buckets)
  - Set up environment-specific configurations (dev/prod)
  - _Requirements: 5.1, 5.2, 5.3_

- [ ] 2. Implement DynamoDB data models and access patterns
  - [x] 2.1 Create DynamoDB table definitions in CDK
    - Define MealSessions table with performance metrics and children count tracking
    - Define EatingStates table with chewing detection metadata and error flags
    - Define SystemSettings table with comprehensive configuration parameters
    - Add GSI for time-based queries and error analysis
    - _Requirements: 3.1, 3.2, 3.6, 7.3_

  - [x] 2.2 Implement data access layer with TypeScript interfaces
    - Create enhanced TypeScript interfaces for MealSession, EatingState, SystemConfiguration
    - Implement DynamoDB repository classes with CRUD operations for all settings
    - Add data validation for all configurable parameters (thresholds, durations, counts)
    - Implement error flag management for manual error correction
    - _Requirements: 3.1, 3.2, 4.3, 4.7_

  - [x] 2.3 Write unit tests for data access layer
    - Create unit tests for DynamoDB operations including new fields
    - Mock DynamoDB client for isolated testing
    - Test error scenarios and configuration validation
    - _Requirements: 3.1, 3.2_

- [x] 3. Set up S3 video storage
  - [x] 3.1 Create S3 bucket in CDK
    - Create S3 bucket with lifecycle policies for 1-day retention (live-frames, evidence, frames, daily)
    - Set up IAM permissions for S3 access
    - _Requirements: 3.2, 3.3, 3.5, 3.6_
    - **注**: KVS は不使用。Edge から S3 直接アップロード方式を採用

  - [x] 3.2 Implement S3 upload utilities
    - Implement S3 upload functionality for frames and judgment data
    - Add error handling for network disconnection (continue edge-only processing)
    - _Requirements: 3.1, 3.3, 6.3_

- [x] 4. Develop API Lambda functions and state management
  - [x] 4.1 Create API handler Lambda functions
    - Implement presigned URL 生成 for live-frames and analyzed-frames
    - Create CRUD handlers for meal sessions, eating states, settings
    - _Requirements: 2.2, 2.3, 2.5_
    - **注**: Rekognition は不使用。顔検出は Edge の OpenCV Haar Cascade で実装

  - [x] 4.2 Implement state management and DynamoDB integration
    - Create functions to update meal session states with chewing duration tracking
    - Implement chewing state history tracking with TV control count
    - Add business logic for state transitions based on chewing stop threshold (default 10 seconds)
    - Store judgment images for error analysis
    - _Requirements: 1.2, 1.4, 1.5, 3.6_

  - [ ]* 4.3 Write integration tests
    - Create test data for chewing scenarios
    - Validate state transition logic with configurable thresholds
    - _Requirements: 2.2, 2.3, 2.4_

- [x] 5. Greengrass 統合 Edge 環境の構築（案 B: 単一コンテナ統合）
  - [x] 5.1 Greengrass Docker イメージの拡張
    - Greengrass Dockerfile に Node.js 22 + Python 3.9 + ffmpeg を追加
    - 不要パッケージの削除によるイメージサイズ最適化（338MB）
    - イメージビルドと基本動作の確認
    - _Requirements: 2.1, 5.4_

  - [x] 5.2 FrameCapture Greengrass カスタムコンポーネントの作成
    - コンポーネントレシピ（recipe.yaml）の作成
    - capture.js の TES 対応（環境変数認証 → TES 自動認証）
    - コンポーネントアーティファクト（capture.js + package.json）の配置
    - ローカルデプロイメント設定
    - _Requirements: 2.1, 5.4_

  - [x] 5.3 Greengrass 起動時のコンポーネント自動デプロイ
    - greengrass-entrypoint.sh でローカルコンポーネントの初期デプロイ設定
    - Greengrass CLI によるローカルデプロイの自動化
    - プロビジョニング → コンポーネントデプロイ → 稼働の一連フローの確認
    - _Requirements: 2.1, 5.4_

  - [x] 5.4 docker-compose と不要ファイルの整理
    - docker-compose.yml から frame-capture サービスを削除
    - greengrass-core のボリュームマウント・環境変数を更新
    - edge/frame-capture/ ディレクトリの削除（コードは Greengrass コンポーネントに移動済み）
    - edge/.env.example から frame-capture 用 AWS 認証情報を削除
    - _Requirements: 5.4_

  - [x] 5.5 E2E テスト・ドキュメントの更新
    - e2e-test.sh: frame-capture コンテナチェック → Greengrass コンポーネントチェックに変更
    - edge/README.md, CLAUDE.md, README.md を案 B 構成に更新
    - Edge E2E テスト 8/8 PASS 確認（2026-03-20）
    - _Requirements: 5.4_
    - **B案スコープ境界**: Edge E2E（GGコンテナ稼働・HEALTHY・MQTT・S3読書・GGログ・FrameCaptureプロセス・S3フレーム）が対象。S3 Event Notification / IoT Topic Rule によるクラウド側自動処理は未実装（C案スコープ）

  - [x] 5.6 ChewingAnalyzer コンポーネントの追加（Python + OpenCV）
    - Python 3.9 + OpenCV Haar Cascade による顔検出・口領域差分・咀嚼判定
    - FrameCapture との連携: /tmp/frame.jpg ファイル監視方式
    - 毎フレーム BB 付き画像を S3 `live-frames/latest-analyzed.jpg` にアップロード
    - 状態変化時にエビデンス画像を S3 `evidence/` にアップロード
    - Lambda `getLatestAnalyzedFrame` + API `/video/latest-analyzed-frame` 追加
    - 管理画面で検出表示切替（LiveVideo.vue チェックボックス）
    - Edge E2E テスト 10/10 PASS 確認（2026-03-20）
    - _Requirements: 2.1, 1.1, 1.2, 1.3, 2.5_

  - [x] 5.6.1 MQTT 通知 + DynamoDB 保存パイプライン
    - ChewingAnalyzer が状態変化時に MQTT publish（boto3 iot-data）
    - トピック: `noeatstop/{deviceId}/chewing-state`
    - IoT Topic Rule → Lambda `handleChewingState` → DynamoDB `ChewingStates` テーブル
    - DynamoDB TTL（`expiresAt`）で自動削除、保管日数デフォルト7日（`chewingStateRetentionDays`）
    - Edge E2E テスト 12/12 PASS 確認（2026-03-20）
    - _Requirements: 2.1, 3.1, 3.2_

  - [x] 5.7 DeviceController コンポーネント（TV 制御 Mock）
    - DeviceController (controller.py): TV 制御ロジック（Mock）、リトライ、MQTT 通知
    - ChewingAnalyzer → DeviceController ファイル IPC 連携
    - 管理画面 → S3 コマンドファイル → DeviceController で Console → Edge 制御
    - TVControlEvents DynamoDB テーブル + IoT Topic Rule パイプライン
    - 管理画面: TV ON/OFF ボタン + イベント履歴表示
    - Edge E2E テスト 18/18 PASS 確認（2026-03-21）
    - _Requirements: 1.3, 1.4, 6.4, 6.6, 8.1, 8.2, 8.3, 8.4_

  - [x] 5.8 S3 Event Notification + フレーム履歴 + confidence
    - ChewingAnalyzer に分析精度 (confidence) 計算を追加
    - タイムスタンプ付きフレームを S3 `frames/` にアップロード（メタデータ付き）
    - S3 Event Notification → Lambda → FrameHistory DynamoDB テーブル
    - API GET `/frame-history` で presigned URL 付きフレーム履歴取得
    - MQTT ペイロードに confidence 追加
    - Edge E2E テスト 18/18 PASS 確認（2026-03-21）
    - _Requirements: 2.1, 3.1, 3.6_

  - [x] 5.9 咀嚼検出閾値チューニング + Human-in-the-loop ラベリング
    - ChewingAnalyzer 動的パラメータリロード（設定ファイル監視）
    - DeviceController paho-mqtt による MQTT Subscribe（設定 push + TV コマンド受信）
    - 管理画面設定保存時に Lambda → MQTT push でEdgeに設定変更通知
    - Labels DynamoDB テーブル（90日 TTL）+ API POST/GET `/labels`
    - 管理画面: フレーム画像付きラベリングUI（OK / NG顔 / NG口 / NG咀嚼）
    - Edge E2E テスト 18/18 PASS 確認（2026-03-21）
    - _Requirements: 4.7, 7.3_

- [ ] 6. Develop Vue.js web management interface
  - [x] 6.1 Set up Vue.js project with Tailwind CSS
    - Initialize Vue 3 project with Composition API
    - Configure Tailwind CSS and component structure
    - Set up Pinia for state management and Vue Router
    - _Requirements: 4.1, 4.2_

  - [x] 6.2 Create comprehensive UI components
    - Build LiveVideo component for real-time video display (3-second interval, configurable)
    - Implement MealHistory component for chewing time and TV control count statistics
    - Create SystemSettings component for all configurable parameters (thresholds, durations, counts, detection settings)
    - Build Dashboard component with overview metrics
    - Create EmergencyControl component for manual system stop and camera/cloud transmission control
    - Implement ErrorAnalysis component for manual error flag input and judgment data review
    - Build TVControlStatus component for TV control request monitoring and status display
    - _Requirements: 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9_

  - [x] 6.3 Implement comprehensive API integration services
    - Create API service layer for DynamoDB operations with all new data fields
    - Add WebSocket service for real-time updates with 3-second interval
    - Implement authentication and error handling for management ID access control
    - Create emergency control service for manual system operations
    - Add error analysis service for judgment data management
    - Implement TV control status service for request monitoring and history display
    - _Requirements: 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9_

  - [x] 6.4 Set up S3 static hosting and CloudFront distribution
    - Configure S3 bucket for static website hosting
    - Create CloudFront distribution with SPA support (404→index.html)
    - Set up automated build and deployment pipeline with API URL injection
    - Create deployment scripts for frontend-only and full deployment
    - _Requirements: 4.1, 4.2_

  - [x] 6.5 Write component tests for Vue.js application
    - Create unit tests for Vue components including new settings and emergency controls
    - Test API integration and state management with comprehensive parameters
    - Add E2E tests with Cypress for all management functions
    - Implement Cognito authentication for simple access control
    - _Requirements: 4.1, 4.2, 4.3_

- [x] 7. Implement monitoring and analytics with IoT Greengrass integration
  - [x] 7.1 Set up comprehensive logging and metrics
    - Configure logging for device-side and cloud-side processing and judgment states
    - Create custom metrics for performance measurement (meal start/end detection, face/mouth/chewing detection accuracy, TV control success rate)
    - Set up alarms for critical errors only (system processing critical errors)
    - Implement IoT Greengrass logging integration for system completion assessment
    - _Requirements: 3.4, 7.1, 7.2, 7.3_

  - [x] 7.2 Configure IoT Greengrass monitoring dashboards
    - Create dashboards for real-time system monitoring using IoT Greengrass capabilities
    - Add visualizations for chewing patterns and TV control events
    - Set up alerting rules for critical system errors only
    - _Requirements: 3.4, 7.1_

  - [x] 7.3 Set up performance analytics
    - Create analytics datasets from DynamoDB tables with new performance metrics
    - Build analytical dashboards for meal behavior insights (chewing time, TV control frequency)
    - Add performance tracking for all detection accuracies and system response times
    - Implement extensible design for additional metrics
    - _Requirements: 3.4, 7.3, 7.4_

- [x] 8. Integrate system components and end-to-end testing
  - [x] 8.1 Connect edge device to cloud services with error handling
    - Test S3 frame upload from Raspberry Pi 3B to cloud with network disconnection scenarios
    - Validate bidirectional communication between edge and cloud with IoT Greengrass
    - Ensure proper error handling (camera failure: no processing, network failure: edge-only processing)
    - Test TV control retry mechanism (1 retry, 3-second interval)
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 6.1, 6.2, 6.3, 6.4_

  - [x] 8.2 Implement complete meal session workflow
    - Create complete meal detection flow (dish placement → eating motion → chewing tracking → dish cleanup)
    - Test TV control based on chewing state changes with immediate OFF control
    - Validate data persistence and state synchronization with all new data fields
    - Test multiple children scenarios with configurable child count
    - Test adult exclusion functionality with ON/OFF settings
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 2.5_

  - [x] 8.3 Test system with real-world scenarios and performance validation
    - Validate system behavior with actual meal scenarios using prepared video data
    - Test system with real children and adult test scenarios
    - Test edge cases and automatic error recovery
    - Performance testing with 3-second response time target and 1-stream processing
    - Validate all configurable parameters work correctly through management interface
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 7.4, 7.5_

- [x] 9. Deployment and configuration management
  - [x] 9.1 Create deployment scripts and CI/CD pipeline
    - Set up automated CDK deployment pipeline for AWS infrastructure and application deployment
    - Create environment-specific configuration management
    - Add rollback and monitoring capabilities
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 9.2 Configure Docker-based edge device setup automation
    - Create docker-compose based setup for any host machine (Raspberry Pi, PC, etc.)
    - Set up IoT Greengrass installation and device registration via Docker
    - Add USB camera device mount configuration
    - _Requirements: 5.4, 2.1_

  - [x] 9.3 Create comprehensive system documentation (認証ドキュメント含む)
    - Write installation and setup documentation for Raspberry Pi 3B and AWS components
    - Create user manual for web management interface with all configuration options
    - Document troubleshooting procedures for camera failures, network issues, and TV control problems
    - Create performance tuning guide for all configurable parameters
    - _Requirements: 4.1, 4.2, 4.3_

- [x] 10. Cognito 認証機能の追加
  - [x] 10.1 CDK — Cognito リソース追加
    - Cognito User Pool（`noeatstop-users-{stage}`、selfSignUp 無効、email サインイン、RETAIN）
    - Cognito Domain（`noeatstop-{stage}` プレフィックス）
    - App Client（PKCE、Authorization Code Grant、openid/email/profile）
    - CognitoUserPoolsAuthorizer を全14 API メソッドに適用
    - CfnOutput: UserPoolId, UserPoolClientId, CognitoDomainName
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x] 10.2 Frontend — 認証サービス・ストア・コンポーネント
    - authService.ts: PKCE 生成、Cognito OAuth フロー、トークン管理（外部ライブラリ不使用）
    - authStore.ts: Pinia 認証状態ストア（login, logout, handleCallback, checkAuth）
    - AuthCallback.vue: OAuth callback ページ
    - apiService.ts: axios interceptor（Bearer token 付与 + 401 リフレッシュ）
    - router/index.ts: `/callback` ルート + beforeEach 認証ガード
    - App.vue: ヘッダーにユーザーメール + ログアウトボタン
    - main.ts: app.mount 前に authStore.checkAuth() 実行
    - _Requirements: 9.1, 9.2, 9.3, 9.5, 9.6_