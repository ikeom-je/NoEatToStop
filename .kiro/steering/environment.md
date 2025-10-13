# Environment Style

## Overview

- **Mac上でColimaを使ってGreengrass Coreコンテナを動かし**、ローカル開発したコンポーネントをそのまま実機にデプロイする運用とする。
- **Colima**: Docker Desktop の代替として、Mac 上で軽量な Linux VM を提供し、Docker コンテナを実行できる環境
- 前提条件
  - レシピで `Platform` をちゃんと切る  
  - 実機と開発用Coreが同じOS/archであればよりシンプル（両方Linux+同じarch）  
  - 実機向け用にDockerイメージやバイナリをアーティファクト化しておく  

- Macは純粋にIDE＋ビルド環境として使いながら、**Colima上のGreengrass Coreコンテナ**でのローカル実行→クラウドPublish→実機デプロイ、という一連のループを作る。

## Colima セットアップ

### インストール

```bash
# Homebrewでインストール
brew install colima

# Docker CLIのインストール（まだの場合）
brew install docker docker-compose
```

### Colima の起動

```bash
# デフォルト設定で起動（2 CPU、2GB RAM）
colima start

# カスタム設定で起動（推奨: Greengrass用）
colima start --cpu 4 --memory 8 --disk 50

# アーキテクチャを指定（Apple Silicon の場合）
colima start --arch aarch64 --cpu 4 --memory 8

# x86_64 エミュレーション（実機が x86_64 の場合）
colima start --arch x86_64 --cpu 4 --memory 8
```

### Colima の状態確認

```bash
# Colima の状態確認
colima status

# Docker が動作しているか確認
docker ps

# Colima VM に SSH 接続（デバッグ用）
colima ssh
```

### Colima の停止・削除

```bash
# 停止
colima stop

# 削除（VM を完全に削除）
colima delete

# 再起動
colima restart
```


## 前提条件と動作例

- **Colima上のGreengrass Coreコンテナ**は、あくまで「1台のコアデバイス」として扱われるので、そこで動かすコンポーネントをクラウドに **発行** すれば、他の実機コアデバイスにも同じコンポーネントをデプロイできます。
- コンポーネントのレシピ側で `Platform` を正しく分けておけば（`os: linux`/`darwin`など）、同じコンポーネント名・バージョンで複数プラットフォームに対応。
- 実機側は、公式サポートOS（Linux/Windows等）で Greengrass Core をネイティブに入れておく

## Colima と Docker の違い

| 項目 | Docker Desktop | Colima |
|------|---------------|--------|
| ライセンス | 商用利用は有料 | 完全無料（MIT） |
| リソース使用量 | 重い | 軽量 |
| 起動速度 | 遅い | 高速 |
| CLI | `docker` | `docker`（同じ） |
| Kubernetes | 内蔵 | `colima start --kubernetes` |
| アーキテクチャ | x86_64/arm64 | x86_64/arm64（選択可） |

**重要**: Colima を使用する場合、`docker` コマンドはそのまま使えます。Docker Desktop の代わりに Colima が Docker デーモンを提供します。

# ワークフロー
以下流れで、「開発はColima上のDockerコンテナ、運用は物理デバイス」でシームレスに実機デプロイできるように開発すること

1. Macでコード・レシピを編集（VS Code等）。
2. **Colima を起動**し、Mac上のDockerコンテナに Greengrass Core を入れて「開発用コアデバイス」として動かす。
3. コンテナ内でローカルデプロイを作って動作確認（`greengrass-cli deployment create ...`）。
4. 問題なければ、そのコンポーネントを Greengrass サービス側に Publish してコンポーネント化。
5. 実機のコアデバイス（Raspberry Piなど）を別Thingとして登録し、同じコンポーネントをその実機のデプロイに含める。

## Colima での Greengrass Core コンテナ起動例

```bash
# 1. Colima を起動（まだの場合）
colima start --cpu 4 --memory 8

# 2. Greengrass Core イメージを取得
docker pull amazon/aws-iot-greengrass:latest

# 3. 環境変数を設定（.env.local から読み込み）
source .env.local

# 4. Greengrass Core コンテナを起動
docker run --rm \
  -v ~/.aws/credentials:/root/.aws/credentials:ro \
  -v $(pwd)/greengrass:/greengrass/v2 \
  -p 8883:8883 \
  -e AWS_REGION=${AWS_REGION} \
  -e PROVISION=true \
  -e THING_NAME=gg-dev-core \
  -e THING_GROUP_NAME=gg-dev-group \
  -e TES_ROLE_NAME=GreengrassV2TokenExchangeRole \
  -e TES_ROLE_ALIAS_NAME=GreengrassCoreTokenExchangeRoleAlias \
  -e COMPONENT_DEFAULT_USER=ggc_user:ggc_group \
  amazon/aws-iot-greengrass:latest

# 5. コンテナ内でコンポーネントをデプロイ
docker exec -it <container_id> /greengrass/v2/bin/greengrass-cli deployment create \
  --recipeDir /greengrass/v2/recipes \
  --artifactDir /greengrass/v2/artifacts \
  --merge "com.example.MyComponent=1.0.0"
```

## Colima でのボリュームマウント

Colima は Mac のファイルシステムを自動的にマウントします：

```bash
# Mac のホームディレクトリは自動的にマウントされる
# ~/project -> /Users/username/project (コンテナ内)

# カレントディレクトリをマウント
docker run -v $(pwd):/workspace amazon/aws-iot-greengrass:latest

# 絶対パスでマウント
docker run -v /Users/username/project:/workspace amazon/aws-iot-greengrass:latest
```

## トラブルシューティング

### Colima が起動しない

```bash
# ログを確認
colima logs

# 完全に削除して再作成
colima delete
colima start --cpu 4 --memory 8
```

### Docker コマンドが使えない

```bash
# Docker コンテキストを確認
docker context ls

# Colima コンテキストに切り替え
docker context use colima

# 環境変数を確認
echo $DOCKER_HOST
# 出力例: unix:///Users/username/.colima/default/docker.sock
```

### アーキテクチャの不一致

```bash
# 現在のアーキテクチャを確認
colima status | grep Arch

# 実機が x86_64 の場合、Colima を x86_64 で起動
colima delete
colima start --arch x86_64 --cpu 4 --memory 8

# 実機が arm64 の場合、Colima を arm64 で起動
colima delete
colima start --arch aarch64 --cpu 4 --memory 8
```




## 条件指定

### 1. Platform指定

レシピの `Manifests` で Platformを切り分けるのが重要です。[3]

```yaml
Manifests:
  - Platform:
      os: linux
      architecture: arm
    Lifecycle:
      Run: "python3 -u {artifacts:path}/app.py"
  - Platform:
      os: linux
      architecture: amd64
    Lifecycle:
      Run: "python3 -u {artifacts:path}/app.py"
```

- Docker上のGreengrass（x86_64 Linux）と、実機（例えば armv7 Linux）で同じコンポーネントを動かす場合、こうして manifest を2本持たせる。
- Mac(Darwin)で直接 Core を動かしてテストする場合は、`os: darwin` マニフェストを足します。

### 2. Dockerコンテナをアプリ実行にも使うかどうか

- 「Greengrass CoreをDockerで動かす」パターンと、「コンポーネントとしてさらにDockerコンテナを動かす」パターンは別物なので決める
- 実機でもアプリをDockerとして動かす
  - コンポーネントの `Artifacts` にDockerイメージのtarやECR URIを入れる  
  - `Lifecycle.Install` で `docker load`、`Lifecycle.Run` で `docker run`  
  という形にすれば、開発用Docker Coreでも実機でも同じ挙動にできます。

### 3. 「ローカルデプロイ」と「本番デプロイ」の違い

- **Colima上の開発用Core**では、`greengrass-cli deployment create --recipeDir ...` のような「ローカルデプロイ」で試せます。
- 別のマシン（実機）に持っていくときは、レシピ・アーティファクトをGreengrassサービスにPublishして、コンソール/CLIから通常の「デプロイ」（Deployments）として配布する

## Colima 使用時の注意事項

1. **Docker Desktop との共存**: Docker Desktop がインストールされている場合、Colima と競合する可能性があります。Docker Desktop を停止してから Colima を使用してください。

2. **ポートフォワーディング**: Colima は自動的にポートをフォワードしますが、`-p` オプションで明示的に指定することを推奨します。

3. **ボリュームパフォーマンス**: Mac のファイルシステムをマウントする場合、パフォーマンスが低下する可能性があります。大量のファイル I/O が必要な場合は、コンテナ内のボリュームを使用してください。

4. **リソース制限**: Colima のデフォルト設定（2 CPU、2GB RAM）は Greengrass には不十分です。最低でも 4 CPU、8GB RAM を推奨します。

5. **永続化**: Colima を削除すると、コンテナとボリュームも削除されます。重要なデータは Mac 側にマウントして保存してください。


## 情報源
[1] Deploy AWS IoT Greengrass components to devices https://docs.aws.amazon.com/greengrass/v2/developerguide/manage-deployments.html
[2] Run AWS IoT Greengrass Core software in a Docker container https://docs.aws.amazon.com/greengrass/v2/developerguide/run-greengrass-docker.html
[3] AWS IoT Greengrass component recipe reference https://docs.aws.amazon.com/greengrass/v2/developerguide/component-recipe-reference.html
[4] Greengrass nucleus https://docs.aws.amazon.com/greengrass/v2/developerguide/greengrass-nucleus-component.html
[5] Greengrass feature compatibility https://docs.aws.amazon.com/greengrass/v2/developerguide/operating-system-feature-support-matrix.html
[6] Run AWS IoT Greengrass in a Docker container with automatic ... https://docs.aws.amazon.com/greengrass/v2/developerguide/run-greengrass-docker-automatic-provisioning.html
[7] Test AWS IoT Greengrass components with local deployments https://docs.aws.amazon.com/greengrass/v2/developerguide/test-components.html
[8] deployment - AWS IoT Greengrass https://docs.aws.amazon.com/greengrass/v2/developerguide/gg-cli-deployment.html
[9] Deploying Containers to AWS Greengrass v2 - DevOpStar https://devopstar.com/2023/04/25/deploying-containers-to-aws-greengrass-v2-a-comprehensive-guide
[10] Run a Docker container - AWS IoT Greengrass https://docs.aws.amazon.com/greengrass/v2/developerguide/run-docker-container.html
[11] aws-samples/aws-iot-greengrass-component-gstreamer-frame ... https://github.com/aws-samples/aws-iot-greengrass-component-gstreamer-frame-grabber
[12] 【AWS IoT Greengrass V2】パブリックイメージの Docker コンテナ ... https://dev.classmethod.jp/articles/aws-iot-greengrass-v2-docker-from-public-image-for-component-aws-deploy/
[13] awslabs/aws-greengrass-labs-component-for-home-assistant - GitHub https://github.com/awslabs/aws-greengrass-labs-component-for-home-assistant
[14] GitHub - aws-greengrass/aws-greengrass-docker: Example Dockerfile to run AWS IoT Greengrass in a Docker container https://github.com/aws-greengrass/aws-greengrass-docker
[15] フィジカル AI 時代に向けた、AWS IoT Greengrass における巨大 ... https://aws.amazon.com/jp/builders-flash/202602/iot-greengrass-massive-file-delivery/