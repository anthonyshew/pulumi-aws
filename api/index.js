const PrismaClient = require("@prisma/client").PrismaClient;

const prisma = new PrismaClient();

var express = require("express");
var app = express();

app.get("/", (req, res) => {
  return res.send("ping pong!");
});

app.get("/test-route", (req, res, next) => {
  return res.json(["Tony", "Lisa", "Michael", "Ginger", "Food"]);
});

app.post("/write-new-user", async (req, res) => {
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

app.listen(8080, () => {
  console.log("Server running on port 8080");
});
