import * as digitalocean from "@pulumi/digitalocean";
import * as pulumi from "@pulumi/pulumi";

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

  const dbCluster = new digitalocean.DatabaseCluster(`${stack}-db-cluster`, {
    engine: "PG",
    nodeCount: 1,
    region: digitalocean.Region.NYC1,
    size: "db-s-1vcpu-1gb",
    version: "14",
    name: "demo-project",
  });

  const db = new digitalocean.DatabaseDb(`${stack}-db`, {
    clusterId: dbCluster.id,
    name: stack,
  });

  const dbUser = new digitalocean.DatabaseUser(`${stack}-db-user`, {
    clusterId: dbCluster.id,
    name: stack,
  });

  const dbUrl = pulumi.interpolate`postgresql://${dbUser.name}:${dbUser.password}@${dbCluster.host}:25060/${db.name}?sslmode-require`;

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
          name: "api",
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
          name: "nextjs",
          routes: [
            {
              path: "/",
            },
          ],
          buildCommand: "npm run build",
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
      jobs: [
        {
          name: "rollback-db",
          kind: "FAILED_DEPLOY",
          runCommand: `npx prisma migrate diff --from-url "${dbUrl}" --to-migrations ./migrations --script > backward.sql &&  npx prisma db execute --url "${dbUrl}" --file backward.sql`,
          sourceDir: "/nextjs",
          github: {
            branch: "main",
            deployOnPush: false,
            repo: "anthonyshew/pulumi-do",
          },
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
    dbCluster,
    db,
    dbUser,
    dbUrl,
  };
};

const mainPromise = main();
mainPromise.catch((err) => console.error(err));

export const stackDeployed = mainPromise.then((res) => res.stack);
export const dbCluster = mainPromise.then((res) => res.dbCluster);
export const db = mainPromise.then((res) => res.db);
export const dbUser = mainPromise.then((res) => res.dbUser);
export const dbUrl = mainPromise.then((res) => res.dbUrl);
