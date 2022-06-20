import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as pulumi from '@pulumi/pulumi';
import { TcpPorts, VpcSubnetArgs, SecurityGroup } from "@pulumi/awsx/ec2";
import { InstanceType } from "@pulumi/aws/ec2";
import { PrivateDnsNamespace, Service } from "@pulumi/aws/servicediscovery";
import { VpcLink } from "@pulumi/aws/apigatewayv2";
// Route table
// Where a specific route should go =>
//  Route from A => internetgateway (public subnet routing to internet)> Private subnet (private no external internet) => Route table in your private subnet add a NAT gateaway => allow to go to the internet General metadata
const tags = {
  ENVIRONMENT: process.env.ENV || "dev",
};
// Networking
const setup = async () => {
  // VPC => Virtual private cloud
  // Public => All resources publicly available (webservers etc)
  // Private => All resources that should not have a public interface
  // but can connect to the internet with a NAT gateway. (Fargate)
  // Internal => All resources that should NEVER have access to the internet (RDS)
  const vpc = new awsx.ec2.Vpc("demo-vpc", {
    cidrBlock: "10.0.0.0/16",
    subnets: [
      {
        name: "demo-subnet-public",
        type: "public",
      },
      {
        name: "demo-subnet-private",
        type: "private",
      },
      {
        name: "demo-subnet-isolated",
        type: "isolated",
      },
    ],
    numberOfAvailabilityZones: 2,
    tags,
  });

  // Network security (Security Groups)
  // HTTP/HTTPS network (public)
  const sgWeb = new awsx.ec2.SecurityGroup("demo-sg-web", { vpc, tags });

  awsx.ec2.SecurityGroupRule.ingress(
    "http-access",
    sgWeb,
    new awsx.ec2.AnyIPv4Location(),
    new TcpPorts(80)
  );

  awsx.ec2.SecurityGroupRule.ingress(
    "https-access",
    sgWeb,
    new awsx.ec2.AnyIPv4Location(),
    new TcpPorts(443)
  );

  awsx.ec2.SecurityGroupRule.egress(
    "http-access",
    sgWeb,
    new awsx.ec2.AnyIPv4Location(),
    new TcpPorts(80)
  );

  awsx.ec2.SecurityGroupRule.egress(
    "https-access",
    sgWeb,
    new awsx.ec2.AnyIPv4Location(),
    new TcpPorts(443)
  );

  const sgRDS = new awsx.ec2.SecurityGroup("demo-sg-rds", { vpc, tags });
  awsx.ec2.SecurityGroupRule.ingress(
    "rds-ingress",
    sgRDS,
    new awsx.ec2.AnyIPv4Location(),
    new TcpPorts(5432)
  );

  awsx.ec2.SecurityGroupRule.egress(
    "rds-egress",
    sgRDS,
    new awsx.ec2.AnyIPv4Location(),
    new TcpPorts(5432)
  );

  // Application
  // Subnet ids

  const publicSubnet = await vpc.getSubnets("public");
  const privateSubnet = await vpc.getSubnets("private");
  const isolatedSubnet = await vpc.getSubnets("isolated");

  // RDS instances
  // const rdsInstance = new aws.rds.Instance("demo-instance", {
  //   instanceClass: "db.t3.micro",
  //   allocatedStorage: 20,
  //   engine: "postgres",
  //   username: "demo",
  //   dbName: "test",
  //   password: "demo123demo",
  //   tags,
  //   vpcSecurityGroupIds: [],
  // });

  // Fargate related
  const ecsCluster = new awsx.ecs.Cluster("demo-ecs-cluster", {
    vpc,
    tags,
  });

  const namespace = new PrivateDnsNamespace("demo-namespace", {
    vpc: vpc.id,
    tags,
  });

  const serviceRegistryHelloWorld = new Service("demo-hello-discover", {
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

  const fargateServiceTask = new awsx.ecs.FargateTaskDefinition(
    "demo-hello-world",
    {
      container: {
        essential: true,
        image: "pvermeyden/nodejs-hello-world:a1e8cf1edcc04e6d905078aed9861807f6da0da4",
        portMappings: [
          {
            containerPort: 80,
            hostPort: 80,
          },
        ],
      },
    }
  );

  const fargateService = new awsx.ecs.FargateService("demo-fargate-service", {
    deploymentCircuitBreaker: {
      enable: true,
      rollback: true,
    },
    serviceRegistries: {
      port: 80,
      registryArn: serviceRegistryHelloWorld.arn,
    },
    assignPublicIp: false,
    subnets: [privateSubnet[0].id],
    cluster: ecsCluster,
    desiredCount: 1,
    taskDefinition: fargateServiceTask,
  });

  // API Gateway stuff
  const vpcLink = new VpcLink("vpcLink", {
    subnetIds: [privateSubnet[0].id],
    securityGroupIds: [],
  });

  const apiGateway = new aws.apigatewayv2.Api("api", {
    protocolType: "HTTP",
    tags,
  });

  const cloudMapIntegration = new aws.apigatewayv2.Integration("integration", {
    integrationType: "HTTP_PROXY",
    integrationMethod: "ANY",
    integrationUri: serviceRegistryHelloWorld.arn,
    connectionType: "VPC_LINK",
    connectionId: vpcLink.id,
    apiId: apiGateway.id,
  });

const helloWorldRoute = new aws.apigatewayv2.Route("helloWorldRoute", {
    apiId: apiGateway.id,
    routeKey: "ANY /{proxy+}",
    target: pulumi.interpolate`integrations/${cloudMapIntegration.id}`,
});
const stageHelloWorld= new aws.apigatewayv2.Stage("example", {apiId: apiGateway.id, autoDeploy: true});

  //Cloud map
  // Service discovery with Route53
  // Discover services based on DNS.
  // Goal: Find service, in private subnet with x parameters
  // Service local hosted zone => entry ab.local => ab -> service
  // Creation FargateService => enable service discovery <-> cloud map
  // All instances of a specific service are discovered and can be routed to

  // kittr.gg/api/blabla => API GATEWAY ROUTE => /api/blabla
  // API Gateway <=> API Proxy routes several routes to specific targets(lambda, http url, websockets, ...)
  // API Gateway in public subnet (VPCLink) (api gateway (on specific routes to your private subnet))
  // HTTP, REST (applicable for this use case) => HTTP
  // Create a path "/" => ANY: {proxy+} => several options one of them
  // => ALB/NLB / Cloud map -> created service
  // Add a NAT Gateway on your VPC => route all internal trafic to your NAT GATEWAY

  // RDS => residing in your private subnet (=> VPC)
  // RDS to communicate with your Fargate service => Service x should be able to connect to 5432 (PG)
};
setup();
