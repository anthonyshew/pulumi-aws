import * as pulumi from "@pulumi/pulumi";

export const project = pulumi.getProject();
export const stack = pulumi.getStack();
export const projectStack = `${project}-${stack}`;

export const config = new pulumi.Config();

export const environment = config.require("environment");
export const region = config.require("region");
export const dbPass = config.requireSecret("rds-password");
export const dbPublic = config.requireBoolean("rds-public") ?? false;
export const dbInstanceCount = config.requireNumber("rds-instance-count");

export const tags = {
  environment: environment ?? "dev",
};
