var express = require("express");
var app = express();

app.get("/", (req, res) => {
  res.send("ping pong!");
});

app.get("/test-route", (req, res, next) => {
  res.json(["Tony", "Lisa", "Michael", "Ginger", "Food"]);
});

app.listen(5000, () => {
  console.log("Server running on port 5000");
});
