import * as digitalocean from "@pulumi/digitalocean";

const main = async () => {
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
      services: [
        {
          alerts: [
            {
              operator: "GREATER_THAN",
              rule: "CPU_UTILIZATION",
              value: 75,
              window: "FIVE_MINUTES",
            },
          ],
          github: {
            branch: "main",
            deployOnPush: true,
            repo: "anthonyshew/pulumi-do",
          },
          httpPort: 8080,
          instanceSizeSlug: "basic-xxs",
          // logDestinations: [
          //   {
          //     name: "MyLogs",
          //     papertrail: {
          //       endpoint: "syslog+tls://example.com:12345",
          //     },
          //   },
          // ],
          name: "nextjs",
          routes: [
            {
              path: "/",
            },
          ],
          buildCommand: "npm run build",
          runCommand: "npm run start",
          sourceDir: ".",
        },
      ],
    },
  });

  const project = new digitalocean.Project("demo-project", {
    name: "demo-project",
    description: "So described right now.",
    environment: "development",
    purpose: "To learn Pulumi.",
    resources: [app.urn],
  });

  return {
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
