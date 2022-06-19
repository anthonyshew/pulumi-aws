import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

const config = new pulumi.Config();
const stack = pulumi.getStack(); 

// Config for Global
export const region: aws.Region = config.require("aws-region");

// Config for RDS
export const dbInstanceCount = config.requireNumber("rds-instanceCount");
export const dbPass = config.requireSecret("rds-password")
export const dbPublic = config.getBoolean("rds-public") ?? false;

export const dbMultiAZ = ['a', 'b', 'c'].map(value => region+value);

