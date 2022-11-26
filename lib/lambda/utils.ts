import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"
import localizedFormat from "dayjs/plugin/localizedFormat"

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(localizedFormat)

export function formatDate(params: {
    d?: Date,
    offsetInMinutes?: number,
}): string {
    if (params.d === undefined) {
        return ""
    }
    return dayjs(params.d)
        .subtract(params.offsetInMinutes ?? 0, "minutes")
        .format("YYYY-MM-DDTHH:mm:ss")
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