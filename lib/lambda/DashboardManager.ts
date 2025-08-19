import {Logger} from "@aws-lambda-powertools/logger";
import {ApiClient, IApiClient, TDashboardEntry} from "./ApiClient";
import {TOnDemandDashboardRule} from "./types";
import {matchRule} from "./utils";

export type TArchiveState = "Disabled" | "Enabled"

export type TState = "Disabled" | "Active" | "Inactive" | "Deleted"

export type TAction = {
    type: "Enable" | "Disable" | "Deactivate" | "Activate" | "Delete",
    dashboardName: string,
} | {
    type: "ScheduledJob",
}

export type TDashboardState = {
    dashboardName: string
    archiveState: TArchiveState,
    state: TState,
    matchedRuleName: string,
    isForcedEnabled: boolean,
    isForcedDisabled: boolean,
    canEnable: boolean,
    canDisable: boolean,
    canDelete: boolean,
    canActivate: boolean,
    canDeactivate: boolean,
    updatedAt?: Date,
    deactivateAt?: Date,
}

export class DashboardManager {

    static builtInRule: TOnDemandDashboardRule = {
        ruleName: "Builtin",
        archive: "Disabled",
        matchAll: true
    }

    readonly logger: Logger
    readonly client: IApiClient
    readonly rules: TOnDemandDashboardRule[]
    readonly onDemandDashboardName?: string

    constructor(params: {
        readonly rules?: TOnDemandDashboardRule[]
        readonly region: string,
        readonly bucketName: string,
        readonly onDemandDashboardName?: string
        readonly client?: IApiClient,
        readonly logger: Logger,
    }) {
        this.rules = params.rules ?? []
        this.onDemandDashboardName = params.onDemandDashboardName
        this.logger = params.logger
        this.client = params.client ?? new ApiClient({
            region: params.region,
            bucketName: params.bucketName,
            logger: params.logger,
        })
    }

    async getInfo(): Promise<TDashboardState[]> {
        const result: TDashboardState[] = []
        const [dashboards, archives] = await Promise.all([
            await this.client.loadEntriesFromCloudWatch(),
            await this.client.loadEntriesFromArchive(),
        ])
        const dashboardNames = new Set<string>()
        dashboards.forEach(i => dashboardNames.add(i.dashboardName))
        archives.forEach(i => dashboardNames.add(i.dashboardName))
        for (const dashboardName of dashboardNames.keys()) {
            let rule = matchRule({
                rules: this.rules,
                defaultRule: DashboardManager.builtInRule,
                dashboardName,
                onDemandDashboardName: this.onDemandDashboardName!,
            })
            const dashboard = dashboards.find(i => i.dashboardName === dashboardName)
            const archive = archives.find(i => i.dashboardName === dashboardName)
            const hasDashboard = dashboard !== undefined
            const hasArchive = archive !== undefined
            const state = hasArchive ? (hasDashboard ? "Active" : "Inactive") : "Disabled"
            const archiveState = hasArchive ? "Enabled" : "Disabled"
            const isForcedEnabled = rule.archive === "Enabled"
            const isForcedDisabled = rule.archive === "Disabled"

            let canEnable: boolean
            let canDisable: boolean
            let canDelete: boolean
            let canActivate: boolean
            let canDeactivate: boolean

            if (rule.archive === "Disabled") {
                canEnable = false
                canDisable = false
                canDelete = false
                canActivate = false
                canDeactivate = false
            } else {
                canEnable = hasDashboard && !hasArchive && !isForcedEnabled
                canDisable = hasDashboard && hasArchive && !isForcedEnabled
                canDelete = !hasDashboard && hasArchive && rule.allowDelete
                canActivate = hasArchive && !hasDashboard && rule.allowActivate
                canDeactivate = hasArchive && hasDashboard && rule.allowDeactivate
            }

            result.push({
                matchedRuleName: rule.ruleName,
                dashboardName,
                updatedAt: updatedAt({dashboard, archive}),
                deactivateAt: deactivateAt({
                    dashboard,
                    archive,
                    ttl: rule.archive === "Disabled" ? undefined : rule.ttl
                }),
                state,
                archiveState,
                isForcedEnabled,
                isForcedDisabled,
                canEnable,
                canDisable,
                canDelete,
                canActivate,
                canDeactivate,
            })
        }
        return result.sort((a, b) => a.dashboardName.localeCompare(b.dashboardName, [], {
            numeric: true
        }))
    }

    async getStableInfo(): Promise<TDashboardState[]> {
        const info = await this.getInfo()
        if (!await this.applyRules(info)) {
            return info
        }
        // Reload
        return await this.getInfo()
    }

    async applyRules(info: TDashboardState[]): Promise<boolean> {
        if (info.length === 0) {
            return false
        }
        const now = new Date()
        const updated = (await Promise.all(info.map(async (d) => {
            if (d.isForcedEnabled && d.state === "Disabled") {
                await this.action({
                    type: "Enable",
                    dashboardName: d.dashboardName,
                })
                return true
            } else if (d.isForcedDisabled && d.state !== "Disabled") {
                await this.action({
                    type: "Disable",
                    dashboardName: d.dashboardName,
                })
                return true
            } else if (d.deactivateAt && (d.deactivateAt < now)) {
                await this.action({
                    type: "Deactivate",
                    dashboardName: d.dashboardName,
                })
                return true
            }
            return false
        }))).some(i => i)
        if (updated) {
            this.logger.info(`Applied rule`)
        }
        return updated
    }

    async action(action: TAction) {
        this.logger.info("Execute Action", {
            action,
        })
        switch (action.type) {
            case "Enable": {
                await this.client.cloudWatchToArchive(action.dashboardName)
                return
            }
            case "Disable": {
                await this.client.archiveToCloudWatch(action.dashboardName)
                await this.client.deleteArchive(action.dashboardName)
                return
            }
            case "Deactivate": {
                await this.client.cloudWatchToArchive(action.dashboardName)
                await this.client.deleteCloudwatch(action.dashboardName)
                return
            }
            case "Activate": {
                await this.client.archiveToCloudWatch(action.dashboardName)
                return
            }
            case "Delete": {
                await this.client.deleteArchive(action.dashboardName)
                return
            }
            case "ScheduledJob":
                await this.applyRules(await this.getInfo())
                return
        }
    }
}

function updatedAt(
    {
        dashboard,
        archive
    }: {
        dashboard?: TDashboardEntry,
        archive?: TDashboardEntry
    }): Date | undefined {
    if (dashboard === undefined || archive === undefined) {
        return undefined
    }
    const ts = Math.max(dashboard.lastModified.getTime(), archive.lastModified.getTime())
    return new Date(ts)
}

function deactivateAt(
    {
        dashboard,
        archive,
        ttl,
    }: {
        dashboard?: TDashboardEntry,
        archive?: TDashboardEntry,
        ttl?: number
    }): Date | undefined {
    if (ttl === undefined) {
        return undefined
    }
    const ts = updatedAt({dashboard, archive})?.getTime()
    if (ts === undefined) {
        return undefined
    }
    return new Date(ts + ttl)
}