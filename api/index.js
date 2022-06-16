// const PrismaClient = require("@prisma/client").PrismaClient;

// const prisma = new PrismaClient();

var express = require("express");
var app = express();

app.get("/", (req, res) => {
  console.log("api root was hit");
  return res.send("ping pong!");
});

app.get("/test-route", (req, res, next) => {
  console.log("/test-route was hit");
  return res.json(["Tony", "Lisa", "Michael", "Ginger", "pizza"]);
});

app.post("/write-new-user", async (req, res) => {
  console.log("you hit me");
  const newUser = await prisma.user.create({
    data: {
      email: "test@test.com",
      name: "test",
      password: "plaintextomg",
    },
  });

  return res.json(newUser);
});

app.post("/test-api/write-new-user", async (req, res) => {
  console.log("you hit me");
  const newUser = await prisma.user.create({
    data: {
      email: "test@test.com",
      name: "test",
      password: "plaintextomg",
    },
  });

  return res.json(newUser);
});

app.get("/secret", (req, res, next) => {
  return res.json({ secret: process.env.NEXT_PUBLIC_TEST_SECRET });
});

app.get("*", (req, res) => {
  console.log(req.url);
  console.log("hit the catch all!");
  return res.send("404");
});

app.post("*", (req, res) => {
  console.log(req.url);
  console.log(req.originalUrl);
  console.log(req.route);
  console.log("hit the catch all!");
  return res.send("404");
});

app.listen(8080, () => {
  console.log("Server running on port 8080");
});
