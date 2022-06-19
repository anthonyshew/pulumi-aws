import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";

const projectName = "demo";

const tags = {
  // Question: Should I make this go off of stack?
  ENVIRONMENT: process.env.ENV || "dev",
};

const main = async () => {
  const config = new pulumi.Config();
  const stack = pulumi.getStack();

  // const MultiAZ = ["a", "b", "c"].map((value) => region + value);
  const dbPass = config.getSecret("rds-password");
  const dbPublic = config.getBoolean("rds-public") ?? false;
  const region = config.get("region");

  if (!region) {
    throw new Error("No region has been specified.");
  }

  if (!dbPass) {
    throw new Error("No databass password has been specified.");
  }

  const vpc = new awsx.ec2.Vpc(`${projectName}-${stack}-vpc`, {
    cidrBlock: "10.0.0.0/16",
    subnets: [
      {
        name: `${projectName}-${stack}-subnet-public`,
        type: "public",
      },
      {
        name: `${projectName}-${stack}-subnet-private`,
        type: "private",
      },
      {
        name: ` ${projectName}-${stack}-subnet-isolated`,
        type: "isolated",
      },
    ],
    numberOfAvailabilityZones: 2,
    tags,
  });

  // Network security (Security Groups)
  // HTTP/HTTPS network (public)
  const sgWeb = new awsx.ec2.SecurityGroup(`${projectName}-sg-web`, {
    vpc,
    tags,
  });

  awsx.ec2.SecurityGroupRule.ingress(
    "http-access",
    sgWeb,
    new awsx.ec2.AnyIPv4Location(),
    new awsx.ec2.TcpPorts(80)
  );

  awsx.ec2.SecurityGroupRule.ingress(
    "https-access",
    sgWeb,
    new awsx.ec2.AnyIPv4Location(),
    new awsx.ec2.TcpPorts(443)
  );

  awsx.ec2.SecurityGroupRule.egress(
    "http-access",
    sgWeb,
    new awsx.ec2.AnyIPv4Location(),
    new awsx.ec2.TcpPorts(80)
  );

  awsx.ec2.SecurityGroupRule.egress(
    "https-access",
    sgWeb,
    new awsx.ec2.AnyIPv4Location(),
    new awsx.ec2.TcpPorts(443)
  );

  // Application
  // Subnet ids
  const publicSubnet = await vpc.getSubnets("public");
  const privateSubnet = await vpc.getSubnets("private");
  const isolatedSubnet = await vpc.getSubnets("isolated");

  // Database

  const MultiAZ = ["a", "b", "c"].map((value) => region + value);
  const dbInstanceCount = config.getNumber("rds-instanceCount") ?? 1;
  const dbSecurityGroup = new aws.ec2.SecurityGroup(
    "networking-security-group",
    {
      vpcId: vpc.id,
    }
  );

  const dbSubnetGroup = new aws.rds.SubnetGroup("database-subnet-group", {
    name: `${projectName}-${stack}-db-subnet-group`,
    subnetIds: vpc.getSubnetsIds("isolated"),
  });

  // Setup
  const dbCluster = new aws.rds.Cluster("database-cluster", {
    clusterIdentifier: `${projectName}-${stack}-db`,
    availabilityZones: MultiAZ,

    databaseName: `${projectName}-${stack}`,

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
      new aws.rds.ClusterInstance(
        `${projectName}-${stack}-database-instance` + i,
        {
          clusterIdentifier: dbCluster.id,
          identifier: "instance" + "-" + i,

          instanceClass: "db.serverless",
          engine: dbCluster.engine.apply(
            (value) => value as aws.rds.EngineType
          ),
          engineVersion: dbCluster.engineVersion,
          publiclyAccessible: dbPublic,
        }
      )
    );
  }
};

main();
