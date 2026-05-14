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
 * Single deployment per AWS account (resources are account-wide).
 * Each role's trust policy restricts assume to a specific GitHub ref so a
 * compromised workflow on one branch cannot deploy to a different stage.
 *
 * Permission model: the deploy roles only allow `sts:AssumeRole` against
 * the CDK bootstrap roles (`cdk-*-deploy-role-*` etc.). All actual
 * provisioning happens under those bootstrap roles, which keeps the
 * least-privilege boundary in `cdk bootstrap` rather than duplicated here.
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

    this.oidcProvider = new iam.OpenIdConnectProvider(this, 'GitHubOidcProvider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
    });

    const cdkBootstrapRoleArns = [
      `arn:aws:iam::${this.account}:role/cdk-*-deploy-role-${this.account}-${this.region}`,
      `arn:aws:iam::${this.account}:role/cdk-*-file-publishing-role-${this.account}-${this.region}`,
      `arn:aws:iam::${this.account}:role/cdk-*-image-publishing-role-${this.account}-${this.region}`,
      `arn:aws:iam::${this.account}:role/cdk-*-lookup-role-${this.account}-${this.region}`,
    ];

    const cdkAssumePolicy = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['sts:AssumeRole'],
          resources: cdkBootstrapRoleArns,
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
          },
          StringLike: {
            'token.actions.githubusercontent.com:sub': `${repoSub}:pull_request`,
          },
        }
      ),
      description: 'Assumed by GitHub Actions pr-validate workflow (read-only cdk diff).',
      inlinePolicies: { CdkLookupOnly: cdkAssumePolicy },
      maxSessionDuration: cdk.Duration.hours(1),
    });

    this.stagingDeployRole = new iam.Role(this, 'GitHubActionsDeployRoleStaging', {
      roleName: 'GitHubActionsDeployRole-staging',
      assumedBy: new iam.WebIdentityPrincipal(
        this.oidcProvider.openIdConnectProviderArn,
        {
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
            'token.actions.githubusercontent.com:sub': `${repoSub}:ref:refs/heads/dev`,
          },
        }
      ),
      description: 'Assumed by GitHub Actions deploy-staging workflow (dev branch only).',
      inlinePolicies: { CdkAssume: cdkAssumePolicy },
      maxSessionDuration: cdk.Duration.hours(1),
    });

    this.productionDeployRole = new iam.Role(this, 'GitHubActionsDeployRoleProduction', {
      roleName: 'GitHubActionsDeployRole-production',
      assumedBy: new iam.WebIdentityPrincipal(
        this.oidcProvider.openIdConnectProviderArn,
        {
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
            'token.actions.githubusercontent.com:sub': `${repoSub}:ref:refs/heads/main`,
          },
        }
      ),
      description: 'Assumed by GitHub Actions deploy-production workflow (main branch only).',
      inlinePolicies: { CdkAssume: cdkAssumePolicy },
      maxSessionDuration: cdk.Duration.hours(1),
    });

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
