import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import { TcpPorts } from "@pulumi/awsx/ec2";
import * as pulumi from "@pulumi/pulumi";
import { syncBuiltinESMExports } from "module";

const config = new pulumi.Config();
const stack = pulumi.getStack(); 

// Config for Global
const region: aws.Region = config.require("aws-region");

// Config for RDS
const instanceCount = config.requireNumber("rds-instanceCount");
const dbPass = config.requireSecret("rds-password")
const dbPublic = config.getBoolean("rds-public") ?? false;

const MultiAZ = ['a', 'b', 'c'].map(value => region+value);


const setup = async () => {

// NETWORKING
const vpc = new awsx.ec2.Vpc("networking-vpc", {
  cidrBlock: "10.0.0.0/16",
  numberOfAvailabilityZones: 3,
  subnets: [
    { type: "public"},
    { type: "private" },
    { type: "isolated" }
  ]
});


const securityGroup = new awsx.ec2.SecurityGroup("networking-security-group", {
  vpc
});

const publicSubnets = await vpc.getSubnets("public")
const privateSubnets = await vpc.getSubnets("private")
const isolatedSubnets = await vpc.getSubnets("isolated")

// DATABASE SHIT



const dbSecurityGroup = new awsx.ec2.SecurityGroup(
  "networking-security-group-database",
  {
    vpc,
  }
);


awsx.ec2.SecurityGroupRule.ingress("database-access-private", dbSecurityGroup, { cidrBlocks: privateSubnets.map(subnet => subnet.subnet.cidrBlock.apply(t => t as string)) }, new TcpPorts(5432))
awsx.ec2.SecurityGroupRule.egress("database-access-private", dbSecurityGroup, { cidrBlocks: privateSubnets.map(subnet => subnet.subnet.cidrBlock.apply(t => t as string)) } , new TcpPorts(5432))


const dbSubnetGroup = new aws.rds.SubnetGroup("database-subnet-group", {
  name: "test-db-subnet-group",
  subnetIds: isolatedSubnets.map(subnet => subnet.id)
});

// Setup Database
const dbCluster = new aws.rds.Cluster("database-cluster", {
  clusterIdentifier: "test-db",
  availabilityZones: MultiAZ,

  databaseName: "test",

  // Database Engine Config
  engine: "aurora-postgresql",
  engineMode: "provisioned",
  engineVersion: "14.3",
  storageEncrypted: true,
  serverlessv2ScalingConfiguration: {
      maxCapacity: 16,
      minCapacity: 1,
  },

  // Creds Config
  masterUsername: "postgres",
  masterPassword: dbPass,
  iamDatabaseAuthenticationEnabled: true,

  vpcSecurityGroupIds:  [
    dbSecurityGroup.id
  ],
  dbSubnetGroupName: dbSubnetGroup.id,
  
  skipFinalSnapshot: true
})

// Scaling for Cluster Instances
let clusterInstances: aws.rds.ClusterInstance[] = []

for (let i = 1; i <= instanceCount; i++) {
  clusterInstances.push(new aws.rds.ClusterInstance("database-instance-"+i, {
      clusterIdentifier: dbCluster.id,
      identifier: "instance" + "-" + i,

      instanceClass: "db.serverless",
      engine: dbCluster.engine.apply(value => value as aws.rds.EngineType),
      engineVersion: dbCluster.engineVersion,
      publiclyAccessible: dbPublic,

  }))
}


// awsx.ec2.SecurityGroupRule.egress("database-access")


// ECS CLUSTER FUCK STUFF
const cluster = new awsx.ecs.Cluster("ecs-cluster", {
  vpc,
  securityGroups: [securityGroup.id],
});

//Load Balance 
const listener = new awsx.lb.NetworkListener("ecs-load-balencer", {
  port: 80,
});


const service = new awsx.ecs.FargateService("ecs-service", {
  cluster,
  desiredCount: 1,
  taskDefinitionArgs: {
    container: {
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
    },
  },
});

//export const url = listener.endpoint.hostname;
//export const secGroup = securityGroup.name;
//export const thingy = service;
} 

setup();