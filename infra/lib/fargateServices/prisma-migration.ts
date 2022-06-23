// import { SecurityGroup, Subnet } from "@pulumi/awsx/ec2";
// import {
//   FargateService,
//   Cluster,
//   FargateTaskDefinition,
// } from "@pulumi/awsx/ecs";
// import { Service } from "@pulumi/aws/servicediscovery";
// import * as config from "../../utils/config";
import { Repository } from "@pulumi/awsx/ecr";

interface Params {
  repository: Repository;
}

export const createPrismaMigrationService = ({ repository }: Params) => {
  const prismaMigrationImage = repository.buildAndPushImage({
    context: "../",
    dockerfile: "../docker/Dockerfile.prisma",
    // TODO: Is there a better way to pass the database URL to these containers?
    args: {
      DATABASE_URL: "",
    },
  });

  // TODO: I don't know if I am supposed to do something special for this container.
  // DO I set it up like the other ones?
  // It's not long-running and it interacts with the db.

  return prismaMigrationImage;
};
