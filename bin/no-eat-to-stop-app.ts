#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { NoEatToStopStack } from '../lib/no-eat-to-stop-stack';

const app = new cdk.App();

const stage = app.node.tryGetContext('stage') || 'dev';

new NoEatToStopStack(app, `NoEatToStopStack-${stage}`, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'ap-northeast-1',
  },
  stage,
});
