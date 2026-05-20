import type {LambdaInterface} from '@aws-lambda-powertools/commons/types';
import {Logger} from '@aws-lambda-powertools/logger'
import {Context} from 'aws-lambda'
import {ApiClient} from "./ApiClient"
import {CfnClient, StackEventHandler, TCfnStackEvent} from "./StackEventHandler"

export type StackEventLambdaEnv = {
    BUCKET_NAME: string,
}

const env = process.env as StackEventLambdaEnv & {
    AWS_REGION: string
}

const logger = new Logger({
    serviceName: 'stack-event',
});

const stackEventHandler = new StackEventHandler({
    cfn: new CfnClient({region: env.AWS_REGION, logger}),
    api: new ApiClient({region: env.AWS_REGION, bucketName: env.BUCKET_NAME, logger}),
    logger,
})

class Lambda implements LambdaInterface {
    @logger.injectLambdaContext({logEvent: false, resetKeys: true})
    public async handler(event: TCfnStackEvent, context: Context): Promise<void> {
        logger.appendKeys({event, context})
        await stackEventHandler.handle(event)
    }
}

const f = new Lambda()
export const handler = f.handler.bind(f)
