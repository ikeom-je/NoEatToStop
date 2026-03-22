#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { NoEatToStopStack } from '../lib/no-eat-to-stop-stack';
import { FrontendStack } from '../lib/frontend-stack';

const app = new cdk.App();

const stage = app.node.tryGetContext('stage') || 'dev';
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'ap-northeast-1',
};

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
