import {injectLambdaContext, Logger} from '@aws-lambda-powertools/logger'
import middy from '@middy/core'
import {ALBResult, Context} from 'aws-lambda'
import {DashboardManager} from "./DashboardManager"

export type RedirectLambdaEnv = {
    LOG_LEVEL: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR',
    RULES: string
    BUCKET_NAME: string,
    ON_DEMAND_DASHBOARD_NAME: string
}

const env = process.env as RedirectLambdaEnv & {
    AWS_REGION: string
}

const logger = new Logger({
    logLevel: env.LOG_LEVEL,
    serviceName: 'redirect',
});

const m = new DashboardManager({
    rules: JSON.parse(env.RULES),
    bucketName: env.BUCKET_NAME,
    onDemandDashboardName: env.ON_DEMAND_DASHBOARD_NAME,
    region: env.AWS_REGION,
    logger,
})

export async function lambdaHandler(event: {
    requestContext?: {
        http?: {
            path?: string
            method?: string
        }
    }
}, context: Context): Promise<ALBResult> {
    logger.setPersistentLogAttributes({
        event,
        context,
    })
    const httpMethod = event.requestContext?.http?.method
    const dashboardName = parseDashboardName(event.requestContext?.http?.path)
    const r = await lambdaHandlerImpl(httpMethod, dashboardName)
    logger.info("Redirect", r)
    return r
}

async function lambdaHandlerImpl(httpMethod?: string, dashboardName?: string): Promise<{
    statusCode: number,
    body: string,
    headers?: {
        Location: string
    }
}> {
    if (httpMethod !== "GET") {
        return {
            statusCode: 405,
            body: "Method Not Allowed"
        }
    }
    if (!dashboardName) {
        return {
            statusCode: 404,
            body: "Not Found"
        }
    }
    await m.action({
        type: "Activate",
        dashboardName
    })
    const url = `https://${env.AWS_REGION}.console.aws.amazon.com/cloudwatch/home?region=${env.AWS_REGION}#dashboards:name=${dashboardName}`
    return {
        statusCode: 303,
        body: dashboardName,
        headers: {
            Location: url
        }
    }
}


const dashboardNameRegExp = new RegExp("^[A-Za-z0-9_\-]+$")

function parseDashboardName(s?: string): string | undefined {
    if (!s) {
        return undefined
    }
    const items = s.split("/")
    if (items.length !== 2) {
        return undefined
    }
    const [_, dashboardName] = items
    // dashboardName can contain only alphanumerics, dash (-) and underscore (_)
    if (!dashboardNameRegExp.test(dashboardName)) {
        return undefined
    }
    return dashboardName
}

// @ts-ignore
export const handler = middy(lambdaHandler)
    .use(injectLambdaContext(logger, {
        clearState: true
    }));