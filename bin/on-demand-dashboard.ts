#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import {Duration} from 'aws-cdk-lib';
import {OnDemandDashboardStack} from '../lib/on-demand-dashboard-stack';
import {TOnDemandDashboardRule} from "../lib/lambda/types";

type PresetRuleName = "Demo1" | "Demo2" | "AllManualExceptODD" | "AllEnabledExceptODD" | "AllEnabled" | "AllDisabled"

const PresetRules: { [key in PresetRuleName]: TOnDemandDashboardRule[] } = {
    Demo1: [
        {
            ruleName: "Manual",
            archive: "Manual",
            matchByName: [
                "OnDemandDashboardAdmin",
                "Dummy1",
            ],
            allowActivate: true,
            allowDeactivate: true,
            allowDelete: true,
            ttl: Duration.minutes(3).toMilliseconds()
        },
    ],
    Demo2: [
        {
            ruleName: "Enabled without control",
            archive: "Enabled",
            matchByName: [
                "OnDemandDashboardAdmin",
                "Dummy1",
            ],
            allowActivate: false,
            allowDeactivate: false,
            allowDelete: false,
            ttl: Duration.minutes(3).toMilliseconds()
        },
    ],
    AllManualExceptODD: [
        {
            ruleName: "Protect ODD",
            matchODD: true,
            archive: "Disabled",
        },
        {
            ruleName: "All Manual",
            matchAll: true,
            archive: "Manual",
            allowActivate: true,
            allowDeactivate: true,
            allowDelete: true,
            ttl: Duration.days(3).toMilliseconds()
        },
    ],
    AllEnabledExceptODD: [
        {
            ruleName: "Protect ODD",
            matchODD: true,
            archive: "Disabled",
        },
        {
            ruleName: "All Enabled",
            matchAll: true,
            archive: "Enabled",
            allowActivate: true,
            allowDeactivate: true,
            allowDelete: true,
            ttl: Duration.days(3).toMilliseconds()
        },
    ],
    AllEnabled: [
        {
            ruleName: "All Enabled",
            matchAll: true,
            archive: "Enabled",
            allowActivate: true,
            allowDeactivate: true,
            allowDelete: true,
            ttl: Duration.days(3).toMilliseconds()
        },
    ],
    AllDisabled: [], // Default behavior
}


const app = new cdk.App();
new OnDemandDashboardStack(app, 'OnDemandDashboard', {
    options: {
        rules: PresetRules.Demo1,
        showAdminDashboard: true,
    }
});