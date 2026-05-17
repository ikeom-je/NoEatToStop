#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { NoEatToStopStack } from '../lib/no-eat-to-stop-stack';
import { FrontendStack } from '../lib/frontend-stack';
import { CicdStack } from '../lib/cicd-stack';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'ap-northeast-1',
};

// CicdStack は OIDC Provider と IAM Role を作成するため、GitHub の org/repo
// を信頼ポリシーに埋め込む必要がある。fork した利用者が自分の repo 名で deploy
// できるよう、`.env.local` の環境変数または `cdk.json` の context から取得する。
// 両方未設定なら CicdStack 自体を skip し stage stack のみ deploy 可能にする
// (CI/CD を使わない利用者向け)。
const githubOrg =
  (app.node.tryGetContext('githubOrg') as string | undefined) ??
  process.env.GITHUB_ORG;
const githubRepo =
  (app.node.tryGetContext('githubRepo') as string | undefined) ??
  process.env.GITHUB_REPO;

if (githubOrg && githubRepo) {
  new CicdStack(app, 'NoEatToStopCicd', {
    env,
    githubOrg,
    githubRepo,
  });
}

const VALID_STAGES = ['staging', 'production'] as const;
type Stage = (typeof VALID_STAGES)[number];

const stageContext = app.node.tryGetContext('stage') as string | undefined;
if (stageContext !== undefined) {
  if (!(VALID_STAGES as readonly string[]).includes(stageContext)) {
    throw new Error(
      `Invalid stage "${stageContext}". Must be one of: ${VALID_STAGES.join(', ')}`,
    );
  }
  const stage = stageContext as Stage;

  const backendStack = new NoEatToStopStack(app, `NoEatToStopStack-${stage}`, {
    env,
    stage,
  });

  new FrontendStack(app, `NoEatToStopFrontend-${stage}`, {
    env,
    stage,
    webAppBucket: backendStack.webAppBucket,
    distribution: backendStack.distribution,
  });
}
