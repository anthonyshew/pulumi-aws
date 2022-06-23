import {
  Vpc,
  SecurityGroup,
  Subnet,
  SecurityGroupRule,
  AnyIPv4Location,
  TcpPorts,
  AllTcpPorts,
} from "@pulumi/awsx/ec2";
import {
  FargateService,
  Cluster,
  FargateTaskDefinition,
} from "@pulumi/awsx/ecs";
import { Service, PrivateDnsNamespace } from "@pulumi/aws/servicediscovery";
import * as config from "../../utils/config";
import { Repository } from "@pulumi/awsx/ecr";

interface Params {
  vpc: Vpc;
  cluster: Cluster;
  namespace: PrivateDnsNamespace;
  privateSubnets: Subnet[];
  repository: Repository;
}

// Create a Fargate task definition.
// Fargate has "tasks."
// Tasks are instances of the containers that Fargate is supposed to have running.
// You can define many tasks within one Fargate instance.
// That way, you can be running several applications that can talk to each other.
export const createNextjsService = ({
  cluster,
  namespace,
  vpc,
  privateSubnets,
  repository,
}: Params) => {
  const securityGroup = new SecurityGroup(
    `${config.projectStack}-security-group-nextjs`,
    {
      vpc,
      tags: config.tags,
    }
  );

  SecurityGroupRule.ingress(
    `${config.projectStack}-http-access`,
    securityGroup,
    new AnyIPv4Location(),
    new TcpPorts(80)
  );

  SecurityGroupRule.ingress(
    `${config.projectStack}-https-access`,
    securityGroup,
    new AnyIPv4Location(),
    new TcpPorts(443)
  );

  SecurityGroupRule.egress(
    `${config.projectStack}-nextjs-http-access`,
    securityGroup,
    new AnyIPv4Location(),
    new TcpPorts(80)
  );

  SecurityGroupRule.egress(
    `${config.projectStack}-nextjs-https-access`,
    securityGroup,
    new AnyIPv4Location(),
    // Question: Just want to confirm...ALL tcp ports?
    new AllTcpPorts()
  );

  const serviceRegistry = new Service(`${config.projectStack}-service-nextjs`, {
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

  const nextjsImage = repository.buildAndPushImage({
    context: "../",
    dockerfile: "../docker/Dockerfile.web",
    // TODO: Is there a better way to pass the database URL to these containers?
    args: {
      DATABASE_URL: "",
    },
  });

  const nextJsTask = new FargateTaskDefinition(
    `${config.projectStack}-nextjs-task`,
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

  const ecsService = new FargateService(
    `${config.projectStack}-ecs-nextjs-service`,
    {
      cluster,

      // Task Config and Scale
      desiredCount: 1,
      taskDefinition: nextJsTask,

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
