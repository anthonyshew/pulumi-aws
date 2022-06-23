import { Vpc, SecurityGroup, Subnet } from "@pulumi/awsx/ec2";
import {
  FargateService,
  Cluster,
  FargateTaskDefinition,
} from "@pulumi/awsx/ecs";
import { PrivateDnsNamespace, Service } from "@pulumi/aws/servicediscovery";
import * as config from "../../utils/config";
import { Repository } from "@pulumi/awsx/ecr";

interface Params {
  cluster: Cluster;
  namespace: PrivateDnsNamespace;
  vpc: Vpc;
  privateSubnets: Subnet[];
  repository: Repository;
}

// Create a Fargate task definition.
// Fargate has "tasks."
// Tasks are instances of the containers that Fargate is supposed to have running.
// You can define many tasks within one Fargate instance.
// That way, you can be running several applications that can talk to each other.
export const createPgAdminService = ({
  cluster,
  namespace,
  vpc,
  privateSubnets,
}: Params) => {
  const securityGroup = new SecurityGroup(
    `${config.projectStack}-security-group-pgAdmin`,
    {
      vpc,
      tags: config.tags,
    }
  );

  const serviceRegistry = new Service(
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

  const taskDefinition = new FargateTaskDefinition(
    `${config.projectStack}-pgAdmin-task`,
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
        portMappings: [
          {
            containerPort: 80,
            hostPort: 80,
          },
        ],
      },
    }
  );

  const ecsService = new FargateService(
    `${config.projectStack}-ecs-pgAdmin-service`,
    {
      cluster,
      desiredCount: 1,
      taskDefinition,
      serviceRegistries: {
        port: 80,
        registryArn: serviceRegistry.arn,
      },
      securityGroups: [securityGroup],
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

  return { ecsService, serviceRegistry, securityGroup };
};
