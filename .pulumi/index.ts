import * as digitalocean from "@pulumi/digitalocean";
const domainName = "trovabaseball.com";

const main = async () => {
  // const existingDomain = await digitalocean.getDomain({ name: domainName });
  // let newDomain;

  // if (!existingDomain) {
  //   newDomain = new digitalocean.Domain("demo-sample-domain", {
  //     name: domainName,
  //   });
  // }

  // const domain = existingDomain ?? newDomain;

  const app = new digitalocean.App("demo-example", {
    spec: {
      alerts: [
        {
          rule: "DEPLOYMENT_FAILED",
        },
      ],
      name: "demo-example",
      domainNames: [
        {
          name: "trovabaseball.com",
        },
        {
          name: "www.trovabaseball.com",
        },
      ],
      region: digitalocean.Region.NYC3,
      // Build a Go project in the api/ directory that listens on port 3000
      // and serves it at https://foo.example.com/api
      // services: [
      //   {
      //     alerts: [
      //       {
      //         operator: "GREATER_THAN",
      //         rule: "CPU_UTILIZATION",
      //         value: 75,
      //         window: "TEN_MINUTES",
      //       },
      //     ],
      //     environmentSlug: "go",
      //     github: {
      //       branch: "main",
      //       deployOnPush: true,
      //       repo: "anthonyshew/pulumi-do",
      //     },
      //     httpPort: 3000,
      //     instanceCount: 2,
      //     instanceSizeSlug: "professional-xs",
      //     logDestinations: [
      //       {
      //         name: "MyLogs",
      //         papertrail: {
      //           endpoint: "syslog+tls://example.com:12345",
      //         },
      //       },
      //     ],
      //     name: "api",
      //     routes: [
      //       {
      //         path: "/api",
      //       },
      //     ],
      //     runCommand: "bin/api",
      //     sourceDir: "api/",
      //   },
      // ],
      // Builds a static site in the project's root directory
      // and serves it at https://foo.example.com/
      staticSites: [
        {
          buildCommand: "npm run build",
          github: {
            branch: "main",
            deployOnPush: true,
            repo: "anthonyshew/pulumi-do",
          },
          name: "web",
          routes: [
            {
              path: "/",
            },
          ],
        },
      ],
    },
  });

  // const www = "www.";

  // const existingRecord = await digitalocean.getRecord({
  //   domain: domain?.name ?? newDomain?.name,
  //   name: www,
  // });

  // let newRecord;
  // if (existingRecord) {
  //   newRecord = new digitalocean.DnsRecord("demo-domain-record", {
  //     type: "CNAME",
  //     domain: domain?.name ?? newDomain?.name,
  //     value: "@",
  //     name: www,
  //   });
  // }

  // const dnsRecord = existingRecord ?? newRecord;

  const project = new digitalocean.Project("demo-project", {
    name: "demo-project",
    description: "So described right now.",
    environment: "development",
    purpose: "To learn Pulumi.",
    resources: [app.urn],
  });

  return {
    // dnsRecordExport: dnsRecord.name,
    appLiveUrl: app.liveUrl,
    updatedAt: project.updatedAt,
    projectResources: project.resources,
    message: `The app at ${app.liveUrl} was updated at ${app.updatedAt}.`,
  };
};

const mainPromise = main();
mainPromise.catch((err) => console.error(err));

export const halp = mainPromise.then((res) => res.message);
//  export const   appLiveUrl = app.liveUrl
//  export const   updatedAt = project.updatedAt
//  export const   projectResources = project.resources
//  export const message = `The app at ${app.liveUrl} was updated at ${app.updatedAt}.`,
