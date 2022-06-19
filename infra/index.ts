import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";

const vpc = new awsx.ec2.Vpc("demo-vpc", {
  cidrBlock: "10.0.1.0/24",
});

const securityGroup = new aws.ec2.SecurityGroup("demo-security-group", {
  vpcId: vpc.id,
});

const cluster = new awsx.ecs.Cluster("demo-cluster", {
  vpc,
  securityGroups: [securityGroup.id],
});

const listener = new awsx.lb.NetworkListener("nginx-lb", {
  port: 80,
});



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

export const url = listener.endpoint.hostname;
export const secGroup = securityGroup.name;
export const thingy = service;
