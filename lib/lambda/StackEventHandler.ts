import {Logger} from "@aws-lambda-powertools/logger";
import {CloudFormationClient, DescribeStackResourcesCommand} from "@aws-sdk/client-cloudformation";
import {IApiClient} from "./ApiClient";

export type TCfnStackEvent = {
    detail: {
        "stack-id"?: string,
        "status-details"?: {
            status?: string,
        },
    }
}

const DASHBOARD_RESOURCE_TYPE = "AWS::CloudWatch::Dashboard"

const RESTORE_STATUSES = new Set([
    "UPDATE_IN_PROGRESS",
])

const CLEANUP_STATUSES = new Set([
    "DELETE_IN_PROGRESS",
    "DELETE_COMPLETE",
])

export interface ICfnClient {
    listDashboardNames(stackId: string): Promise<string[]>
}

export class CfnClient implements ICfnClient {
    readonly client: CloudFormationClient
    readonly logger: Logger

    constructor(params: { region: string, logger: Logger }) {
        this.client = new CloudFormationClient({region: params.region})
        this.logger = params.logger
    }

    async listDashboardNames(stackId: string): Promise<string[]> {
        const {StackResources} = await this.client.send(new DescribeStackResourcesCommand({
            StackName: stackId,
        }))
        return (StackResources ?? [])
            .filter(r => r.ResourceType === DASHBOARD_RESOURCE_TYPE)
            .map(r => r.PhysicalResourceId)
            .filter((id): id is string => !!id)
    }
}

export class StackEventHandler {
    readonly logger: Logger
    readonly cfn: ICfnClient
    readonly api: IApiClient

    constructor(params: {
        cfn: ICfnClient,
        api: IApiClient,
        logger: Logger,
    }) {
        this.cfn = params.cfn
        this.api = params.api
        this.logger = params.logger
    }

    async handle(event: TCfnStackEvent): Promise<void> {
        const stackId = event.detail?.["stack-id"]
        const status = event.detail?.["status-details"]?.status
        if (!stackId || !status) {
            this.logger.warn("Missing stack-id or status", {event})
            return
        }
        const isRestore = RESTORE_STATUSES.has(status)
        const isCleanup = CLEANUP_STATUSES.has(status)
        if (!isRestore && !isCleanup) {
            return
        }

        const dashboardNames = await this.cfn.listDashboardNames(stackId)
        if (dashboardNames.length === 0) {
            return
        }
        this.logger.info("Processing stack event", {stackId, status, dashboardNames})

        for (const dashboardName of dashboardNames) {
            if (isRestore) {
                // Restore from archive so CFN can update the dashboard.
                // archiveToCloudWatch is a no-op when there is no archive entry.
                await this.api.archiveToCloudWatch(dashboardName)
                this.logger.info("Restored dashboard", {dashboardName, status})
            } else {
                // Force-delete both the CloudWatch dashboard and the S3 archive.
                // We cannot rely on CFN's own deletion because of the race against
                // restore: if a restore happened to win against CFN's deleteDashboard
                // (or against an earlier UPDATE_IN_PROGRESS restore), a dashboard the
                // user intended to delete would otherwise remain.
                await Promise.all([
                    this.api.deleteCloudwatch(dashboardName),
                    this.api.deleteArchive(dashboardName),
                ])
                this.logger.info("Deleted dashboard and archive", {dashboardName, status})
            }
        }
    }
}
