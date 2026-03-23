# Git Workflow and Commit Standards

## Commit Message Format

### Structure

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- **feat**: 新機能の追加
- **fix**: バグ修正
- **docs**: ドキュメントのみの変更
- **style**: コードの意味に影響しない変更（空白、フォーマット、セミコロンなど）
- **refactor**: バグ修正や機能追加を伴わないコード変更
- **perf**: パフォーマンス改善
- **test**: テストの追加や修正
- **chore**: ビルドプロセスやツールの変更

### Subject Rules

- 50文字以内に収める
- 命令形を使用（"add" not "added" or "adds"）
- 文末にピリオドを付けない
- 何を変更したかを明確に記述

### Body Rules

- 72文字で改行
- **なぜ**変更したかを説明（**何を**変更したかはdiffで分かる）
- 変更の動機と以前の実装との違いを記述

### Footer

- Breaking changes: `BREAKING CHANGE:` で始める
- Issue参照: `Closes #123`, `Fixes #456`

### Examples

```
feat(auth): add JWT token refresh mechanism

Implement automatic token refresh to improve user experience.
Previous implementation required manual re-login every hour.

Closes #234
```

```
fix(video): prevent memory leak in S3 presigned URL handler

Lambda was not properly closing S3 client connections, causing
memory accumulation over time. Added explicit cleanup in
finally block.

Fixes #567
```

## Branch Strategy

### Branch Naming Convention

- **feature/**: 新機能開発 `feature/meal-session-tracking`
- **fix/**: バグ修正 `fix/video-stream-timeout`
- **refactor/**: リファクタリング `refactor/lambda-error-handling`
- **docs/**: ドキュメント更新 `docs/update-deployment-guide`
- **test/**: テスト追加 `test/add-e2e-dashboard`

### Main Branches

- **main**: 本番環境にデプロイ可能な状態を常に維持。直接コミットしない
- **dev**: 開発用のマージブランチ。機能ブランチはここからブランチを切り、ここにマージする

### Workflow

1. `dev` ブランチから新しい機能ブランチを作成（例: `feature/meal-session-tracking`）
2. 機能ブランチ上で小さく頻繁にコミット
3. 機能の実装が完了したら、e2eテストを含む全テストがPASSすることを確認
4. テストPASS後、`dev` ブランチにマージ（PRまたは直接マージ）
5. マージ後は速やかに機能ブランチを削除
6. リリース時に `dev` → `main` へマージ

## Commit Hash の記述ルール

### GitHub Issue / PR コメントでの記述

コミットハッシュは **バッククォートで囲まない**（bare hash）。GitHubが自動でコミットリンクに変換する。

```markdown
# ✅ 正しい記述（自動リンクされる）
**コミット**: dd6c705

# ❌ 誤った記述（リンクにならない）
**コミット**: `dd6c705`
```

- 7文字以上の短縮ハッシュまたは40文字フルハッシュを使用
- コード内・ファイル名・コマンド例ではバッククォート使用可（リンク不要な場合）

## Pull Request Guidelines

### PR Title Format

コミットメッセージと同じ形式を使用:
```
feat(component): add new feature
```

### PR Description Template

```markdown
## 変更内容
<!-- 何を変更したか -->

## 変更理由
<!-- なぜこの変更が必要か -->

## 影響範囲
<!-- どのコンポーネント/機能に影響するか -->

## テスト方法
<!-- どのようにテストしたか -->

## スクリーンショット（該当する場合）
<!-- UI変更の場合は画像を添付 -->

## チェックリスト
- [ ] テストが追加/更新されている
- [ ] ドキュメントが更新されている
- [ ] Breaking changeがある場合は明記されている
```

### Review Guidelines

- PRは500行以内を目安に小さく保つ
- 1つのPRで1つの目的に集中
- レビュー依頼前にセルフレビューを実施
- CI/CDが全てパスしていることを確認

## Git Ignore Patterns

### 必ず除外するもの

- **認証情報**: `.env.local`, `.env.credentials`, `*.pem`, `*.key`
- **ビルド成果物**: `dist/`, `build/`, `*.js.map`, `*.d.ts`（ソースから生成されるもの）
- **依存関係**: `node_modules/`, `cdk.out/`, `.turbo/`
- **IDE設定**: `.vscode/`, `.idea/`（チーム共有のものは除く）
- **ログファイル**: `*.log`, `npm-debug.log*`
- **OS固有**: `.DS_Store`, `Thumbs.db`

### 含めるべきもの

- **ロックファイル**: `package-lock.json`
- **CI/CD設定**: `.github/workflows/`
- **Kiro設定**: `.kiro/steering/`, `.kiro/specs/`

## Commit Frequency

### 推奨パターン

- **機能単位**: 1つの完結した機能ごとにコミット
- **テスト追加**: 実装とテストは別コミットでも可
- **リファクタリング**: 機能変更とリファクタリングは分離

### 避けるべきパターン

- 1日の終わりに全変更をまとめてコミット
- "WIP"や"fix"だけのコミットメッセージ
- 無関係な変更を1つのコミットに含める

## Rebase vs Merge

### 基本方針

- **feature → dev**: Squash mergeを推奨（履歴を整理）
- **dev → main**: Mergeを使用（リリース履歴を維持）
- **ローカル作業**: rebaseで履歴を整理してからpush
- **共有ブランチ**: rebaseは避け、mergeを使用

### Rebase使用時の注意

```bash
# ローカルブランチの整理
git rebase -i HEAD~3

# devの最新を取り込む
git fetch origin
git rebase origin/dev
```

## Conflict Resolution

### 競合解決の原則

1. 変更の意図を理解する（両方のコミットメッセージを確認）
2. 両方の変更を活かせないか検討
3. 不明な場合は変更者に確認
4. 解決後は必ずテストを実行

### 競合を避けるために

- 小さく頻繁にpull/merge
- 同じファイルの同時編集を避ける
- 大規模リファクタリングは事前に調整

## Git Hooks

### Pre-commit

```bash
# フォーマットとLintを自動実行
npm run format
npm run lint
```

### Pre-push

```bash
# テストを自動実行
npm run test:unit
```

## Sensitive Data Protection

### 絶対にコミットしてはいけないもの

- AWS認証情報（Access Key, Secret Key）
- データベースパスワード
- APIキー、トークン
- 個人情報（PII）
- 内部URLやエンドポイント

### 誤ってコミットした場合

```bash
# 最新コミットから削除（まだpushしていない場合）
git rm --cached .env.local
git commit --amend

# 履歴から完全削除（pushした場合）
# git-filter-repoやBFG Repo-Cleanerを使用
# 詳細はセキュリティチームに相談
```

## Tag Management

### バージョンタグ

```bash
# セマンティックバージョニング
git tag -a v1.2.3 -m "Release version 1.2.3"
git push origin v1.2.3
```

### タグ命名規則

- **リリース**: `v1.2.3`（セマンティックバージョニング）
- **プレリリース**: `v1.2.3-beta.1`, `v1.2.3-rc.1`
- **環境固有**: `production-2025-02-07`, `staging-2025-02-07`

## Submodule Management

### 使用を避ける

- 可能な限りnpmパッケージやmonorepo構成を使用
- 必要な場合はドキュメントに明記

### 使用する場合

```bash
# 初回クローン時
git clone --recursive <repository>

# 既存リポジトリで
git submodule update --init --recursive
```
