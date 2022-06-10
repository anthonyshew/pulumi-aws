import * as digitalocean from "@pulumi/digitalocean";

const main = async () => {
  const app = new digitalocean.App("demo-example", {
    spec: {
      alerts: [
        // {
        // rule: "DEPLOYMENT_FAILED",
        // },
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
          internalPorts: [8080],
          instanceSizeSlug: "basic-xxs",
          name: "api",
          // routes: [
          //   {
          //     path: "/another-api",
          //     // preservePathPrefix: true,
          //   },
          // ],
          runCommand: "npm run start",
          sourceDir: "/api",
        },
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
          sourceDir: "/nextjs",
        },
      ],
    },
  });

  const existingProject = await digitalocean.getProject({
    name: "demo-project",
  });

  let project;

  if (!existingProject) {
    project = new digitalocean.Project("demo-project", {
      name: "demo-project",
      description: "So described right now.",
      environment: "development",
      purpose: "To learn Pulumi.",
      resources: [app.urn],
    });
  }

  // if (existingProject) {
  //   return {
  //     appLiveUrl: app.liveUrl,
  //     message: `The app at ${app.liveUrl} was updated at ${app.updatedAt}. There was an existing DO project so we didnt create a new one.`,
  //   };
  // }

  // return {
  //   appLiveUrl: app.liveUrl,
  //   updatedAt: project?.updatedAt ?? "not updated",
  //   projectResources: project?.resources,
  //   message: `The app at ${app.liveUrl.apply(
  //     (v) => `${v}`
  //   )} was updated at ${app.updatedAt.apply((v) => `${v}`)}.`,
  // };
};

const mainPromise = main();
mainPromise.catch((err) => console.error(err));

// export const halp = mainPromise.then((res) => res.message);
//  export const   appLiveUrl = app.liveUrl
//  export const   updatedAt = project.updatedAt
//  export const   projectResources = project.resources
//  export const message = `The app at ${app.liveUrl} was updated at ${app.updatedAt}.`,
