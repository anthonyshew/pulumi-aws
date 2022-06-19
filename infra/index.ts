import * as aws from "@pulumi/aws";
import { VpcLink } from "@pulumi/aws/apigatewayv2";
import { PrivateDnsNamespace, Service } from "@pulumi/aws/servicediscovery";
import * as awsx from "@pulumi/awsx";
import { TcpPorts } from "@pulumi/awsx/ec2";
import * as pulumi from "@pulumi/pulumi";

import * as config from "./config";




const setup = async () => {

// NETWORKING
const vpc = new awsx.ec2.Vpc("networking-vpc", {
  cidrBlock: "10.0.0.0/16",
  numberOfAvailabilityZones: 3,
  subnets: [
    { type: "public"}, // Internet Facing
    { type: "private" }, // Private and can have Internet is allowed
    { type: "isolated" } // No Internet
  ]
});

const publicSubnets = await vpc.getSubnets("public")
const privateSubnets = await vpc.getSubnets("private")
const isolatedSubnets = await vpc.getSubnets("isolated")

/*
* START OF DATABASE SECURITY GROUP
*/
const dbSecurityGroup = new awsx.ec2.SecurityGroup(
  "networking-security-group-database",
  {
    vpc,
  }
);

// Allowing port 5432 comms with Private subnet
awsx.ec2.SecurityGroupRule.ingress("database-access-private", dbSecurityGroup, { cidrBlocks: privateSubnets.map(subnet => subnet.subnet.cidrBlock.apply(t => t as string)) }, new TcpPorts(5432))
awsx.ec2.SecurityGroupRule.egress("database-access-private", dbSecurityGroup, { cidrBlocks: privateSubnets.map(subnet => subnet.subnet.cidrBlock.apply(t => t as string)) } , new TcpPorts(5432))
/*
* END OF DATABASE SECURITY GROUP
*/

const dbSubnetGroup = new aws.rds.SubnetGroup("database-subnet-group", {
  name: "test-db-subnet-group",
  subnetIds: isolatedSubnets.map(subnet => subnet.id)
});

// Setup Database
const dbCluster = new aws.rds.Cluster("database-cluster", {
  clusterIdentifier: "test-db",
  availabilityZones: config.dbMultiAZ,

  databaseName: "test",

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
  masterPassword: config.dbPass,
  iamDatabaseAuthenticationEnabled: true,

  vpcSecurityGroupIds:  [
    dbSecurityGroup.id
  ],
  dbSubnetGroupName: dbSubnetGroup.id,
  
  skipFinalSnapshot: true
})

// Scaling for Cluster Instances
let clusterInstances: aws.rds.ClusterInstance[] = []

for (let i = 1; i <= config.dbInstanceCount; i++) {
  clusterInstances.push(new aws.rds.ClusterInstance("database-instance-"+i, {
      clusterIdentifier: dbCluster.id,
      identifier: "instance" + "-" + i,

      instanceClass: "db.serverless",
      engine: dbCluster.engine.apply(value => value as aws.rds.EngineType),
      engineVersion: dbCluster.engineVersion,
      publiclyAccessible: config.dbPublic,

  }))
}


// awsx.ec2.SecurityGroupRule.egress("database-access")

/*
*   START OF WEB SECURITY GROUP
*/
const webSecurityGroup = new awsx.ec2.SecurityGroup("networking-security-group-web", {
  vpc
});

awsx.ec2.SecurityGroupRule.ingress(
  "web-http-access",
  webSecurityGroup,
  new awsx.ec2.AnyIPv4Location(),
  new TcpPorts(80)
);

awsx.ec2.SecurityGroupRule.ingress(
  "web-https-access",
  webSecurityGroup,
  new awsx.ec2.AnyIPv4Location(),
  new TcpPorts(443)
);

awsx.ec2.SecurityGroupRule.egress(
  "web-http-access",
  webSecurityGroup,
  new awsx.ec2.AnyIPv4Location(),
  new TcpPorts(80)
);

awsx.ec2.SecurityGroupRule.egress(
  "web-https-access",
  webSecurityGroup,
  new awsx.ec2.AnyIPv4Location(),
  new TcpPorts(443)
);
/*
*   END OF WEB SECURITY GROUP
*/


/*
* START OF SERVICE DISCOVERY
*/
const namespace = new PrivateDnsNamespace("namespace", {
  vpc: vpc.id
})

// Service Register for Web
const serviceRegistryWeb = new Service("service-web", {
  dnsConfig: {
    namespaceId: namespace.id,
    dnsRecords: [
      {
        ttl: 10,
        type: "SRV",
      }
    ],
    routingPolicy: "WEIGHTED",
  },
  healthCheckCustomConfig: {
    failureThreshold: 1,
  },
})

/*
* END OF SERVICE DISCOVERY
*/


/*
* START OF ECS SHIT
*/
const ecsCluster = new awsx.ecs.Cluster("ecs-cluster", {
  vpc
});

const ecsWebTask = new awsx.ecs.FargateTaskDefinition("ecs-task-web", {
  container: {
    essential: true,
    image: "pvermeyden/nodejs-hello-world:a1e8cf1edcc04e6d905078aed9861807f6da0da4",

    logConfiguration: {
      logDriver: "awslogs",
      options: {
        "awslogs-region": config.region,
        "awslogs-group": "web-service",
        "awslogs-create-group": "true",
        "awslogs-stream-prefix": "test",
      },
    },

    //Port Forwarding
    portMappings: [
      {
        containerPort: 80,
        hostPort: 80
      }
    ]
  },
})

const ecsWebService = new awsx.ecs.FargateService("ecs-service", {
  cluster: ecsCluster,

  // Task Config and Scale
  desiredCount: 1,
  taskDefinition: ecsWebTask,

  // Service Discovery
  serviceRegistries: {
    port: 80,
    registryArn: serviceRegistryWeb.arn
  },

  // Firewall and Networking
  securityGroups: [
    webSecurityGroup
  ],
  subnets: privateSubnets.map(subnet => subnet.subnet.id.apply(t => t as string)),
  assignPublicIp: false,

  

  deploymentCircuitBreaker: {
    enable: true,
    rollback: true,
  },

});
/*
* END OF ECS SHIT
*/


const vpcLink = new VpcLink("api-vpcLink", {
  subnetIds: privateSubnets.map(subnet => subnet.id.apply(t => t as string)),
  securityGroupIds: [
    webSecurityGroup.id
  ],
});

const apiGateway = new aws.apigatewayv2.Api("api-gateway", {
  protocolType: "HTTP"
}); 

const cloudMapIntegration = new aws.apigatewayv2.Integration("api-integration", {
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

const webStageGateway= new aws.apigatewayv2.Stage("api-gateway-stage", {apiId: apiGateway.id, autoDeploy: true});

//export const url = listener.endpoint.hostname;
//export const secGroup = securityGroup.name;
//export const thingy = service;
} 

setup();