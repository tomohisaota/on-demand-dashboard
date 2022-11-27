import {
    CloudWatchClient,
    DeleteDashboardsCommand,
    GetDashboardCommand,
    paginateListDashboards, PutDashboardCommand
} from "@aws-sdk/client-cloudwatch";
import {
    DeleteObjectsCommand, GetObjectCommand,
    ListObjectVersionsCommand,
    paginateListObjectsV2,
    PutObjectCommand,
    S3Client
} from "@aws-sdk/client-s3";
import {isErrorWithName} from "./utils";

export type TDashboardEntry = {
    dashboardName: string
    lastModified: Date
    size: number
}

export interface IApiClient {
    loadEntriesFromCloudWatch(): Promise<TDashboardEntry[]>

    loadEntriesFromArchive(): Promise<TDashboardEntry[]>

    archiveToCloudWatch(dashboardName: string): Promise<void>

    cloudWatchToArchive(dashboardName: string): Promise<void>

    deleteCloudwatch(dashboardName: string): Promise<void>

    deleteArchive(dashboardName: string): Promise<void>
}

export class ApiClient implements IApiClient {

    readonly bucketName: string

    readonly cloudWatch: CloudWatchClient
    readonly s3: S3Client

    constructor(params: {
        region: string,
        bucketName: string
    }) {
        const {region} = params
        this.cloudWatch = new CloudWatchClient({region})
        this.s3 = new S3Client({region})
        this.bucketName = params.bucketName
    }

    async loadEntriesFromCloudWatch(): Promise<TDashboardEntry[]> {
        let items: TDashboardEntry[] = []
        for await (const {DashboardEntries: entries} of paginateListDashboards({
            client: this.cloudWatch,
        }, {})) {
            if (!entries) {
                continue
            }
            items = items.concat(entries.map(i => ({
                dashboardName: i.DashboardName!,
                lastModified: i.LastModified!,
                size: i.Size!
            })))
        }
        return items
    }

    async loadEntriesFromArchive(): Promise<TDashboardEntry[]> {
        let items: TDashboardEntry[] = []
        for await (const {Contents: entries} of paginateListObjectsV2({
            client: this.s3,
        }, {
            Bucket: this.bucketName,
        })) {
            if (!entries) {
                continue
            }
            items = items.concat(entries.map(i => ({
                dashboardName: i.Key!.split("/")[0],
                lastModified: i.LastModified!,
                size: i.Size!,
            })))
        }
        return items
    }

    async cloudWatchToArchive(dashboardName: string) {
        const dashboardBody = await this.loadDashboardBody(dashboardName)
        if (dashboardBody) {
            await this.saveArchiveBody(dashboardName, dashboardBody)
        }
    }

    async deleteArchive(dashboardName: string) {
        const {s3, bucketName} = this
        const {Versions} = await s3.send(new ListObjectVersionsCommand({
            Bucket: bucketName,
            Prefix: dashboardName + "/"
        }))
        if (Versions) {
            await s3.send(new DeleteObjectsCommand({
                Bucket: bucketName,
                Delete: {
                    Objects: Versions.map(i => ({
                        Key: i.Key!,
                        VersionId: i.VersionId!
                    }))
                }
            }))
        }
    }

    async deleteCloudwatch(dashboardName: string) {
        const {cloudWatch} = this
        await cloudWatch.send(new DeleteDashboardsCommand({
            DashboardNames: [
                dashboardName
            ]
        }))
    }

    async archiveToCloudWatch(dashboardName: string) {
        const {dashboard, archive} = await this.loadBothBody(dashboardName)
        if (dashboard) {
            if (archive) {
                await this.saveArchiveBody(dashboardName, dashboard)
            }
        } else {
            if (archive) {
                await this.saveDashboardBody(dashboardName, archive)
            }
        }
    }

    async loadBothBody(dashboardName: string): Promise<{
        dashboard?: string
        archive?: string
    }> {
        const [dashboard, archive] = await Promise.all([
            this.loadDashboardBody(dashboardName),
            this.loadArchiveBody(dashboardName)
        ])
        return {dashboard, archive}
    }

    async loadDashboardBody(dashboardName: string): Promise<string | undefined> {
        try {
            const {cloudWatch} = this
            const {DashboardBody} = await cloudWatch.send(new GetDashboardCommand({
                DashboardName: dashboardName
            }))
            return DashboardBody
        } catch (e) {
            if (isErrorWithName(e)) {
                if (e.name === 'DashboardNotFoundError') {
                    return undefined
                }
            }
            throw e
        }
    }

    async saveDashboardBody(dashboardName: string, dashboardBody: string): Promise<void> {
        const {cloudWatch} = this
        await cloudWatch.send(new PutDashboardCommand({
            DashboardName: dashboardName,
            DashboardBody: dashboardBody,
        }))
    }

    async loadArchiveBody(dashboardName: string): Promise<string | undefined> {
        try {
            const {s3, bucketName} = this
            const {Body,} = await s3.send(new GetObjectCommand({
                Bucket: bucketName,
                Key: toS3Key(dashboardName)
            }))
            if (!Body) {
                return undefined
            }
            return Body.transformToString()
        } catch (e) {
            if (isErrorWithName(e)) {
                if (e.name === 'NoSuchKey') {
                    return undefined
                }
            }
            throw e
        }
    }

    async saveArchiveBody(dashboardName: string, dashboardBody: string): Promise<void> {
        const {s3} = this
        await s3.send(new PutObjectCommand({
            Bucket: this.bucketName,
            Key: toS3Key(dashboardName),
            Body: dashboardBody,
            ContentType: "application/json"
        }))
    }
}

function toS3Key(dashboardName: string): string {
    return `${dashboardName}/DashboardBody.json`
}