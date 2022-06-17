import * as pulumi from "@pulumi/pulumi";
import * as digitalocean from "@pulumi/digitalocean";
import * as github from "@pulumi/github";

const main = async () => {
  const stack = pulumi.getStack();
  const config = new pulumi.Config();
  const region = config.get("region") || "nyc1";
  const instanceSizeSlug = config.get("instanceSizeSlug") || "basic-xxs";

  const domain = new digitalocean.Domain(`${stack}-domain`, {
    name: "trovabaseball.com",
  });

  if (stack === "prod") {
    const record = new digitalocean.DnsRecord(`${stack}-record`, {
      domain: domain.id,
      type: "CNAME",
      value: "@",
      name: "www",
    });
  }

  let dbCluster;
  let dbUrl;

  try {
    dbCluster = await digitalocean.getDatabaseCluster({
      name: "demo-project",
    });

    const connectionString = pulumi.interpolate`postgresql://${dbCluster.user}:${dbCluster.password}@${dbCluster.host}:${dbCluster.port}/${dbCluster.database}?sslmode-require`;

    // const existingActions = await github.getActionsPublicKey({
    //   repository: "pulumi-do",
    // });

    const actionSecret = new github.ActionsSecret(`${stack}-new-db-url`, {
      repository: "pulumi-do",
      secretName: "STAGE_DATABASE_URL",
      plaintextValue: connectionString,
    });

    dbUrl = connectionString;
  } catch {
    const newCluster = new digitalocean.DatabaseCluster(`${stack}-db-cluster`, {
      engine: "PG",
      nodeCount: 1,
      region: digitalocean.Region.NYC1,
      size: "db-s-1vcpu-1gb",
      version: "14",
      name: "demo-project",
    });

    dbCluster = newCluster;

    const connectionString = pulumi.interpolate`postgresql://${dbCluster.user}:${dbCluster.password}@${dbCluster.host}:${dbCluster.port}/${dbCluster.database}?sslmode-require`;

    dbUrl = connectionString;

    const actionSecret = new github.ActionsSecret(`${stack}-new-db-url`, {
      repository: "pulumi-do",
      secretName: "STAGE_DATABASE_URL",
      plaintextValue: dbUrl,
    });
  }

  const app = new digitalocean.App("demo-example", {
    spec: {
      alerts: [
        // {
        // rule: "DEPLOYMENT_FAILED",
        // },
      ],
      name: "demo-example",
      domainNames: [
        // {
        //   name: "trovabaseball.com",
        // },
        // {
        //   name: "www.trovabaseball.com",
        // },
      ],
      region,
      services: [
        {
          name: "api",
          alerts: [
            {
              operator: "GREATER_THAN",
              rule: "CPU_UTILIZATION",
              value: 75,
              window: "FIVE_MINUTES",
            },
          ],
          github: {
            branch: stack === "stage" ? "stage" : "main",
            deployOnPush: true,
            repo: "anthonyshew/pulumi-do",
          },
          httpPort: 8080,
          instanceSizeSlug,
          instanceCount: 1,
          routes: [
            {
              path: "/test-api",
            },
          ],
          runCommand: "npm run start",
          sourceDir: "/api",
          envs: [
            {
              key: "DATABASE_URL",
              scope: "RUN_AND_BUILD_TIME",
              value: dbUrl,
            },
          ],
        },
        {
          name: "nextjs",
          alerts: [
            {
              operator: "GREATER_THAN",
              rule: "CPU_UTILIZATION",
              value: 75,
              window: "FIVE_MINUTES",
            },
          ],
          github: {
            branch: stack === "stage" ? "stage" : "main",
            deployOnPush: true,
            repo: "anthonyshew/pulumi-do",
          },
          httpPort: 8080,
          instanceSizeSlug,
          routes: [
            {
              path: "/",
            },
          ],
          buildCommand: "npm run deploy",
          runCommand: "npm run start",
          sourceDir: "/nextjs",
          envs: [
            {
              key: "DATABASE_URL",
              scope: "RUN_AND_BUILD_TIME",
              value: dbUrl,
            },
          ],
        },
      ],
    },
  });

  const dbFirewall = new digitalocean.DatabaseFirewall(`${stack}-db-firewall`, {
    clusterId: dbCluster.id,
    rules: [
      {
        type: "app",
        value: app.id,
      },
    ],
  });

  return {
    stack,
  };
};

const mainPromise = main();
mainPromise.catch((err) => console.error(err));

export const stackDeployed = mainPromise.then((res) => res.stack);
