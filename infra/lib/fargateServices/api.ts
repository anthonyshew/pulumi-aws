import {
  Vpc,
  SecurityGroup,
  Subnet,
  SecurityGroupRule,
  TcpPorts,
  AnyIPv4Location,
} from "@pulumi/awsx/ec2";
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
  vpc: Vpc;
  namespace: PrivateDnsNamespace;
  privateSubnets: Subnet[];
  repository: Repository;
}

// Create a Fargate task definition.
// Fargate has "tasks."
// Tasks are instances of the containers that Fargate is supposed to have running.
// You can define many tasks within one Fargate instance.
// That way, you can be running several applications that can talk to each other.
export const createApiService = ({
  cluster,
  vpc,
  namespace,
  privateSubnets,
  repository,
}: Params) => {
  const securityGroup = new SecurityGroup(
    `${config.projectStack}-security-group-api`,
    {
      vpc,
      tags: config.tags,
    }
  );

  const image = repository.buildAndPushImage({
    context: "../",
    dockerfile: "../docker/Dockerfile.api",
    // TODO: Is there a better way to pass the database URL to these containers?
    args: {
      DATABASE_URL: "",
    },
  });

  SecurityGroupRule.ingress(
    `${config.projectStack}-api-http-access`,
    securityGroup,
    new AnyIPv4Location(),
    new TcpPorts(80)
  );

  SecurityGroupRule.ingress(
    `${config.projectStack}-api-https-access`,
    securityGroup,
    new AnyIPv4Location(),
    new TcpPorts(443)
  );

  // An "egress" rule is used to allow traffic out of your network.
  SecurityGroupRule.egress(
    `${config.projectStack}-api-http-access`,
    securityGroup,
    new AnyIPv4Location(),
    new TcpPorts(80)
  );

  SecurityGroupRule.egress(
    `${config.projectStack}-api-https-access`,
    securityGroup,
    new AnyIPv4Location(),
    new TcpPorts(443)
  );

  const serviceRegistry = new Service(`${config.projectStack}-service-api`, {
    tags: config.tags,
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

  const ecsTask = new FargateTaskDefinition(`${config.projectStack}-api-task`, {
    tags: config.tags,
    container: {
      essential: true,
      image: image,
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
  });

  const ecsService = new FargateService(
    `${config.projectStack}-ecs-api-service`,
    {
      cluster,

      // Task Config and Scale
      desiredCount: 1,
      taskDefinition: ecsTask,

      // Service Discovery
      serviceRegistries: {
        port: 80,
        registryArn: serviceRegistry.arn,
      },

      // Firewall and Networking
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
