const PrismaClient = require("@prisma/client").PrismaClient;

const prisma = new PrismaClient();

var express = require("express");
var app = express();

app.use(express.json());

app.get("/", (req, res) => {
  console.log("api root was hit");
  return res.send("ping pong!");
});

app.get("/test-route", (req, res, next) => {
  console.log("/test-route was hit");
  return res.json(["Tony", "Lisa", "Michael", "Ginger", "pizza"]);
});

app.post("/write-new-user", async (req, res) => {
  console.log("you posted to /write-new-user");
  console.log(process.env.DATABASE_URL);
  console.log(req.body);
  try {
    const newUser = await prisma.user.create({
      data: {
        email: "test@test.com",
        name: req.body.name,
        password: "plaintextomg",
      },
    });
    return res.json(newUser);
  } catch (e) {
    console.log(e);
  }

  return res.json({});
});

app.get("*", (req, res) => {
  console.log({ url: req.url });
  console.log({ originalUrl: req.originalUrl });
  console.log({ route: req.route });
  console.log("hit the get catch all!");
  return res.send("404");
});

app.post("*", (req, res) => {
  console.log({ url: req.url });
  console.log({ originalUrl: req.originalUrl });
  console.log({ route: req.route });
  console.log("hit the post catch all!");
  return res.send("404");
});

app.listen(8080, () => {
  console.log("Server running on port 8080");
});
