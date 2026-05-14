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

new CicdStack(app, 'NoEatToStopCicd', {
  env,
  githubOrg: 'ikeom-je',
  githubRepo: 'NoEatToStop',
});

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
