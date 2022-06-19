import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";

// Route table
// Where a specific route should go =>
//  Route from A => internetgateway (public subnet routing to internet)>
// Private subnet (private no external internet) => Route table in your private subnet add a NAT gateaway => allow to go to the internet
const vpc = new awsx.ec2.Vpc("demo-vpc", {
  cidrBlock: "10.0.1.0/24",
});


// SG => Firewall like
// SGs should have ingress and egress (inbound and outbound)
// ingress rule => 80 => ip-address anywhere(0.0.0.0/0)
// RDS ingress rule => 5432 => service (10.0.0.0/16)
// egress rules => ANY => anywhere
const securityGroup = new aws.ec2.SecurityGroup("demo-security-group", {
  vpcId: vpc.id,
});


const cluster = new awsx.ecs.Cluster("demo-cluster", {
  vpc,
  securityGroups: [securityGroup.id],
});

// Cloud map
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


const service = new awsx.ecs.FargateService("demo-service", {
  cluster,
  desiredCount: 1,
  taskDefinitionArgs: {
    containers: [ {
      image: "nginx:latest",
      cpu: 512,
      logConfiguration: {
        logDriver: "awslogs",
        options: {
          "awslogs-region": "us-east-1",
          "awslogs-group": "demo-service",
          "awslogs-create-group": "true",
          "awslogs-stream-prefix": "nginx",
        },
      },
      memory: 128,
      essential: true,
      // Can you do away with the port mappings using this?
      // networkListener: 80,
      portMappings: [listener],
    } ],
  },
});

// Add a NAT Gateway on your VPC => route all internal trafic to your NAT GATEWAY

// RDS => residing in your private subnet (=> VPC)
// RDS to communicate with your Fargate service => Service x should be able to connect to 5432 (PG)

export const url = listener.endpoint.hostname;
export const secGroup = securityGroup.name;
export const thingy = service;
