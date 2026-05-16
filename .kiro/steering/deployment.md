# Deployment Strategy and CI/CD

本ドキュメントは AWS 環境戦略・ブランチデプロイ対応・CI/CD パイプライン方針を集約する。
詳細実装ファイル（GitHub Actions workflow 等）は実装 PR で `.github/workflows/` 配下に作成する。

## ブランチ ↔ AWS 環境マッピング

| ブランチ | 環境 | CDK stage コンテキスト | スタック名サフィックス | 用途 |
|---|---|---|---|---|
| feature ブランチ (`issue/<n>/*`) | ローカル / 検証 | 任意 | （任意・必要時のみ手動デプロイ） | 開発者・AI エージェントの作業ブランチ |
| `dev` | staging | `staging` | `-staging` | 統合テスト・E2E・Edge 連携検証 |
| `main` | production | `production` | `-production` | 本番稼働 |

- 単一 AWS アカウント内で **CDK context (`--context stage=...`) によって stage を切り替える**。アカウント分離は将来検討。
- スタック名・リソース名は `{name}-{stage}` 形式（例: `NoEatToStopStack-staging`, `noeatstop-videos-production-{account}`）。
- CDK 構文: `npx cdk deploy --context stage=staging` / `--context stage=production`

## 既存 `-dev` スタックの扱い

PR #20〜#22 の段階では `-dev` サフィックスのスタックが動作中。CI/CD 切替後の扱いは以下のとおり。

- 既存 `-dev` リソース（DynamoDB データ・S3 オブジェクト・Cognito User Pool など）は**破棄してよい**前提（開発用途のみ）
- CI/CD パイプライン構築 PR で、`-dev` スタックを `destroy` → `-staging` スタックを新規 `deploy` する
- 既存 `-dev` の Cognito ユーザーは `-staging` で再作成（招待し直し）
- 移行作業は別 issue で管理

## CI/CD パイプライン方針（GitHub Actions）

### 認証方式

**GitHub OIDC + IAM Role**（長期アクセスキー不要）

- GitHub Actions 側: `aws-actions/configure-aws-credentials@v4` で OIDC トークンを取得
- AWS 側: OIDC Provider (`token.actions.githubusercontent.com`) + IAM Role（信頼ポリシーで該当リポジトリの該当ブランチからの assume のみ許可）
- IAM Role は環境別に 2 つ:
  - `GitHubActionsDeployRole-staging`（`dev` ブランチからのみ assume 可）
  - `GitHubActionsDeployRole-production`（`main` ブランチからのみ assume 可）
- 各 Role には最小権限の CDK デプロイポリシー（`cdk-readOnly` + `cdk-fullDeploy`）

### ワークフロー構成

| ファイル | トリガー | 内容 |
|---|---|---|
| `.github/workflows/pr-validate.yml` | `pull_request` (opened, synchronize) | `npm ci` + `npm run build` + `npm run test:unit` + `npx cdk diff --context stage=staging`（デプロイなし） |
| `.github/workflows/deploy-staging.yml` | `push` to `dev` | unit test → `cdk deploy --context stage=staging` → frontend ビルド・S3 sync → CloudFront invalidate → Playwright E2E (staging URL) |
| `.github/workflows/deploy-production.yml` | `push` to `main` | unit test → `cdk deploy --context stage=production` → frontend ビルド・S3 sync → CloudFront invalidate → Playwright smoke test |
| `.github/workflows/manual-deploy.yml` | `workflow_dispatch` | 手動デプロイ（環境選択可。緊急時・rollback 用） |

### 環境変数・シークレットの管理

| 種別 | 保管場所 | 例 |
|---|---|---|
| AWS 認証情報 | GitHub Actions OIDC（IAM Role assume） | `AWS_ROLE_ARN` のみ GitHub Variables に格納 |
| AWS リージョン・アカウント ID | GitHub Variables（環境別） | `AWS_REGION`, `AWS_ACCOUNT_ID` |
| 通常の設定値（VITE_COGNITO_DOMAIN など） | CDK デプロイ後の Output → SSM Parameter Store → ビルド時取得 | `/noeatstop/{stage}/cognito/domain` |
| テストユーザー資格情報 (`COGuser`, `COGpw`) | GitHub Secrets（環境別） | E2E job 内でのみ展開 |
| `.env.local` 相当の値 | CI/CD では `.env.local` ファイルを使わず、env で直接注入 | workflow 内で `echo $VITE_... >> $GITHUB_ENV` |

### テスト戦略（ローカルと CI/CD の両方で実行）

| テスト | ローカル実行 | CI/CD 実行タイミング |
|---|---|---|
| ユニットテスト (`npm run test:unit`) | 開発中常時 | PR 時 + デプロイ前 |
| 統合テスト (`npm run test:integ`) | 必要時に手動 | デプロイ後 staging のみ |
| フロント E2E (Playwright) | 開発・デプロイ後 | staging デプロイ後 / production smoke test |
| Edge E2E (`./edge/e2e-test.sh`) | RPi 上で手動 | CI/CD では実行不可（RPi 必須）。手動 trigger で結果を記録 |

ローカルでも CI/CD と同じテストを必ず実行できるよう、`.github/workflows/*.yml` で使う npm scripts はすべて `package.json` の公開コマンドとして提供する（隠しコマンド禁止）。

## デプロイトリガー（要約）

```
feature ブランチ
    ↓ PR を dev に向けて作成
PR open / sync
    ↓ pr-validate.yml（build + unit test + cdk diff）
PR レビュー & merge to dev
    ↓ deploy-staging.yml（自動）
staging 環境（dev ブランチの内容）
    ↓ 検証・受け入れテスト
dev → main の PR を作成
    ↓ pr-validate.yml + 手動レビュー
PR merge to main
    ↓ deploy-production.yml（自動）
production 環境
```

`main` への直接 push は GitHub branch protection で禁止する（PR 経由のみ）。

## 手動デプロイ（緊急時・ローカル検証）

`source .env.local` で stage を指定してから:

```bash
# staging 相当を手元から
npx cdk deploy --context stage=staging --all

# production 相当を手元から（要 IAM 権限）
npx cdk deploy --context stage=production --all
```

ローカルでの直接 production デプロイは禁止しないが、原則 CI/CD 経由とする。

## Rollback / 復旧

- CFN スタックの自動ロールバック（デプロイ失敗時）に依存
- データ層（DynamoDB / S3）は `RemovalPolicy.RETAIN`（既設）で保護
- アプリ層のロールバックは「前回成功した main commit を revert PR → merge」で実施
- 緊急時は `manual-deploy.yml` で過去 commit ref を指定して再デプロイ

## モニタリング

- CI/CD ジョブ結果: GitHub Actions UI + Slack 通知（後日設定）
- AWS リソース監視: CloudWatch（既設 Dashboards / Alarms）
- staging E2E 失敗時は production への自動デプロイをブロック（main への自動 merge は本リポジトリでは行わないため、間接的に防止）

## 関連ドキュメント

- @.kiro/steering/development.md 環境変数と `.env.local` 管理、デプロイコマンド
- @.kiro/steering/security.md IAM 最小権限、機密情報の取り扱い
- @.kiro/steering/git.md ブランチ運用・PR フロー
- @.kiro/steering/structure.md スタック構成・命名規則
