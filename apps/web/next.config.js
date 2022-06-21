const withTM = require("next-transpile-modules")(["@project/ui", "@project/prisma"]);

module.exports = withTM({
  reactStrictMode: true,
});
