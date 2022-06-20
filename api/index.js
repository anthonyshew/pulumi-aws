// const PrismaClient = require("@prisma/client").PrismaClient;

// const prisma = new PrismaClient();

var express = require("express");
var app = express();

app.use(express.json());

app.get("/", (req, res) => {
  console.log("/ on the api was hit. Great work!");
  return res.send("Hello world!");
});

app.get("/test-route", (req, res, next) => {
  console.log("/test-route on the api was hit. Good stuff!");
  return res.json({ message: "You've done it! Awesome!" });
});

// app.post("/write-new-user", async (req, res) => {
//   console.log("/write-new-user was hit as a POST route. Nice!");
//   console.log(req.body);
//   try {
//     const newUser = await prisma.user.create({
//       data: {
//         email: "test@test.com",
//         name: req.body.name,
//         password: "plaintextomg",
//       },
//     });
//     return res.json(newUser);
//   } catch (error) {
//     console.log(error);
//   }

//   return res.json({ message: "Looks like something went wrong.", e });
// });

app.get("*", (req, res) => {
  return res.send("404'ed for a GET request");
});

app.post("*", (req, res) => {
  return res.send("404'ed for a POST request");
});

app.listen(80, () => {
  console.log("Server running on port 80");
});
