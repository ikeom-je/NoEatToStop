import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';

export interface CicdStackProps extends cdk.StackProps {
  /** GitHub org / user that owns the repository (e.g. "ikeom-je"). */
  githubOrg: string;
  /** GitHub repository name (e.g. "NoEatToStop"). */
  githubRepo: string;
}

/**
 * GitHub Actions OIDC provider + per-environment deploy roles.
 *
 * Trust boundary:
 *   - sub      ... 同一リポジトリの特定ブランチ/イベントに限定
 *   - aud      ... sts.amazonaws.com 固定
 *   - job_workflow_ref ... 特定のワークフロー（pr-validate / deploy-staging /
 *     deploy-production）に限定。攻撃者が別ワークフローを足しても assume 不可
 *
 * Permission model:
 *   - validateRole: `cdk-hnb659fds-lookup-role-*` のみ assume 可（read only）
 *   - stagingDeployRole / productionDeployRole: deploy / file / image / lookup
 *     の各 bootstrap ロールを assume 可
 *
 * RemovalPolicy.RETAIN:
 *   - CicdStack を誤って destroy しても IAM Role を残し、ロール ARN を
 *     参照している GH Variables / Secrets が無効にならないようにする
 *   - OIDC Provider 側は L2 が custom resource 構成のため Retain 不可。
 *     再作成は数十秒で済むため許容
 */
export class CicdStack extends cdk.Stack {
  public readonly oidcProvider: iam.OpenIdConnectProvider;
  public readonly validateRole: iam.Role;
  public readonly stagingDeployRole: iam.Role;
  public readonly productionDeployRole: iam.Role;

  constructor(scope: Construct, id: string, props: CicdStackProps) {
    super(scope, id, props);

    const { githubOrg, githubRepo } = props;
    const repoSub = `repo:${githubOrg}/${githubRepo}`;
    const workflowRefBase = `${githubOrg}/${githubRepo}/.github/workflows`;

    this.oidcProvider = new iam.OpenIdConnectProvider(this, 'GitHubOidcProvider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
    });

    const cdkQualifier = 'hnb659fds';
    const deployRoleArns = [
      `arn:aws:iam::${this.account}:role/cdk-${cdkQualifier}-deploy-role-${this.account}-${this.region}`,
      `arn:aws:iam::${this.account}:role/cdk-${cdkQualifier}-file-publishing-role-${this.account}-${this.region}`,
      `arn:aws:iam::${this.account}:role/cdk-${cdkQualifier}-image-publishing-role-${this.account}-${this.region}`,
      `arn:aws:iam::${this.account}:role/cdk-${cdkQualifier}-lookup-role-${this.account}-${this.region}`,
    ];
    const lookupRoleArn = `arn:aws:iam::${this.account}:role/cdk-${cdkQualifier}-lookup-role-${this.account}-${this.region}`;

    const cdkLookupOnlyPolicy = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['sts:AssumeRole'],
          resources: [lookupRoleArn],
        }),
      ],
    });

    const cdkDeployAssumePolicy = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['sts:AssumeRole'],
          resources: deployRoleArns,
        }),
      ],
    });

    this.validateRole = new iam.Role(this, 'GitHubActionsValidateRole', {
      roleName: 'GitHubActionsValidateRole',
      assumedBy: new iam.WebIdentityPrincipal(
        this.oidcProvider.openIdConnectProviderArn,
        {
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
            'token.actions.githubusercontent.com:sub': `${repoSub}:pull_request`,
            'token.actions.githubusercontent.com:job_workflow_ref': [
              `${workflowRefBase}/pr-validate.yml@refs/heads/dev`,
              `${workflowRefBase}/pr-validate.yml@refs/heads/main`,
            ],
          },
        }
      ),
      description: 'Assumed by GitHub Actions pr-validate workflow (read-only cdk diff via lookup-role).',
      inlinePolicies: { CdkLookupOnly: cdkLookupOnlyPolicy },
      maxSessionDuration: cdk.Duration.hours(1),
    });
    this.validateRole.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);

    this.stagingDeployRole = new iam.Role(this, 'GitHubActionsDeployRoleStaging', {
      roleName: 'GitHubActionsDeployRole-staging',
      assumedBy: new iam.WebIdentityPrincipal(
        this.oidcProvider.openIdConnectProviderArn,
        {
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
            'token.actions.githubusercontent.com:sub': `${repoSub}:ref:refs/heads/dev`,
            'token.actions.githubusercontent.com:job_workflow_ref': `${workflowRefBase}/deploy-staging.yml@refs/heads/dev`,
          },
        }
      ),
      description: 'Assumed by GitHub Actions deploy-staging workflow (dev branch only).',
      inlinePolicies: { CdkAssume: cdkDeployAssumePolicy },
      maxSessionDuration: cdk.Duration.hours(1),
    });
    this.stagingDeployRole.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);

    this.productionDeployRole = new iam.Role(this, 'GitHubActionsDeployRoleProduction', {
      roleName: 'GitHubActionsDeployRole-production',
      assumedBy: new iam.WebIdentityPrincipal(
        this.oidcProvider.openIdConnectProviderArn,
        {
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
            'token.actions.githubusercontent.com:sub': `${repoSub}:ref:refs/heads/main`,
            'token.actions.githubusercontent.com:job_workflow_ref': `${workflowRefBase}/deploy-production.yml@refs/heads/main`,
          },
        }
      ),
      description: 'Assumed by GitHub Actions deploy-production workflow (main branch only).',
      inlinePolicies: { CdkAssume: cdkDeployAssumePolicy },
      maxSessionDuration: cdk.Duration.hours(1),
    });
    this.productionDeployRole.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);

    new cdk.CfnOutput(this, 'OidcProviderArn', {
      value: this.oidcProvider.openIdConnectProviderArn,
      exportName: 'NoEatToStopCicd-OidcProviderArn',
    });
    new cdk.CfnOutput(this, 'ValidateRoleArn', {
      value: this.validateRole.roleArn,
      exportName: 'NoEatToStopCicd-ValidateRoleArn',
    });
    new cdk.CfnOutput(this, 'StagingDeployRoleArn', {
      value: this.stagingDeployRole.roleArn,
      exportName: 'NoEatToStopCicd-StagingDeployRoleArn',
    });
    new cdk.CfnOutput(this, 'ProductionDeployRoleArn', {
      value: this.productionDeployRole.roleArn,
      exportName: 'NoEatToStopCicd-ProductionDeployRoleArn',
    });
  }
}
