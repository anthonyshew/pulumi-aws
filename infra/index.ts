import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as config from "./utils/config";
import {
  createVPC,
  createEcsCluster,
  createApiService,
  createNextjsService,
  createPrismaMigrationService,
  createPgAdminService,
} from "./lib";

const main = async () => {
  // Question: Couldn't get these to work in us-east-1.
  // AWS automatically provisions to three availability zones by default, they say.
  // If we leave it out of the cluster declaration, it "just works".
  // Why would we want to be explicit with this?
  // const dbMultiAZ = ["a", "b", "c"].map((value) => region + value);

  const tags = {
    environment: config.environment ?? "dev",
  };

  const { vpc, privateSubnets, isolatedSubnets, publicSubnets } =
    await createVPC();

  const dbSecurityGroup = new awsx.ec2.SecurityGroup(
    `${config.projectStack}-security-group-database`,
    {
      // TODO: It looks like this object takes ingress and egress properties.
      // Do we want to use those to clean up our code?
      vpc,
      tags,
    }
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

  const ecsCluster = createEcsCluster({ vpc });

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

  // Here, we create a repository as a place where we can store Docker images.
  // When we want to use an image later in Fargate, we can use these images for our apps.
  const repository = new awsx.ecr.Repository(
    `${config.projectStack}-image-registry`
  );

  const ecsApiService = createApiService({
    cluster: ecsCluster,
    repository,
    privateSubnets,
    vpc,
    namespace,
  });

  const ecsNextjsService = createNextjsService({
    cluster: ecsCluster,
    repository,
    privateSubnets,
    namespace,
    vpc,
  });

  const ecsPrismaMigrationService = createPrismaMigrationService({
    repository,
  });

  const ecsPgAdminService = createPgAdminService({
    cluster: ecsCluster,
    privateSubnets,
    repository,
    vpc,
    namespace,
  });

  // Question: Do we want to actually put up our docs or are we happy to have them just be a part of the dev environment?
  // const documentationImage = buildAndPushImage(imageRepository, {
  //   context: "..",
  //   dockerfile: "./docker/Dockerfile.docs"
  // });

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
      securityGroupIds: [ecsNextjsService.securityGroup.id],
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
      integrationUri: ecsNextjsService.serviceRegistry.arn,
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
    ecsApiService: ecsApiService.ecsService.urn,
    ecsNextjsService: ecsNextjsService.ecsService.urn,
    ecsPgAdminService: ecsPgAdminService.ecsService.urn,
    ecsPrismaMigrationService: ecsPrismaMigrationService,
    webProxyRoute: webProxyRoute.urn,
    webStageGateway: webStageGateway.urn,
  };
};

main();
