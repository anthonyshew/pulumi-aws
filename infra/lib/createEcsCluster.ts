import { Cluster } from "@pulumi/awsx/ecs";
import { Vpc } from "@pulumi/awsx/ec2";
import * as config from "../utils/config";

// Finally, let's get your apps up and running.
// ECS means "Elastic Container Service"
// It is a way to run containers on AWS.
// AWS says ECS is "highly secure, reliable, and scalable."
export const createEcsCluster = ({ vpc }: { vpc: Vpc }) => {
  const ecsCluster = new Cluster(`${config.projectStack}-ecs-cluster`, {
    vpc,
    tags: config.tags,
  });

  return ecsCluster;
};
