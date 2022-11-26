import {RetentionDays} from "aws-cdk-lib/aws-logs";
import {Schedule} from "aws-cdk-lib/aws-events";

export type TOnDemandDashboardRule = ({
    readonly archive: "Disabled"
} | {
    readonly archive: "Enabled" | "Manual"
    readonly allowActivate: boolean
    readonly allowDeactivate: boolean
    readonly allowDelete: boolean
    readonly ttl?: number
}) & {
    readonly ruleName: string,
    // matcher
    readonly matchAll?: boolean
    readonly matchODD?: boolean
    readonly matchByName?: string[]
}

export type TOnDemandDashboardRules = TOnDemandDashboardRule[]

export type TOnDemandDashboardOptions = {
    readonly rules: TOnDemandDashboardRules
    readonly showAdminDashboard: boolean
    // Undocumented options
    readonly logRetention: RetentionDays,  // Log Retention setting for Lambdas
    readonly jobSchedule: Schedule, // Schedule setting for Lambda
    readonly names: { // Override names
        readonly dashboard?: string
        readonly adminDashboard?: string
        readonly role?: string,
        readonly bucket?: string
        readonly dashboardLambda?: string,
        readonly redirectLambda?: string
    }
    readonly version: string
}
