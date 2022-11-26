import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"
import {AWSError} from "aws-sdk"
import {TOnDemandDashboardRule} from "./types";

dayjs.extend(utc)
dayjs.extend(timezone)

export function formatDate(params: {
    d?: Date,
    offsetInMinutes?: number,
}): string {
    if (params.d === undefined) {
        return ""
    }
    return dayjs(params.d)
        .utc()
        .subtract(params.offsetInMinutes ?? 0, "minutes")
        .format("YYYY-MM-DDTHH:mm:ss")
}

export function parseDashboardName(path?: string): string | undefined {
    const dashboardNameRegExp = new RegExp("^[A-Za-z0-9_\-]+$")
    if (!path) {
        return undefined
    }
    const items = path.split("/")
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

export function matchRule(
    {
        dashboardName,
        onDemandDashboardName,
        rules,
        defaultRule
    }: {
        dashboardName: string,
        onDemandDashboardName: string,
        rules: TOnDemandDashboardRule[],
        defaultRule: TOnDemandDashboardRule,
    }) {
    return rules.find(r => {
        if (r.matchAll) {
            return true
        }
        if (r.matchODD && (onDemandDashboardName === dashboardName)) {
            return true
        }
        return !!(r.matchByName && (r.matchByName.includes(dashboardName)));

    }) || defaultRule
}

export function isAWSError(arg: any): arg is AWSError {
    return (
        arg !== null &&
        typeof arg === "object" &&
        typeof arg.code === "string" &&
        typeof arg.message === "string"
    )
}

// HTML Related

type children = (...args: string[]) => string

function optionBuilder(arg?: { [key: string]: string | undefined }): string {
    if (!arg) {
        return ""
    }
    return Object.entries(arg).map(i => {
        const [key, value] = i
        if (value === undefined) {
            return undefined
        }
        return key + '="' + value.replace(/"/g, '\\"') + '"'
    })
        .filter(i => i !== undefined)
        .join(" ")
}

export function table(): children {
    return (...args: string[]) => `<table>${args.filter(i => i).join("")}</table>`
}

export function tr(): children {
    return (...args: string[]) => `<tr>${args.filter(i => i).join("")}</tr>`
}

export function td(params?: {
    align?: ("left" | "center" | "right" | "justify")
}): children {
    return (...args: string[]) => `<td ${optionBuilder(params)}>${args.filter(i => i).join("")}</td>`
}

export function th(): children {
    return (...args: string[]) => `<th>${args.filter(i => i).join("")}</th>`
}

export function a(params?: {
    href?: string
}): children {
    return (...args: string[]) => `<a ${optionBuilder(params)}>${args.filter(i => i).join("")}</a>`
}