import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";

const tags = {
  // Question: Should I make this go off of stack?
  ENVIRONMENT: process.env.ENV || "dev",
};

const main = async () => {
  // Your project and stack info.
  const project = pulumi.getProject();
  const stack = pulumi.getStack();
  const config = new pulumi.Config();

  // Grab all of our config for this stack.
  const region = config.require("region");
  const dbPass = config.requireSecret("rds-password");
  const dbPublic = config.requireBoolean("rds-public") ?? false;
  const dbInstanceCount = config.requireNumber("rds-instanceCount") ?? 1;
  const dbMultiAZ = ["a", "b", "c"].map((value) => region + value);

  // A VPC is a virtual computer that holds all of your resources.
  // We are using AWS Crosswalk here ("awsx").
  // Crosswalk will give you a nice way to use gateways and subnets.
  const vpc = new awsx.ec2.Vpc(`${project}-${stack}-vpc`, {
    cidrBlock: "10.0.0.0/16",
    subnets: [
      {
        name: `${project}-${stack}-subnet-public`,
        type: "public",
      },
      {
        name: `${project}-${stack}-subnet-private`,
        type: "private",
      },
      {
        name: ` ${project}-${stack}-subnet-isolated`,
        type: "isolated",
      },
    ],
    numberOfAvailabilityZones: 2,
    tags,
  });

  // Network security (Security Groups)
  // HTTP/HTTPS network (public)
  const webSecurityGroup = new awsx.ec2.SecurityGroup(
    `${project}-security-group-web`,
    {
      vpc,
      tags,
    }
  );

  const dbSecurityGroup = new aws.ec2.SecurityGroup(
    "networking-security-group",
    {
      vpcId: vpc.id,
    }
  );

  awsx.ec2.SecurityGroupRule.ingress(
    "http-access",
    webSecurityGroup,
    new awsx.ec2.AnyIPv4Location(),
    new awsx.ec2.TcpPorts(80)
  );

  awsx.ec2.SecurityGroupRule.ingress(
    "https-access",
    webSecurityGroup,
    new awsx.ec2.AnyIPv4Location(),
    new awsx.ec2.TcpPorts(443)
  );

  awsx.ec2.SecurityGroupRule.egress(
    "http-access",
    webSecurityGroup,
    new awsx.ec2.AnyIPv4Location(),
    new awsx.ec2.TcpPorts(80)
  );

  awsx.ec2.SecurityGroupRule.egress(
    "https-access",
    webSecurityGroup,
    new awsx.ec2.AnyIPv4Location(),
    new awsx.ec2.TcpPorts(443)
  );

  // Database
  const dbSubnetGroup = new aws.rds.SubnetGroup(
    `${project}-${stack}-db-subnet-group`,
    {
      name: `${project}-${stack}-db-subnet-group`,
      subnetIds: vpc.getSubnetsIds("isolated"),
    }
  );

  // Setup
  const dbCluster = new aws.rds.Cluster(`${project}-${stack}-db-cluster`, {
    clusterIdentifier: `${project}-${stack}-db`,
    availabilityZones: dbMultiAZ,
    databaseName: `${project}-${stack}`,

    // Database Engine Config
    engine: "aurora-postgresql",
    engineMode: "provisioned",
    engineVersion: "14.3",
    storageEncrypted: true,
    serverlessv2ScalingConfiguration: {
      maxCapacity: 16,
      minCapacity: 1,
    },

    // Creds Config
    masterUsername: "postgres",
    masterPassword: dbPass,
    iamDatabaseAuthenticationEnabled: true,
    vpcSecurityGroupIds: [dbSecurityGroup.id],
    dbSubnetGroupName: dbSubnetGroup.id,
    skipFinalSnapshot: true,
  });

  // Scaling for Cluster Instances
  let clusterInstances: aws.rds.ClusterInstance[] = [];

  for (let i = 1; i <= dbInstanceCount; i++) {
    clusterInstances.push(
      new aws.rds.ClusterInstance(`${project}-${stack}-database-instance` + i, {
        clusterIdentifier: dbCluster.id,
        identifier: "instance" + "-" + i,

        instanceClass: "db.serverless",
        engine: dbCluster.engine.apply((value) => value as aws.rds.EngineType),
        engineVersion: dbCluster.engineVersion,
        publiclyAccessible: dbPublic,
      })
    );
  }
};

main();
