# On Demand Dashboard

## Wiki
Please visit project Wiki page for documentation.
* https://github.com/tomohisaota/on-demand-dashboard/wiki

## How to install
### Configure
Read wiki, and configure bin/on-demand-dashboard.ts based on your requirement.

### Deploy
Just like any CDK project, use cdk deploy
* `cdk deploy CdkOnDemandDashboardStack`

### Check Admin Dashboard
Open CloudWatch Dashboard "OnDemandDashboardAdmin" to verify the configuration.

You can disable Admin Dashboard by stack options

### Use On Demand Dashboard
Open CloudWatch Dashboard "OnDemandDashboard", and enjoy!

## FAQ
### I have deactivated OnDemandDashboard by mistake!
You can use the on-demand-link to activate the dashboard.
In case you haven't bookmarked the link, you can find it in description of dashboard lambda.

