import { Vpc } from "@pulumi/awsx/ec2";
import * as config from "../utils/config";

// A VPC is a "virtual private cloud".
// This is a cloud with the cloud for you to use as your own.
// It has all of the characteristics of a cloud provider but now it is at your command.
export const createVPC = async () => {
  const vpc = new Vpc(`${config.projectStack}-vpc`, {
    cidrBlock: "10.0.0.0/16",
    subnets: [
      {
        name: `${config.projectStack}-subnet-public`,
        type: "public",
      },
      {
        name: `${config.projectStack}-subnet-private`,
        type: "private",
      },
      {
        name: ` ${config.projectStack}-subnet-isolated`,
        type: "isolated",
      },
    ],
    numberOfAvailabilityZones: 2,
    tags: config.tags,
  });

  const publicSubnets = await vpc.getSubnets("public");
  const isolatedSubnets = await vpc.getSubnets("isolated");
  const privateSubnets = await vpc.getSubnets("private");

  return { vpc, publicSubnets, isolatedSubnets, privateSubnets };
};
