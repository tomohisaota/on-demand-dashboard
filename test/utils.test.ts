import {formatDate, matchRule, parseDashboardName} from "../lib/lambda/utils";
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"
import {TOnDemandDashboardRule} from "../lib/lambda/types";

dayjs.extend(utc)
dayjs.extend(timezone)

test('formatDate can handle undefined input', () => {
    expect(formatDate({
            d: undefined,
            offsetInMinutes: undefined,
        }
    )).toBe("");
    expect(formatDate({
            d: undefined,
            offsetInMinutes: 1,
        }
    )).toBe("");
})

test('formatDate can handle JST', () => {
    const timezone = 'Asia/Tokyo'
    const offsetInMinutes = 60 * -9

    const now = new Date()
    const utc = dayjs(now).utc().toDate()
    const local = dayjs(now).tz(timezone).format("YYYY-MM-DDTHH:mm:ss")
    expect(formatDate({
            d: utc,
            offsetInMinutes,
        }
    )).toBe(local);
})

test('formatDate can handle PST', () => {
    const timezone = 'America/Los_Angeles'
    const offsetInMinutes = 60 * 8

    const now = new Date()
    const utc = dayjs(now).utc().toDate()
    const local = dayjs(now).tz(timezone).format("YYYY-MM-DDTHH:mm:ss")
    expect(formatDate({
            d: utc,
            offsetInMinutes,
        }
    )).toBe(local);
})

test('parseDashboardName', () => {
    expect(parseDashboardName("")).toBe(undefined)
    expect(parseDashboardName("/")).toBe(undefined)
    expect(parseDashboardName("/!")).toBe(undefined)
    expect(parseDashboardName("/a")).toBe("a")
    expect(parseDashboardName("/a-b-c")).toBe("a-b-c")
    expect(parseDashboardName("/a-b-c/")).toBe(undefined)
    expect(parseDashboardName("/a-b-c/ddd")).toBe(undefined)
})

test('matchRule', () => {
    const dashboardName = "dashboardNameTest"
    const onDemandDashboardName = "onDemandDashboardNameTest"
    const defaultRule: TOnDemandDashboardRule = {
        ruleName: "TestDefault",
        archive: "Disabled"
    }
    expect(matchRule({
        dashboardName,
        onDemandDashboardName,
        rules: [],
        defaultRule
    }).ruleName).toBe(defaultRule.ruleName)

    expect(matchRule({
        dashboardName,
        onDemandDashboardName,
        rules: [
            {
                ruleName: "MatchAll",
                archive: "Disabled",
                matchAll: true
            }
        ],
        defaultRule
    }).ruleName).toBe("MatchAll")

    expect(matchRule({
        dashboardName,
        onDemandDashboardName,
        rules: [
            {
                ruleName: "Odd",
                archive: "Disabled",
                matchODD: true
            },
            {
                ruleName: "byName",
                archive: "Disabled",
                matchByName: [dashboardName]
            },
            {
                ruleName: "MatchAll",
                archive: "Disabled",
                matchAll: true
            },
        ],
        defaultRule
    }).ruleName).toBe("byName")

    expect(matchRule({
        dashboardName: onDemandDashboardName,
        onDemandDashboardName,
        rules: [
            {
                ruleName: "Odd",
                archive: "Disabled",
                matchODD: true
            },
            {
                ruleName: "byName",
                archive: "Disabled",
                matchByName: [dashboardName]
            },
            {
                ruleName: "MatchAll",
                archive: "Disabled",
                matchAll: true
            },
        ],
        defaultRule
    }).ruleName).toBe("Odd")
})