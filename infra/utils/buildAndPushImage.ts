import { DockerBuild } from "@pulumi/docker";
import { Repository } from "@pulumi/awsx/ecr";

export const buildAndPushImage = (
  imageRepository: Repository,
  args: DockerBuild
) => {
  return imageRepository.buildAndPushImage(args);
};
