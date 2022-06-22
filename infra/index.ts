import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import { buildAndPushImage } from "./utils/buildAndPushImage";
import * as config from "./utils/config";

const main = async () => {
  // Question: Couldn't get these to work in us-east-1.
  // AWS automatically provisions to three availability zones by default.
  // If we leave it out of the cluster declaration, it "just works".
  // Why would we want to be explicit with this?
  // const dbMultiAZ = ["a", "b", "c"].map((value) => region + value);

  const tags = {
    environment: config.environment ?? "dev",
  };

  // A VPC is a "virtual private cloud".
  // This is a cloud with the cloud for you to use as your own.
  // It has all of the characteristics of a cloud provider but now it is at your command.
  const vpc = new awsx.ec2.Vpc(`${config.projectStack}-vpc`, {
    cidrBlock: "10.0.0.0/16",
    subnets: [
      {
        name: `${config.projectStack}-subnet-public`,
        type: "public",
      },
      {
        name: `${config.projectStack}-subnet-private`,
        type: "private",
      },
      {
        name: ` ${config.projectStack}-subnet-isolated`,
        type: "isolated",
      },
    ],
    numberOfAvailabilityZones: 2,
    tags,
  });

  const publicSubnets = await vpc.getSubnets("public");
  const isolatedSubnets = await vpc.getSubnets("isolated");
  const privateSubnets = await vpc.getSubnets("private");

  // "Security groups" are used to control access to your network.
  const webSecurityGroup = new awsx.ec2.SecurityGroup(
    `${config.projectStack}-security-group-web`,
    {
      vpc,
      tags,
    }
  );

  const apiSecurityGroup = new awsx.ec2.SecurityGroup(
    `${config.projectStack}-security-group-api`,
    {
      vpc,
      tags,
    }
  );

  // TODO: It looks like this object takes ingress and egress properties.
  // Do we want to use those to clean up our code?
  const dbSecurityGroup = new awsx.ec2.SecurityGroup(
    `${config.projectStack}-security-group-database`,
    {
      vpc,
      tags,
    }
  );

  const pgAdminSecurityGroup = new awsx.ec2.SecurityGroup(
    `${config.projectStack}-security-group-pgAdmin`,
    {
      vpc,
      tags,
    }
  );

  // An "ingress" rule is used to allow traffic into your network.
  awsx.ec2.SecurityGroupRule.ingress(
    `${config.projectStack}-http-access`,
    webSecurityGroup,
    new awsx.ec2.AnyIPv4Location(),
    new awsx.ec2.TcpPorts(80)
  );

  awsx.ec2.SecurityGroupRule.ingress(
    `${config.projectStack}-https-access`,
    webSecurityGroup,
    new awsx.ec2.AnyIPv4Location(),
    new awsx.ec2.TcpPorts(443)
  );

  awsx.ec2.SecurityGroupRule.ingress(
    `${config.projectStack}-api-http-access`,
    apiSecurityGroup,
    new awsx.ec2.AnyIPv4Location(),
    new awsx.ec2.TcpPorts(80)
  );

  awsx.ec2.SecurityGroupRule.ingress(
    `${config.projectStack}-api-https-access`,
    apiSecurityGroup,
    new awsx.ec2.AnyIPv4Location(),
    new awsx.ec2.TcpPorts(443)
  );

  // An "egress" rule is used to allow traffic out of your network.
  awsx.ec2.SecurityGroupRule.egress(
    `${config.projectStack}-api-http-access`,
    apiSecurityGroup,
    new awsx.ec2.AnyIPv4Location(),
    new awsx.ec2.TcpPorts(80)
  );

  awsx.ec2.SecurityGroupRule.egress(
    `${config.projectStack}-api-https-access`,
    apiSecurityGroup,
    new awsx.ec2.AnyIPv4Location(),
    new awsx.ec2.TcpPorts(443)
  );

  awsx.ec2.SecurityGroupRule.egress(
    `${config.projectStack}-web-http-access`,
    webSecurityGroup,
    new awsx.ec2.AnyIPv4Location(),
    new awsx.ec2.TcpPorts(80)
  );

  awsx.ec2.SecurityGroupRule.egress(
    `${config.projectStack}-web-https-access`,
    webSecurityGroup,
    new awsx.ec2.AnyIPv4Location(),
    // Question: Just want to confirm...ALL tcp ports?
    new awsx.ec2.AllTcpPorts()
  );

  // Here, we have the subnet grouping for locking down access to our database.
  // Because we are using the isolated subnet here,
  // we know that no one can get to our database except us.
  const dbSubnetGroup = new aws.rds.SubnetGroup(
    `${config.projectStack}-db-subnet-group`,
    {
      name: `${config.projectStack}-db-subnet-group`,
      subnetIds: isolatedSubnets.map((subnet) => subnet.id),
      tags,
    }
  );

  // Allowing port 5432 to communicate with private subnet
  awsx.ec2.SecurityGroupRule.ingress(
    `${config.projectStack}-database-access-private`,
    dbSecurityGroup,
    {
      cidrBlocks: privateSubnets.map((subnet) =>
        subnet.subnet.cidrBlock.apply((t) => t as string)
      ),
    },
    new awsx.ec2.TcpPorts(5432)
  );
  awsx.ec2.SecurityGroupRule.egress(
    `${config.projectStack}-database-access-private`,
    dbSecurityGroup,
    {
      cidrBlocks: privateSubnets.map((subnet) =>
        subnet.subnet.cidrBlock.apply((t) => t as string)
      ),
    },
    new awsx.ec2.TcpPorts(5432)
  );

  // A database cluster is the RDS way to utilize databasing safely.
  // The cluster will be using a primary database.
  // If it goes down, there will be secondaries for it to fall back to.
  const dbCluster = new aws.rds.Cluster(`${config.projectStack}-db-cluster`, {
    clusterIdentifier: `${config.projectStack}-db`,
    tags,
    // Continued from question in the configs about if these are needed or not
    // availabilityZones: ["a", "b", "c"].map((value) => region + value),

    // Question: Wanted to do `${config.projectStack} but there are naming restrictions.
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
    masterPassword: config.dbPass,
    iamDatabaseAuthenticationEnabled: true,
    vpcSecurityGroupIds: [dbSecurityGroup.id],
    dbSubnetGroupName: dbSubnetGroup.id,
    skipFinalSnapshot: false,
  });

  // Scalability for your database instances
  let clusterInstances: aws.rds.ClusterInstance[] = [];

  for (let i = 1; i <= config.dbInstanceCount; i++) {
    clusterInstances.push(
      new aws.rds.ClusterInstance(
        `${config.projectStack}-database-instance` + i,
        {
          clusterIdentifier: dbCluster.id,
          identifier: "instance" + "-" + i,

          instanceClass: "db.serverless",
          engine: dbCluster.engine.apply(
            (value) => value as aws.rds.EngineType
          ),
          engineVersion: dbCluster.engineVersion,
          publiclyAccessible: config.dbPublic,
        }
      )
    );
  }

  // Finally, let's get your apps up and running.
  // ECS means "Elastic Container Service"
  // It is a way to run containers on AWS.
  // AWS says ECS is "highly secure, reliable, and scalable."
  const ecsCluster = new awsx.ecs.Cluster(
    `${config.projectStack}-ecs-cluster`,
    {
      vpc,
      tags,
    }
  );

  // In our VPC, we need to be able to establish DNS for our services.
  // This is so that our cloud knows where to find stuff.
  // With this namespace, we can create DNS records that our cloud can do this with.
  const namespace = new aws.servicediscovery.PrivateDnsNamespace(
    `${config.projectStack}-namespace`,
    {
      vpc: vpc.id,
      tags,
    }
  );

  // Registering our web service to our namespace.
  const serviceRegistryWeb = new aws.servicediscovery.Service(
    `${config.projectStack}-service-web`,
    {
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
    }
  );

  const serviceRegistryApi = new aws.servicediscovery.Service(
    `${config.projectStack}-service-api`,
    {
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
    }
  );

  const serviceRegistryPgAdmin = new aws.servicediscovery.Service(
    `${config.projectStack}-pgAdmin-service`,
    {
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
    }
  );

  // Here, we create a repository as a place where we can store Docker images.
  // When we want to use an image later in Fargate, we can use these images for our apps.
  const imageRepository = new awsx.ecr.Repository(
    `${config.projectStack}-image-registry`
  );

  // Build the images from our source code and push it into the repository.
  // Now it will be available for use.
  const prismaMigrationImage = buildAndPushImage(imageRepository, {
    context: "../",
    dockerfile: "../docker/Dockerfile.prisma",
    // TODO: Is there a better way to pass the database URL to these containers?
    args: {
      DATABASE_URL: "",
    },
  });

  const apiImage = buildAndPushImage(imageRepository, {
    context: "../",
    dockerfile: "../docker/Dockerfile.api",
    // TODO: Is there a better way to pass the database URL to these containers?
    args: {
      DATABASE_URL: "",
    },
  });

  const nextjsImage = buildAndPushImage(imageRepository, {
    context: "../",
    dockerfile: "../docker/Dockerfile.web",
    // TODO: Is there a better way to pass the database URL to these containers?
    args: {
      DATABASE_URL: "",
    },
  });

  // Question: Do we want to actually put up our docs or are we happy to have them just be a part of the dev environment?
  // const documentationImage = buildAndPushImage(imageRepository, {
  //   context: "..",
  //   dockerfile: "./docker/Dockerfile.docs"
  // });

  // Create a Fargate task definition.
  // Fargate has "tasks."
  // Tasks are instances of the containers that Fargate is supposed to have running.
  // You can define many tasks within one Fargate instance.
  // That way, you can be running several applications that can talk to each other.
  const ecsApiTask = new awsx.ecs.FargateTaskDefinition(
    `${config.projectStack}-api-task`,
    {
      tags,
      container: {
        essential: true,
        image: apiImage,
        logConfiguration: {
          logDriver: "awslogs",
          options: {
            "awslogs-region": config.region,
            "awslogs-group": "api-service",
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

  const ecsWebTask = new awsx.ecs.FargateTaskDefinition(
    `${config.projectStack}-web-task`,
    {
      container: {
        essential: true,
        image: nextjsImage,
        logConfiguration: {
          logDriver: "awslogs",
          options: {
            "awslogs-region": config.region,
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

  const ecsPgAdminTask = new awsx.ecs.FargateTaskDefinition(
    `${config.projectStack}-ecs-pgAdmin-task`,
    {
      container: {
        essential: true,
        image: "dpage/pgadmin4:latest",

        logConfiguration: {
          logDriver: "awslogs",
          options: {
            "awslogs-region": config.region,
            "awslogs-group": "pgAdmin-service",
            "awslogs-create-group": "true",
            "awslogs-stream-prefix": "test",
          },
        },

        environment: [
          {
            name: "PGADMIN_DEFAULT_EMAIL",
            value: "user@local.local",
          },
          {
            name: "PGADMIN_DEFAULT_PASSWORD",
            value: config.dbPass,
          },
          {
            name: "PGADMIN_LISTEN_PORT",
            value: "80",
          },
        ],

        //Port Forwarding
        portMappings: [
          {
            containerPort: 80,
            hostPort: 80,
          },
        ],
      },
    }
  );

  const ecsApiService = new awsx.ecs.FargateService(
    `${config.projectStack}-ecs-api-service`,
    {
      cluster: ecsCluster,

      // Task Config and Scale
      desiredCount: 1,
      taskDefinition: ecsApiTask,

      // Service Discovery
      serviceRegistries: {
        port: 80,
        registryArn: serviceRegistryApi.arn,
      },

      // Firewall and Networking
      securityGroups: [apiSecurityGroup],
      subnets: privateSubnets.map((subnet) =>
        subnet.subnet.id.apply((t) => t as string)
      ),
      assignPublicIp: false,

      deploymentCircuitBreaker: {
        enable: true,
        rollback: true,
      },
    }
  );

  const ecsWebService = new awsx.ecs.FargateService(
    `${config.projectStack}-ecs-web-service`,
    {
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
    }
  );

  const ecsPgAdminService = new awsx.ecs.FargateService(
    `${config.projectStack}-ecs-pgAdmin-service`,
    {
      cluster: ecsCluster,
      desiredCount: 1,
      taskDefinition: ecsPgAdminTask,
      serviceRegistries: {
        port: 80,
        registryArn: serviceRegistryPgAdmin.arn,
      },
      securityGroups: [pgAdminSecurityGroup],
      subnets: privateSubnets.map((subnet) =>
        subnet.subnet.id.apply((t) => t as string)
      ),
      assignPublicIp: false,
      deploymentCircuitBreaker: {
        enable: true,
        rollback: true,
      },
    }
  );

  // Let's get our apps opened up to the world.
  // API Gateway is the world's portal into your private subnet.
  // It also handles the security groupings so that we only expose what we want to.
  const vpcLink = new aws.apigatewayv2.VpcLink(
    `${config.projectStack}-vpc-link`,
    {
      tags,
      subnetIds: privateSubnets.map((subnet) =>
        subnet.id.apply((t) => t as string)
      ),
      securityGroupIds: [webSecurityGroup.id],
    }
  );

  const apiGateway = new aws.apigatewayv2.Api(`${config.projectStack}-api`, {
    protocolType: "HTTP",
    tags,
  });

  const cloudMapIntegration = new aws.apigatewayv2.Integration(
    `${config.projectStack}-integration`,
    {
      integrationType: "HTTP_PROXY",
      integrationMethod: "ANY",
      integrationUri: serviceRegistryWeb.arn,
      connectionType: "VPC_LINK",
      connectionId: vpcLink.id,
      apiId: apiGateway.id,
    }
  );

  const webProxyRoute = new aws.apigatewayv2.Route(
    `${config.projectStack}-api-route`,
    {
      apiId: apiGateway.id,
      routeKey: "ANY /{proxy+}",
      target: pulumi.interpolate`integrations/${cloudMapIntegration.id}`,
    }
  );

  const webStageGateway = new aws.apigatewayv2.Stage(
    `${config.projectStack}-api-gateway-stage`,
    {
      tags,
      apiId: apiGateway.id,
      autoDeploy: true,
    }
  );

  return {
    ecsApiService: ecsApiService.urn,
    ecsWebService: ecsWebService.urn,
    ecsPgAdminService: ecsPgAdminService.urn,
    webProxyRoute: webProxyRoute.urn,
    webStageGateway: webStageGateway.urn,
  };
};

main();
