//

import * as pulumi from "@pulumi/pulumi";
import * as digitalocean from "@pulumi/digitalocean";

// const region = digitalocean.Region.NYC3;

// const droplet = new digitalocean.Droplet(`web`, {
//   name: `web`,
//   image: "ubuntu-18-04-x64",
//   region: region,
//   // The Digital Ocean package is not updated to include the correct size names.
//   size: "s-1vcpu-1GB",
// });

// export const cost = droplet.priceMonthly;
// export const ip = droplet.ipv4Address;

const mono_repo_example = new digitalocean.App("mono-repo-example", {
  spec: {
    alerts: [
      {
        rule: "DEPLOYMENT_FAILED",
      },
    ],
    databases: [
      {
        engine: "PG",
        name: "starter-db",
        production: false,
      },
    ],
    domainNames: [
      {
        name: "foo.example.com",
      },
    ],
    name: "mono-repo-example",
    region: "ams",
    // Build a Go project in the api/ directory that listens on port 3000
    // and serves it at https://foo.example.com/api
    // services: [{
    //     alerts: [{
    //         operator: "GREATER_THAN",
    //         rule: "CPU_UTILIZATION",
    //         value: 75,
    //         window: "TEN_MINUTES",
    //     }],
    //     environmentSlug: "go",
    //     github: {
    //         branch: "main",
    //         deployOnPush: true,
    //         repo: "username/repo",
    //     },
    //     httpPort: 3000,
    //     instanceCount: 2,
    //     instanceSizeSlug: "professional-xs",
    //     logDestinations: [{
    //         name: "MyLogs",
    //         papertrail: {
    //             endpoint: "syslog+tls://example.com:12345",
    //         },
    //     }],
    //     name: "api",
    //     routes: [{
    //         path: "/api",
    //     }],
    //     runCommand: "bin/api",
    //     sourceDir: "api/",
    // }],
    // Builds a static site in the project's root directory
    // and serves it at https://foo.example.com/
    staticSites: [
      {
        buildCommand: "npm run build",
        github: {
          branch: "master",
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
