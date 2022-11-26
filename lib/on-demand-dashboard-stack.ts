import * as cdk from 'aws-cdk-lib';
import {Duration, RemovalPolicy} from 'aws-cdk-lib';
import {Construct} from 'constructs';
import {BlockPublicAccess, Bucket, BucketAccessControl} from "aws-cdk-lib/aws-s3";
import {CustomWidget, Dashboard, LogQueryWidget, TextWidget} from "aws-cdk-lib/aws-cloudwatch";
import {ManagedPolicy, PolicyDocument, PolicyStatement, Role, ServicePrincipal} from "aws-cdk-lib/aws-iam";
import {LogGroup, RetentionDays} from "aws-cdk-lib/aws-logs";
import {NodejsFunction} from "aws-cdk-lib/aws-lambda-nodejs";
import {FunctionUrlAuthType, Runtime} from "aws-cdk-lib/aws-lambda";
import {Rule, RuleTargetInput, Schedule} from "aws-cdk-lib/aws-events";
import {LambdaFunction} from "aws-cdk-lib/aws-events-targets";
import {FunctionUrl} from "aws-cdk-lib/aws-lambda/lib/function-url";
import {merge} from 'lodash'
import {RedirectLambdaEnv} from "./lambda/lambda-redirect";
import {DashboardLambdaEnv} from "./lambda/lambda-dashboard";
import {TOnDemandDashboardOptions} from "./lambda/types";
import {DashboardManager, TAction} from "./lambda/DashboardManager";

export class OnDemandDashboardStack extends cdk.Stack {
    readonly options: TOnDemandDashboardOptions

    static defaultOptions: TOnDemandDashboardOptions = {
        rules: [],
        showAdminDashboard: true,
        logRetention: RetentionDays.ONE_MONTH,
        jobSchedule: Schedule.rate(Duration.hours(1)),
        names: {
            dashboard: "OnDemandDashboard",
            adminDashboard: "OnDemandDashboardAdmin",
            role: undefined,
            bucket: undefined,
        },
        version: process.env.npm_package_version ? `v${process.env.npm_package_version}` : ""
    }

    constructor(scope: Construct, id: string, props: cdk.StackProps & {
        options: Partial<TOnDemandDashboardOptions>
    }) {
        super(scope, id, props);
        this.options = merge(OnDemandDashboardStack.defaultOptions, props.options)

        const bucket = new Bucket(this, 'bucket', {
            bucketName: this.options.names.bucket,
            versioned: false,
            accessControl: BucketAccessControl.PRIVATE,
            blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
            lifecycleRules: [],
            removalPolicy: RemovalPolicy.DESTROY,
            autoDeleteObjects: false, // If you disable Dynamic Dashboard for all dashboards, bucket will be empty
        })

        const role = new Role(this, 'role', {
            roleName: this.options.names.role,
            assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
            managedPolicies: [
                ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"),
            ],
            inlinePolicies: {
                dashboard: new PolicyDocument({
                    statements: [new PolicyStatement({
                        actions: [
                            "cloudwatch:GetDashboard",
                            "cloudwatch:ListDashboards",
                            "cloudwatch:PutDashboard",
                            "cloudwatch:DeleteDashboards",
                        ],
                        resources: [
                            "*"
                        ]
                    })]
                }),
                s3: new PolicyDocument({
                    statements: [
                        new PolicyStatement({
                            actions: [
                                "s3:ListBucket",
                                "s3:ListBucketVersions",
                            ],
                            resources: [
                                bucket.bucketArn
                            ]
                        }),
                        new PolicyStatement({
                            actions: [
                                "s3:GetObject*",
                                "s3:PutObject*",
                                "s3:DeleteObject*",
                            ],
                            resources: [
                                bucket.bucketArn + "/*"
                            ]
                        }),
                    ]
                })
            }
        })


        const {fn: redirectFn, logGroup: redirectLogGroup, functionUrl: redirectUrl} = this.createRedirectEndpoint({
            bucket,
            role,
        })

        const {fn: dashboardFn, logGroup: dashboardLogGroup} = this.createDynamicDashboard({
            bucket,
            role,
            redirectUrl,
        })


        const dashboard = new Dashboard(this, 'dashboard', {
            dashboardName: this.options.names.dashboard!,
            widgets: [
                [
                    new CustomWidget({
                        title: `on-demand-dashboard ${this.options.version}`,
                        updateOnRefresh: true,
                        updateOnResize: false,
                        updateOnTimeRangeChange: false,
                        width: 24,
                        height: 20,
                        functionArn: dashboardFn.functionArn,
                    })
                ],
            ]
        })

        if (this.options.showAdminDashboard) {
            new Dashboard(this, 'debug-dashboard', {
                dashboardName: this.options.names.adminDashboard!,
                widgets: [
                    [
                        new TextWidget({
                            width: 24,
                            height: 15,
                            markdown: (() => {
                                const lines: string[] = []

                                // Add Config Table
                                lines.push(
                                    "# Config",
                                    "Name|Value",
                                    "----|-----",
                                    `version|${this.options.version}`,
                                    `dashboard|${dashboard.dashboardName}`,
                                    `bucket|${bucket.bucketName}`,
                                    `role|${role.roleName}`,
                                    `dashboard lambda|${dashboardFn.functionName}`,
                                    `redirect lambda|${redirectFn.functionName}`,
                                )

                                lines.push("")

                                // Add Rules Table
                                const keys = ["ruleName", "matchAll", "matchODD", "matchByName", "archive", "ttl", "allowActivate", "allowDeactivate", "allowDelete"]
                                const headers = ["Priority", ...keys]
                                lines.push(
                                    "# Rules",
                                    headers.join("|"),
                                    headers.map(() => "-----").join("|"),
                                    ...this.options.rules.concat([DashboardManager.builtInRule]).map((r, i) => {
                                        const rObj = (r as any) as { [key: string]: string | string[] | boolean | number }
                                        const items: string[] = [`${i + 1}`]
                                        for (const key of keys) {
                                            items.push(((): string => {
                                                const j = rObj[key]
                                                if (j === undefined) {
                                                    return "-"
                                                }
                                                if (key === 'ttl') {
                                                    return Duration.millis(j as number).toHumanString()
                                                }
                                                if (Array.isArray(j)) {
                                                    return j.join(", ") // Help table resize by appending space after ,
                                                } else {
                                                    return `${j}`
                                                }
                                            })())
                                        }
                                        return items.join("|")
                                    })
                                )
                                return lines.join("\n")
                            })()
                        }),
                    ],
                    [
                        new LogQueryWidget({
                            title: "Lambda Log",
                            width: 24,
                            height: 40,
                            queryLines: [
                                "fields @timestamp,service,level,message,concat(action.dashboardName,body) as dashboard, action.type as action",
                                "filter not isblank(service)",
                                "sort @timestamp desc",
                                "limit 100"
                            ],
                            logGroupNames: [
                                dashboardLogGroup.logGroupName,
                                redirectLogGroup.logGroupName,
                            ]
                        }),
                    ]
                ],
            })
        }
    }

    createRedirectEndpoint(params: {
        readonly  bucket: Bucket,
        readonly  role: Role,
    }): {
        fn: NodejsFunction,
        logGroup: LogGroup,
        functionUrl: FunctionUrl
    } {
        const {role, bucket} = params

        function subId(s: string): string {
            return `redirect-${s}`
        }

        const environment: RedirectLambdaEnv = {
            LOG_LEVEL: "DEBUG",
            RULES: JSON.stringify(this.options.rules),
            BUCKET_NAME: bucket.bucketName,
            ON_DEMAND_DASHBOARD_NAME: this.options.names.dashboard!,
        }

        const fn = new NodejsFunction(this, subId('fn'), {
            functionName: this.options.names.redirectLambda,
            runtime: Runtime.NODEJS_16_X,
            entry: "lib/lambda/lambda-redirect.ts",
            awsSdkConnectionReuse: true,
            timeout: Duration.minutes(1),
            environment,
            role,
        })

        const logGroup = new LogGroup(this, subId('log-group'), {
            logGroupName: `/aws/lambda/${fn.functionName}`,
            removalPolicy: RemovalPolicy.DESTROY,
            retention: this.options.logRetention,
        })

        const functionUrl = fn.addFunctionUrl({
            authType: FunctionUrlAuthType.NONE,
        })

        return {fn, logGroup, functionUrl}
    }

    createDynamicDashboard(params: {
        readonly bucket: Bucket,
        readonly role: Role,
        readonly redirectUrl: FunctionUrl
    }): {
        fn: NodejsFunction,
        logGroup: LogGroup,
    } {
        const {role, bucket, redirectUrl} = params

        function subId(s: string): string {
            return `dashboard-${s}`
        }

        const environment: DashboardLambdaEnv = {
            LOG_LEVEL: "DEBUG",
            RULES: JSON.stringify(this.options.rules),
            BUCKET_NAME: bucket.bucketName,
            REDIRECT_URL: redirectUrl.url,
            ON_DEMAND_DASHBOARD_NAME: this.options.names.dashboard!
        }

        const fn = new NodejsFunction(this, subId('fn'), {
            functionName: this.options.names.dashboardLambda,
            description: `On Demand Link : ${redirectUrl.url}/${this.options.names.dashboard!}`,
            entry: "lib/lambda/lambda-dashboard.ts",
            runtime: Runtime.NODEJS_16_X,
            awsSdkConnectionReuse: true,
            timeout: Duration.minutes(1),
            environment,
            role,
        })

        const logGroup = new LogGroup(this, subId('log-group'), {
            logGroupName: `/aws/lambda/${fn.functionName}`,
            removalPolicy: RemovalPolicy.DESTROY,
            retention: this.options.logRetention,
        })

        const scheduledJobAction: TAction = {
            type: "ScheduledJob",
        }
        new Rule(this, subId("rule"), {
            targets: [new LambdaFunction(fn, {
                event: RuleTargetInput.fromObject({action: scheduledJobAction})
            })],
            schedule: this.options.jobSchedule
        })

        return {fn, logGroup}
    }

}
