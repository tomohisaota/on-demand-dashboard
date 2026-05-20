import {Logger} from "@aws-lambda-powertools/logger";
import {ICfnClient, StackEventHandler, TCfnStackEvent} from "../lib/lambda/StackEventHandler";
import {IApiClient, TDashboardEntry} from "../lib/lambda/ApiClient";

class FakeCfnClient implements ICfnClient {
    constructor(readonly mapping: { [stackId: string]: string[] }) {
    }

    async listDashboardNames(stackId: string): Promise<string[]> {
        return this.mapping[stackId] ?? []
    }
}

class FakeApiClient implements IApiClient {
    readonly restored: string[] = []
    readonly deletedArchives: string[] = []
    readonly deletedDashboards: string[] = []

    async archiveToCloudWatch(dashboardName: string): Promise<void> {
        this.restored.push(dashboardName)
    }

    async deleteArchive(dashboardName: string): Promise<void> {
        this.deletedArchives.push(dashboardName)
    }

    async deleteCloudwatch(dashboardName: string): Promise<void> {
        this.deletedDashboards.push(dashboardName)
    }

    async cloudWatchToArchive(): Promise<void> {
    }

    async loadEntriesFromArchive(): Promise<TDashboardEntry[]> {
        return []
    }

    async loadEntriesFromCloudWatch(): Promise<TDashboardEntry[]> {
        return []
    }
}

function newHandler(mapping: { [stackId: string]: string[] }) {
    const cfn = new FakeCfnClient(mapping)
    const api = new FakeApiClient()
    const logger = new Logger({serviceName: 'test'})
    const handler = new StackEventHandler({cfn, api, logger})
    return {cfn, api, handler}
}

function newEvent(stackId: string, status: string): TCfnStackEvent {
    return {
        detail: {
            "stack-id": stackId,
            "status-details": {status},
        }
    }
}

const stackId = "arn:aws:cloudformation:us-east-1:111111111111:stack/my-stack/abc"

test('UPDATE_IN_PROGRESS restores each dashboard belonging to the stack', async () => {
    const {api, handler} = newHandler({[stackId]: ["DashA", "DashB"]})
    await handler.handle(newEvent(stackId, "UPDATE_IN_PROGRESS"))
    expect(api.restored).toEqual(["DashA", "DashB"])
    expect(api.deletedArchives).toEqual([])
    expect(api.deletedDashboards).toEqual([])
})

test('DELETE_IN_PROGRESS force-deletes each dashboard and its archive', async () => {
    const {api, handler} = newHandler({[stackId]: ["DashA"]})
    await handler.handle(newEvent(stackId, "DELETE_IN_PROGRESS"))
    expect(api.restored).toEqual([])
    expect(api.deletedDashboards).toEqual(["DashA"])
    expect(api.deletedArchives).toEqual(["DashA"])
})

test('DELETE_COMPLETE force-deletes each dashboard and its archive', async () => {
    const {api, handler} = newHandler({[stackId]: ["DashA", "DashB"]})
    await handler.handle(newEvent(stackId, "DELETE_COMPLETE"))
    expect(api.restored).toEqual([])
    expect(api.deletedDashboards).toEqual(["DashA", "DashB"])
    expect(api.deletedArchives).toEqual(["DashA", "DashB"])
})

test('Other statuses are ignored', async () => {
    const {api, handler} = newHandler({[stackId]: ["DashA"]})
    await handler.handle(newEvent(stackId, "CREATE_COMPLETE"))
    await handler.handle(newEvent(stackId, "UPDATE_COMPLETE"))
    await handler.handle(newEvent(stackId, "ROLLBACK_IN_PROGRESS"))
    expect(api.restored).toEqual([])
    expect(api.deletedArchives).toEqual([])
    expect(api.deletedDashboards).toEqual([])
})

test('No dashboards in stack is a no-op', async () => {
    const {api, handler} = newHandler({[stackId]: []})
    await handler.handle(newEvent(stackId, "UPDATE_IN_PROGRESS"))
    expect(api.restored).toEqual([])
    expect(api.deletedArchives).toEqual([])
    expect(api.deletedDashboards).toEqual([])
})

test('Missing stack-id is a no-op', async () => {
    const {api, handler} = newHandler({})
    await handler.handle({detail: {"status-details": {status: "UPDATE_IN_PROGRESS"}}})
    expect(api.restored).toEqual([])
    expect(api.deletedArchives).toEqual([])
    expect(api.deletedDashboards).toEqual([])
})

test('Missing status is a no-op', async () => {
    const {api, handler} = newHandler({[stackId]: ["DashA"]})
    await handler.handle({detail: {"stack-id": stackId}})
    expect(api.restored).toEqual([])
    expect(api.deletedArchives).toEqual([])
    expect(api.deletedDashboards).toEqual([])
})
