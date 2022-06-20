import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";

const tags = {
  // Question: Should we make this go off of the stack?
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
  const dbInstanceCount = config.requireNumber("rds-instance-count");
  // Question: Couldn't get these to work.
  // AWS automatically provisions to three availability zones by default.
  // If we leave it out of the cluster declaration, it "just works".
  // Why would we want to be explicit with this?
  // const dbMultiAZ = ["a", "b", "c"].map((value) => region + value);

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

  // Question: These went unused, do we still want them?
  const publicSubnet = await vpc.getSubnets("public");
  const isolatedSubnet = await vpc.getSubnets("isolated");

  const privateSubnets = await vpc.getSubnets("private");

  // Network security (Security Groups)
  // HTTP/HTTPS network (public)
  const webSecurityGroup = new awsx.ec2.SecurityGroup(
    `${project}-security-group-web`,
    {
      vpc,
      tags,
    }
  );

  const dbSecurityGroup = new awsx.ec2.SecurityGroup(
    "networking-security-group-database",
    {
      vpc,
      tags,
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
      tags,
    }
  );

  // Setup
  const dbCluster = new aws.rds.Cluster(`${project}-${stack}-db-cluster`, {
    clusterIdentifier: `${project}-${stack}-db`,
    tags,
    // Continued from question in the configs about if these are needed or not
    // availabilityZones: ["a", "b", "c"].map((value) => region + value),
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

  const ecsCluster = new awsx.ecs.Cluster(`${project}-${stack}-ecs-cluster`, {
    vpc,
    tags,
  });

  const namespace = new aws.servicediscovery.PrivateDnsNamespace("namespace", {
    vpc: vpc.id,
    tags,
  });

  // Service Register for Web
  const serviceRegistryWeb = new aws.servicediscovery.Service("service-web", {
    tags,
    dnsConfig: {
      namespaceId: namespace.id,
      dnsRecords: [
        {
          ttl: 10,
          type: "SRV",
        },
      ],
      routingPolicy: "WEIGHTED",
    },
    healthCheckCustomConfig: {
      failureThreshold: 1,
    },
  });

  const ecsWebTask = new awsx.ecs.FargateTaskDefinition("ecs-task-web", {
    tags,
    container: {
      essential: true,
      image:
        "pvermeyden/nodejs-hello-world:a1e8cf1edcc04e6d905078aed9861807f6da0da4",

      logConfiguration: {
        logDriver: "awslogs",
        options: {
          "awslogs-region": region,
          "awslogs-group": "web-service",
          "awslogs-create-group": "true",
          "awslogs-stream-prefix": "test",
        },
      },
      portMappings: [
        {
          containerPort: 80,
          hostPort: 80,
        },
      ],
    },
  });

  const ecsWebService = new awsx.ecs.FargateService("ecs-service", {
    cluster: ecsCluster,

    // Task Config and Scale
    desiredCount: 1,
    taskDefinition: ecsWebTask,

    // Service Discovery
    serviceRegistries: {
      port: 80,
      registryArn: serviceRegistryWeb.arn,
    },

    // Firewall and Networking
    securityGroups: [webSecurityGroup],
    subnets: privateSubnets.map((subnet) =>
      subnet.subnet.id.apply((t) => t as string)
    ),
    assignPublicIp: false,

    deploymentCircuitBreaker: {
      enable: true,
      rollback: true,
    },
  });

  const dbIngress = awsx.ec2.SecurityGroupRule.ingress(
    "database-access-private",
    dbSecurityGroup,
    {
      cidrBlocks: privateSubnets.map((subnet) =>
        subnet.subnet.cidrBlock.apply((t) => t as string)
      ),
    },
    new awsx.ec2.TcpPorts(5432)
  );

  const dbEgress = awsx.ec2.SecurityGroupRule.egress(
    "database-access-private",
    dbSecurityGroup,
    {
      cidrBlocks: privateSubnets.map((subnet) =>
        subnet.subnet.cidrBlock.apply((t) => t as string)
      ),
    },
    new awsx.ec2.TcpPorts(5432)
  );

  const vpcLink = new aws.apigatewayv2.VpcLink("api-vpcLink", {
    tags,
    subnetIds: privateSubnets.map((subnet) =>
      subnet.id.apply((t) => t as string)
    ),
    securityGroupIds: [webSecurityGroup.id],
  });

  const apiGateway = new aws.apigatewayv2.Api("api", {
    protocolType: "HTTP",
    tags,
  });

  const cloudMapIntegration = new aws.apigatewayv2.Integration("integration", {
    integrationType: "HTTP_PROXY",
    integrationMethod: "ANY",
    integrationUri: serviceRegistryWeb.arn,
    connectionType: "VPC_LINK",
    connectionId: vpcLink.id,
    apiId: apiGateway.id,
  });

  const webProxyRoute = new aws.apigatewayv2.Route("api-route", {
    apiId: apiGateway.id,
    routeKey: "ANY /{proxy+}",
    target: pulumi.interpolate`integrations/${cloudMapIntegration.id}`,
  });

  const webStageGateway = new aws.apigatewayv2.Stage("api-gateway-stage", {
    tags,
    apiId: apiGateway.id,
    autoDeploy: true,
  });
};

main();
