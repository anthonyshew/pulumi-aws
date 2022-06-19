import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as pulumi from "@pulumi/pulumi";

const config = new pulumi.Config();
const stack = pulumi.getStack(); 

// Config for Global
const region: aws.Region =
    config.get("aws-region") ?? aws.Region.EUWest2;

// Config for RDS
const instanceCount = config.getNumber("rds-instanceCount") ?? 1;
const MultiAZ = ['a', 'b', 'c'].map(value => region+value);
const dbPass = config.getSecret("rds-password") ?? "testPassword123"
const dbPublic = config.getBoolean("rds-public") ?? false;

// NETWORKING

const vpc = new awsx.ec2.Vpc("networking-vpc", {
  cidrBlock: "10.0.0.0/16",
  numberOfAvailabilityZones: 3,
  subnets: [
    {type: "isolated", name: "database"}
  ]
});




const securityGroup = new aws.ec2.SecurityGroup("networking-security-group", {
  vpcId: vpc.id,
});


// DATABASE SHIT

const dbSubnetGroup = new aws.rds.SubnetGroup("database-subnet-group", {
  name: "test-db-subnet-group",
  subnetIds: vpc.getSubnetsIds("isolated"),
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

  vpcSecurityGroupIds: [
      securityGroup.id
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




// ECS CLUSTER FUCK STUFF
const cluster = new awsx.ecs.Cluster("ecs-cluster", {
  vpc,
  securityGroups: [securityGroup.id],
});

// Load Balance 
// const listener = new awsx.lb.NetworkListener("ecs-load-balencer", {
//   port: 80,
// });


// const service = new awsx.ecs.FargateService("ecs-service", {
//   cluster,
//   desiredCount: 1,
//   taskDefinitionArgs: {
//     container: {
//       image: "nginx:latest",
//       cpu: 512,
//       logConfiguration: {
//         logDriver: "awslogs",
//         options: {
//           "awslogs-region": "us-east-1",
//           "awslogs-group": "demo-service",
//           "awslogs-create-group": "true",
//           "awslogs-stream-prefix": "nginx",
//         },
//       },
//       memory: 128,
//       essential: true,
//       // Can you do away with the port mappings using this?
//       // networkListener: 80,
//       portMappings: [listener],
//     },
//   },
// });

//export const url = listener.endpoint.hostname;
//export const secGroup = securityGroup.name;
//export const thingy = service;
