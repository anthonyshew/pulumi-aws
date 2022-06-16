import * as digitalocean from "@pulumi/digitalocean";
import * as pulumi from "@pulumi/pulumi";

const main = async () => {
  const stack = pulumi.getStack();
  const config = new pulumi.Config();
  const region = config.get("region") || "nyc1";
  const instanceSizeSlug = config.get("instanceSizeSlug") || "basic-xxs";
  const testSecret = config.requireSecret("NEXT_PUBLIC_TEST_SECRET");
  const dbUser = config.requireSecret("DB_USERNAME");
  const dbPassword = config.requireSecret("DB_PASSWORD");
  const dbName = config.requireSecret("DB_NAME");

  const dbUrl = pulumi.interpolate`postgresql://${dbUser}:${dbPassword}@demo-project-db-do-user-10451867-0.b.db.ondigitalocean.com:25060/${dbName}?sslmode-require`;

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
              // This makes it so that, within the app, the request still leads with "/test-api"
              // preservePathPrefix: true,
            },
          ],
          runCommand: "npm run start",
          sourceDir: "/api",
          envs: [
            {
              key: "NEXT_PUBLIC_TEST_SECRET",
              scope: "RUN_AND_BUILD_TIME",
              value: testSecret,
            },
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
              key: "NEXT_PUBLIC_TEST_SECRET",
              scope: "RUN_AND_BUILD_TIME",
              value: testSecret,
            },
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

  return {
    stack,
    liveUrl: app.liveUrl,
  };
};

const mainPromise = main();
mainPromise.catch((err) => console.error(err));

export const stackDeployed = mainPromise.then((res) => res.stack);
export const liveUrl = mainPromise.then((res) => res.liveUrl);
