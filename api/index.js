var express = require("express");
var app = express();

app.get("/", (req, res) => {
  res.send("ping pong!");
});

app.get("/test-route", (req, res, next) => {
  res.json(["Tony", "Lisa", "Michael", "Ginger", "Food"]);
});

app.get("/secret", (req, res, next) => {
  res.json({ secret: process.env.NEXT_PUBLIC_TEST_SECRET });
});

app.listen(8080, () => {
  console.log("Server running on port 8080");
});
