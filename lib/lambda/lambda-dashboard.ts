import type {LambdaInterface} from '@aws-lambda-powertools/commons/types';
import {Logger} from '@aws-lambda-powertools/logger'
import {Context} from 'aws-lambda'
import {DashboardManager, TAction} from "./DashboardManager"
import {a, formatDate, table, td, th, tr} from "./utils";

export type DashboardLambdaEnv = {
    RULES: string,
    REDIRECT_URL: string,
    ON_DEMAND_DASHBOARD_NAME: string
    BUCKET_NAME: string,
}

const env = process.env as DashboardLambdaEnv & {
    AWS_REGION: string
}

const logger = new Logger({
    serviceName: 'dashboard',
});

const m = new DashboardManager({
    rules: JSON.parse(env.RULES),
    bucketName: env.BUCKET_NAME,
    onDemandDashboardName: env.ON_DEMAND_DASHBOARD_NAME,
    region: env.AWS_REGION,
    logger,
})

function button(params: {
    endpoint: string,
    title: string,
    action?: TAction,
    confirmation?: string,
    style?: "primary"
}): string {
    const {endpoint, title, action, confirmation, style} = params
    let cssClass = "btn"
    if (style) {
        cssClass += ` btn-${style}`
    }

    const options: { [key: string]: string } = {
        display: "widget",
        action: "call",
        endpoint: endpoint,
    }
    if (confirmation) {
        options["confirmation"] = confirmation
    }
    return `<a class="${cssClass}">${title}</a>
<cwdb-action ${Object.entries(options).map(i => {
        const [key, value] = i
        return `${key}="${value}"`
    }).join(" ")}> 
${action ? JSON.stringify({action}) : ""}
</cwdb-action>`
}

class Lambda implements LambdaInterface {
    @logger.injectLambdaContext({logEvent: false, resetKeys: true})
    public async handler(event: {
        action?: TAction,
        widgetContext?: {
            timezone: {
                label: string, // Local or UTC
                offsetInMinutes: number
            },
        }
    }, context: Context): Promise<string> {

        const {action, widgetContext} = event
        const {invokedFunctionArn} = context
        logger.setPersistentLogAttributes({
            action,
            event,
            context,
        })
        if (action) {
            await m.action(action)
        }
        if (!widgetContext) {
            return ""
        }
        const info = await m.getStableInfo()

        return table()(
            tr()(
                th()("On Demand"),
                th()("State"),
                th()(`Deactivate At(${widgetContext.timezone.label})`),
                th()("On Demand Link"),
                th()("Matched Rule"),
            ),
            ...info.map((i) => {
                const {dashboardName, state, archiveState} = i

                const archiveActions: string[] = []
                if (i.canEnable) {
                    archiveActions.push(button({
                        endpoint: invokedFunctionArn,
                        title: archiveState,
                        action: {
                            type: "Enable",
                            dashboardName,
                        }
                    }))
                } else if (i.canDisable) {
                    archiveActions.push(button({
                        endpoint: invokedFunctionArn,
                        title: archiveState,
                        action: {
                            type: "Disable",
                            dashboardName,
                        },
                        style: "primary"
                    }))
                } else if (i.canDelete) {
                    archiveActions.push(button({
                        endpoint: invokedFunctionArn,
                        title: "Enabled",
                        action: {
                            type: "Delete",
                            dashboardName,
                        },
                        style: "primary",
                        confirmation: `Are you sure you want to delete dashboard '${dashboardName}' completely?`
                    }))
                } else {
                    archiveActions.push(archiveState)
                }

                const actions: string[] = []
                if (i.canActivate) {
                    actions.push(button({
                        endpoint: invokedFunctionArn,
                        title: state,
                        action: {
                            type: "Activate",
                            dashboardName,
                        }
                    }))
                } else if (i.canDeactivate) {
                    actions.push(button({
                        endpoint: invokedFunctionArn,
                        title: state,
                        action: {
                            type: "Deactivate",
                            dashboardName,
                        },
                        style: "primary"
                    }))
                } else {
                    actions.push(state)
                }
                return tr()(
                    td({
                        align: "center"
                    })(...archiveActions),
                    td({
                        align: "center"
                    })(...actions),
                    td()(formatDate({
                        d: i.deactivateAt,
                        offsetInMinutes: widgetContext?.timezone.offsetInMinutes,
                    })),
                    td()(a({
                        href: env.REDIRECT_URL + dashboardName
                    })(dashboardName)),
                    td()(i.matchedRuleName),
                )
            }))
    }
}


const f = new Lambda();
export const handler = f.handler.bind(f)