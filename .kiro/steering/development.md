# Development style

# 開発ガイド

このドキュメントは、NoEatToStop Systemプロジェクトの標準開発手順、デバッグ方法、Lambda実装パターンを定義します。

## ドキュメント管理方針

### 記述内容の指針

| 文書種別                          | 記述方針            | 内容                                                                           | 場所              |
| --------------------------------- | ------------------- | ------------------------------------------------------------------------------ | ----------------- |
| **README.md**                     | What + How to start | プロジェクト概要と導入手順 (See [Make a README](https://www.makeareadme.com/)) | `/`               |
| **.kiro/steering/development.md** | How + What for      | 貢献方法と開発手順                                                             | `.kiro/steering/` |
| **API docs**                      | What + When         | APIの機能と使用タイミング                                                      | `docs/`           |
| **User guide**                    | How + What for      | 使用方法と用途                                                                 | `docs/`           |
| **Design Docs**                   | Why + What if       | 設計判断と代替案の検討                                                         | `design/`         |
| **ADR**                           | Why + When          | アーキテクチャ決定の理由と時期                                                 | `design/`         |
| **コミットログ**                  | Why                 | 変更の理由と背景                                                               | -                 |
| **PRテンプレート**                | What + Why          | 変更内容と理由                                                                 | -                 |
| **コードコメント**                | Why not             | 非自明な実装の判断理由                                                         | -                 |

### どこに何を書くか

| 場所              | 判断基準                                 | 例                                                                          | 対象読者               |
| ----------------- | ---------------------------------------- | --------------------------------------------------------------------------- | ---------------------- |
| `.kiro/steering/` | 「こうしなさい」（開発規約、手順）       | 「npmを使う」「DLQからリトライする手順」「npm run test:unit の実行方法」 | AIエージェント、開発者 |
| `design/`         | 「こうなっている理由」（設計判断、仕様） | 「SQSを使う理由」「状態遷移モデル」「トレースIDの伝播方法」                 | 開発者                 |
| `docs/`           | 「こう使う」（ユーザー向け手順）         | 操作マニュアル、API仕様と使うべきタイミング                                 | ユーザー               |

### 重要な原則

1. **永続化の責任**: `.kiro/specs/`（`requirements.md`, `design.md`, `tasks.md`）は開発仕様の管理ファイル。重要な設計判断や仕様は必ず `design/` にも永続化すること
2. **ADRの記録**: 複数の選択肢を検討した上で技術的判断を行った場合は `design/adr/` にArchitecture Decision Recordとして記録
3. **ユーザーガイドの作成**: 外部公開APIの追加や、複雑な手順を要する操作を実装した場合は `docs/` にガイドを作成
4. **設計書の更新**: データモデル変更時は `design/core-entities.md`、アーキテクチャ変更時は `design/architecture.md` を更新
5. **図はMermaidで記述**: フローチャート、ER図、状態遷移図などはMermaid記法を使用
6. **コードから読み取れる情報は書かない**: 実装詳細はコードを参照

## 言語

ドキュメント、コードコメント、およびAIによるチャット応答には日本語を使用すること。

## 作業ディレクトリ（./working）

一時的なファイルや中間データが必要な場合は、プロジェクトルートの `./working` ディレクトリを使用すること。

### 用途

- デバッグ用のコンテキストやデータのダンプ
- 開発中の中間生成物
- 一時的な調査・分析データ
- AIエージェントが開発作業中に生成する一時ファイル

### ルール

- `./working` は `.gitignore` に追加し、リポジトリにコミットしない
- 永続化が必要な成果物は適切なディレクトリ（`design/`, `docs/` 等）に移動する
- 不要になったファイルは適宜削除する

## 開発環境のセットアップ

### 必須ツール

- **Node.js**: v18 以上
- **npm**: パッケージマネージャー
- **AWS CLI**: AWS サービスとの連携
- **Colima**: Docker コンテナランタイム（Docker Desktop の代替）
- **Docker CLI**: コンテナ操作
- **AWS CDK**: インフラストラクチャのデプロイ

### Colima のセットアップ

```bash
# Colima と Docker CLI のインストール
brew install colima docker docker-compose

# Colima の起動（Greengrass 用の推奨設定）
colima start --cpu 4 --memory 8 --disk 50

# Docker が動作しているか確認
docker ps

# Colima の状態確認
colima status
```

### Greengrass 開発環境のセットアップ

```bash
# 1. プロジェクトのクローン
git clone <repository-url>
cd no-eat-to-stop-system

# 2. 依存関係のインストール
npm install

# 3. 環境変数の設定
# .env.local を作成して AWS 認証情報を設定

# 4. Colima の起動（まだの場合）
colima start --cpu 4 --memory 8

# 5. Greengrass Core コンテナの起動
source .env.local
docker run --rm -d \
  --name gg-dev-core \
  -v ~/.aws/credentials:/root/.aws/credentials:ro \
  -v $(pwd)/greengrass:/greengrass/v2 \
  -p 8883:8883 \
  -e AWS_REGION=${AWS_REGION} \
  -e PROVISION=true \
  -e THING_NAME=gg-dev-core \
  -e THING_GROUP_NAME=gg-dev-group \
  amazon/aws-iot-greengrass:latest

# 6. コンテナの状態確認
docker logs gg-dev-core
```

## コード変更時の必須コマンド

**重要**: このプロジェクトではnpmを使用します。

### Colima の管理

```bash
# Colima の起動
colima start

# Colima の停止
colima stop

# Colima の再起動
colima restart

# Colima の状態確認
colima status

# Colima の削除（完全リセット）
colima delete
```

### Docker コンテナの管理

```bash
# Greengrass Core コンテナの起動
docker start gg-dev-core

# Greengrass Core コンテナの停止
docker stop gg-dev-core

# コンテナのログ確認
docker logs -f gg-dev-core

# コンテナ内でコマンド実行
docker exec -it gg-dev-core bash

# コンテナの削除
docker rm -f gg-dev-core
```

## 開発コマンド

### TypeScript ビルド
```bash
# ビルド
npm run build

# ウォッチモード
npm run watch
```

### テスト実行
```bash
# ユニットテスト
npm run test

# E2Eテスト（Playwright）
cd frontend && npm run test:e2e
```

### CDKデプロイ
```bash
# インフラストラクチャのデプロイ
npm run deploy

# フロントエンドのみデプロイ
npm run deploy:frontend

# 全てデプロイ
npm run deploy:all
```

## デバッグ実行方法

### Greengrass コンポーネントのローカルデバッグ

1. **Colima が起動していることを確認**:
   ```bash
   colima status
   # 起動していない場合
   colima start --cpu 4 --memory 8
   ```

2. **Greengrass Core コンテナに接続**:
   ```bash
   docker exec -it gg-dev-core bash
   ```

3. **コンポーネントのローカルデプロイ**:
   ```bash
   # コンテナ内で実行
   /greengrass/v2/bin/greengrass-cli deployment create \
     --recipeDir /greengrass/v2/recipes \
     --artifactDir /greengrass/v2/artifacts \
     --merge "com.example.VideoProcessor=1.0.0"
   ```

4. **ログの確認**:
   ```bash
   # コンテナ内で実行
   tail -f /greengrass/v2/logs/com.example.VideoProcessor.log
   ```

### フロントエンド（Vue.js）ローカル開発

1. **依存関係をインストール**:
   ```bash
   cd frontend
   npm install
   ```

2. **環境変数を設定**:
   ```bash
   # .env.local を作成してAPI URLを設定
   cp .env.example .env.local
   ```

3. **開発サーバーを起動**:
   ```bash
   npm run dev
   ```

### Lambda関数のローカルテスト

Lambda関数は `lib/lambda/` ディレクトリに配置されています。ローカルでテストする場合：

```bash
# TypeScriptをビルド
npm run build

# テストを実行
npm run test
```

## Lambda実装パターン

### ファイル構成の原則

Lambda関数は `lib/lambda/` ディレクトリに配置されています。

```
lib/lambda/
├── edge-processor.ts          # エッジデバイス用ビデオ処理
├── video-processor.ts         # クラウド側ビデオ処理
├── state-manager.ts           # 食事状態管理
├── tv-status.ts              # TV状態取得
└── monitoring.ts             # モニタリング
```

### 実装パターンの詳細

#### 1. Lambda ハンドラー

- AWS Lambdaイベントの受信と応答
- ビジネスロジック関数を呼び出す
- エラーハンドリングとログ出力

#### 2. ビジネスロジック

- コアビジネスロジックの実装（`lib/services/`）
- AWS SDKへの依存を最小化してテスト可能にする
- 入力バリデーションと出力生成

#### 3. リポジトリパターン

- データアクセス層（`lib/repositories/`）
- DynamoDBとの通信を抽象化
- テスト時にモック可能

### ドメインロジックのコーディング指針

#### 処理フローの設計原則

- **直線的で理解しやすい構造**: 関数呼び出し階層は2-3レベルに抑える
- **明確な命名**: 関数・変数名は処理内容を具体的に表現
- **本質的なコードに集中**: 過度なログ、複雑なエラーハンドリング、不要な型変換を避ける

#### ポートとアダプターの原則

- **インターフェースで抽象化**: ドメインロジックを外部依存から分離
- **具体的な実装**: AWS SDKやDynamoDBとの通信は別レイヤーで実装
- **handler.tsの責務**: 依存関係の初期化とドメインロジック呼び出しのみ

```typescript
// ✅ handler.tsの適切な実装
export const handler = async (event: KinesisVideoEvent): Promise<void> => {
  // 依存関係の初期化
  const repository = new MealSessionRepository(dynamodbClient);
  const tvControl = new TVControlService();

  // ドメインロジック呼び出し
  const processor = new VideoProcessor(repository, tvControl);
  await processor.processFrame(event);
};
```

## テスト戦略

### テストカテゴリ

| カテゴリ | 目的                   | 外部依存                    | 実行コマンド                                             |
| -------- | ---------------------- | --------------------------- | -------------------------------------------------------- |
| unit     | ビジネスロジックテスト | なし (すべてモック)         | `npm run test`                                           |
| e2e      | UIフローテスト         | フロントエンド全体          | `cd frontend && npm run test:e2e`                        |

### テスト実行の注意事項

1. **Jestを使用**: ユニットテストはJestで実行
2. **Playwrightを使用**: E2EテストはPlaywrightで実行
3. **モックの活用**: AWS SDKはモックを使用してテスト

## デプロイ

### ローカルからのデプロイ

```bash
# 初回のみ: CDKブートストラップ
npm run cdk bootstrap

# デプロイ実行
npm run deploy

# フロントエンドのみデプロイ
npm run deploy:frontend

# 全てデプロイ
npm run deploy:all
```

**重要**: CDKが自動的にTypeScriptをビルドします。事前のビルドは不要です。

## トラブルシューティング

### よくある問題

| 問題                                         | 解決方法                                 |
| -------------------------------------------- | ---------------------------------------- |
| TypeScriptのビルドエラー                     | `npm run build`                          |
| 型エラーが発生する                           | `npm run build` で型チェック             |
| Lambda実行時にモジュールが見つからない       | CDKスタックと依存関係を確認              |
| ローカルデバッグで環境変数が設定されていない | `.env.local` ファイルを作成              |
| Colima が起動しない                          | `colima delete && colima start`          |
| Docker コマンドが使えない                    | `docker context use colima`              |
| Greengrass コンテナが起動しない              | `docker logs gg-dev-core` でログ確認     |
| コンテナ内でファイルが見つからない           | ボリュームマウントのパスを確認           |

### Colima 関連のトラブルシューティング

#### Docker コマンドが "Cannot connect to the Docker daemon" エラー

```bash
# Docker コンテキストを確認
docker context ls

# Colima コンテキストに切り替え
docker context use colima

# Colima が起動しているか確認
colima status

# 起動していない場合
colima start
```

#### Colima が起動しない

```bash
# ログを確認
colima logs

# 完全に削除して再作成
colima delete
colima start --cpu 4 --memory 8 --disk 50
```

#### ボリュームマウントが機能しない

```bash
# Colima VM に SSH 接続してマウントを確認
colima ssh
ls -la /Users/$(whoami)/

# Mac のホームディレクトリが見えない場合、Colima を再起動
exit
colima restart
```

#### アーキテクチャの不一致エラー

```bash
# 現在のアーキテクチャを確認
colima status | grep Arch

# 実機が x86_64 の場合
colima delete
colima start --arch x86_64 --cpu 4 --memory 8

# 実機が arm64 の場合（Apple Silicon）
colima delete
colima start --arch aarch64 --cpu 4 --memory 8
```

#### Greengrass コンテナが起動しない

```bash
# コンテナのログを確認
docker logs gg-dev-core

# AWS 認証情報を確認
ls -la ~/.aws/credentials

# 環境変数を確認
source .env.local
echo $AWS_REGION

# コンテナを削除して再作成
docker rm -f gg-dev-core
# 起動コマンドを再実行
```

## UIコンポーネント開発規約

### Vue.js コンポーネント開発

新規UIコンポーネントが必要な場合：

1. **Vue 3 Composition APIを使用**
   - `<script setup>` 構文を優先
   - リアクティブな状態管理には `ref` と `reactive` を使用

2. **Tailwind CSSでスタイリング**
   - ユーティリティクラスを使用
   - カスタムCSSは最小限に

3. **アクセシビリティ要件**
   - セマンティックHTML要素を使用
   - キーボード操作対応
   - スクリーンリーダー対応（aria-label等）

## ベストプラクティス

### コード品質

1. **フォーマット**: コミット前に必ず `npm run build` を実行して型チェック
2. **Lint**: 警告を無視せず、すべて修正する
3. **型チェック**: `any` 型の使用を最小限にする
4. **テスト**: 新機能には必ずテストを追加

### 構造化ログ出力規約

Lambda関数では構造化ログを使用すること。

#### TypeScript実装

```typescript
// Lambda Powertools使用例
import { Logger } from '@aws-lambda-powertools/logger';
const logger = new Logger({ serviceName: 'video-processor' });

logger.info('Processing frame', { sessionId, frameNumber });
```

#### 禁止事項

- `console.log`, `console.error`, `console.warn` の直接使用（構造化ログを使用）

#### ログレベルの使い分け

| レベル | 用途                             |
| ------ | -------------------------------- |
| ERROR  | 処理継続不可能、即座に対応が必要 |
| WARN   | リトライで回復可能、一時的な問題 |
| INFO   | 正常な処理の記録                 |
| DEBUG  | デバッグ情報                     |

**重要**: ERRORは処理が失敗し手動介入が必要な場合のみ使用。リトライで回復可能な場合はWARNを使用。





