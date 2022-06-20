import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as docker from "@pulumi/docker";

const main = async () => {
  // Your project and stack info.
  const project = pulumi.getProject();
  const stack = pulumi.getStack();
  const config = new pulumi.Config();
  // Grab all of our config for this stack.
  const environment = config.require("environment");
  const region = config.require("region");
  const dbPass = config.requireSecret("rds-password");
  const dbPublic = config.requireBoolean("rds-public") ?? false;
  const dbInstanceCount = config.requireNumber("rds-instance-count");
  // Question: Couldn't get these to work.
  // AWS automatically provisions to three availability zones by default.
  // If we leave it out of the cluster declaration, it "just works".
  // Why would we want to be explicit with this?
  // const dbMultiAZ = ["a", "b", "c"].map((value) => region + value);
  const tags = {
    environment,
  };
  // A VPC is a "virtual private cloud".
  // This is a cloud with the cloud for you to use as your own.
  // It has all of the characteristics of a cloud provider but now it is at your command.
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

  const isolatedSubnets = await vpc.getSubnets("isolated");
  const privateSubnets = await vpc.getSubnets("private");

  // "Security groups" are used to control access to your network.
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

  // An "ingress" rule is used to allow traffic into your network.
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

  // An "egress" rule is used to allow traffic out of your network.
  awsx.ec2.SecurityGroupRule.egress(
    "http-access",
    webSecurityGroup,
    new awsx.ec2.AnyIPv4Location(),
    new awsx.ec2.AllTcpPorts()
  );

  // Here, we have the subnet grouping for locking down access to out database.
  // Because we are using the isolated subnet here,
  // we know that no one can get to our database except us.
  const dbSubnetGroup = new aws.rds.SubnetGroup(
    `${project}-${stack}-db-subnet-group`,
    {
      name: `${project}-${stack}-db-subnet-group`,
      subnetIds: isolatedSubnets.map((subnet) => subnet.id),
      tags,
    }
  );

  // A database cluster is the RDS way to utilize databasing safely.
  // The cluster will be using a primary database.
  // If it goes down, there will be secondaries for it to fall back to.
  const dbCluster = new aws.rds.Cluster(`${project}-${stack}-db-cluster`, {
    clusterIdentifier: `${project}-${stack}-db`,
    tags,
    // Continued from question in the configs about if these are needed or not
    // availabilityZones: ["a", "b", "c"].map((value) => region + value),

    // Question: Wanted to do this but there are naming restrictions.
    // databaseName: `${project}-${stack}`,
    // Is this the name of the database in the cluster?
    // If so, we can probably hardcode this name?
    databaseName: `testing123`,

    // Database Engine Config
    engine: "aurora-postgresql",
    engineMode: "provisioned",
    engineVersion: "13.7",
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
    skipFinalSnapshot: false,
  });

  // Scalability for your database instances
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

  // Finally, let's get your apps up and running.
  // ECS means "Elastic Container Service"
  // It is a way to run containers on AWS.
  // AWS says ECS is "highly seure, reliable, and scalable."
  const ecsCluster = new awsx.ecs.Cluster(`${project}-${stack}-ecs-cluster`, {
    vpc,
    tags,
  });

  // In our VPC, we need to be able to establish DNS for our services.
  // This is so that our cloud knows where to found stuff.
  // With this namespace, we can create DNS records that our cloud can do this with.
  const namespace = new aws.servicediscovery.PrivateDnsNamespace("namespace", {
    vpc: vpc.id,
    tags,
  });

  // Registering our web service to our VPC!
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

  // Here, we create a repository as a place where we can store Docker images.
  // When we want to use an image later in Fargate, we can use these images for our apps.
  const imageRepository = new awsx.ecr.Repository(
    `${project}-${stack}-image-registry`
  );

  // Build the image from our source code and push it into the repository.
  // Now it will be available for use.
  const apiImage = imageRepository.buildAndPushImage({
    context: "../api",
  });

  const nextjsImage = imageRepository.buildAndPushImage({
    context: "../nextjs",
  });

  // Create a Fargate task definition.
  // Fargate has "tasks."
  // Tasks are instances of the containers that Fargate is supposed to have running.
  // You can define many tasks within one Fargate instance.
  // That way, you can be running several applications that can talk to each other.

  const webTask = new awsx.ecs.FargateTaskDefinition(
    `${project}-${stack}-web-task`,
    {
      tags,
      container: {
        essential: true,
        image: nextjsImage,
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
            containerPort: 3000,
            hostPort: 3000,
          },
        ],
      },
    }
  );

  const apiTask = new awsx.ecs.FargateTaskDefinition(
    `${project}-${stack}-api-task`,
    {
      tags,
      container: {
        essential: true,
        image: apiImage,
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
    }
  );

  const kittrService = new awsx.ecs.FargateService(
    `${project}-${stack}-kittr-web-service`,
    {
      deploymentCircuitBreaker: {
        rollback: true,
        enable: true,
      },
      subnets: privateSubnets.map((subnet) => subnet.id),
        securityGroups: [webSecurityGroup],
      desiredCount: 1,
      enableEcsManagedTags: true,
      assignPublicIp: false,
      serviceRegistries: {
        containerName: "container",
        containerPort: 3000,
        registryArn: serviceRegistryWeb.arn,
      },
      os: "linux",
      taskDefinition: webTask,
    }
  );

  const kittrApiService = new awsx.ecs.FargateService(
    `${project}-${stack}-kittr-api-service`,
    {
      deploymentCircuitBreaker: {
        rollback: true,
        enable: true,
      },
      subnets: isolatedSubnets.map(subnet => subnet.id),
      desiredCount: 1,
      securityGroups: [webSecurityGroup],
      enableEcsManagedTags: true,
      assignPublicIp: false,
      serviceRegistries: {
        containerName: "container",
        containerPort: 80,
        registryArn: serviceRegistryWeb.arn,
      },
      os: "linux",
      taskDefinition: apiTask,
    }
  );

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

  // Let's get our apps opened up to the world.
  // API Gateway is the world's portal into your private subnet.
  // It also handles the security groupings so that we only expose what we want to.
  const vpcLink = new aws.apigatewayv2.VpcLink(`${project}-${stack}-vpc-link`, {
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
