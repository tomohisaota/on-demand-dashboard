import {Logger} from '@aws-lambda-powertools/logger'
import {ALBResult, Context} from 'aws-lambda'
import {DashboardManager} from "./DashboardManager"
import {parseDashboardName} from "./utils";
import type {LambdaInterface} from "@aws-lambda-powertools/commons/lib/cjs/types";

export type RedirectLambdaEnv = {
    RULES: string
    BUCKET_NAME: string,
    ON_DEMAND_DASHBOARD_NAME: string
}

const env = process.env as RedirectLambdaEnv & {
    AWS_REGION: string
}

const logger = new Logger({
    serviceName: 'redirect',
});

const m = new DashboardManager({
    rules: JSON.parse(env.RULES),
    bucketName: env.BUCKET_NAME,
    onDemandDashboardName: env.ON_DEMAND_DASHBOARD_NAME,
    region: env.AWS_REGION,
    logger,
})

class Lambda implements LambdaInterface {
    async handler(event: {
        requestContext?: {
            http?: {
                path?: string
                method?: string
            }
        }
    }, context: Context): Promise<ALBResult> {
        logger.appendKeys({
            event,
            context,
        })
        const httpMethod = event.requestContext?.http?.method
        const dashboardName = parseDashboardName(event.requestContext?.http?.path)
        const r = await lambdaHandlerImpl(httpMethod, dashboardName)
        logger.info("Redirect", r)
        return r
    }
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

const f = new Lambda();
export const handler = f.handler.bind(f)