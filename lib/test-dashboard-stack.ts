import * as cdk from 'aws-cdk-lib';
import {Construct} from 'constructs';
import {Dashboard, TextWidget} from "aws-cdk-lib/aws-cloudwatch";

/**
 * Minimal stack used to exercise the EventBridge restore flow.
 *
 * Deploy:        cdk deploy TestDashboard
 * Evacuate:      use the OnDemandDashboard UI to "Deactivate" "TestDashboard"
 *                (dashboard is moved out of CloudWatch into the S3 archive)
 * Update test:   cdk deploy TestDashboard -c testDashboardLabel=v2
 *                (without restore: CFN update fails because the dashboard is gone)
 * Delete test:   cdk destroy TestDashboard
 *                (the S3 archive should be cleaned up on DELETE_COMPLETE)
 */
export class TestDashboardStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const label = this.node.tryGetContext("testDashboardLabel") ?? "v1"

        new Dashboard(this, 'test-dashboard', {
            dashboardName: "TestDashboard",
            widgets: [
                [
                    new TextWidget({
                        width: 24,
                        height: 4,
                        markdown: [
                            "# TestDashboard",
                            "",
                            `label: **${label}**`,
                            "",
                            "Used to verify the EventBridge restore flow.",
                        ].join("\n"),
                    }),
                ],
            ],
        })
    }
}
