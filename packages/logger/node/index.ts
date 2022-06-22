import * as Sentry from "@sentry/node";

export * from "./methods";
export * from "@sentry/node";

const { SENTRY_DSN, IS_DEV, IS_TESTING, NODE_ENV } = process.env;

export const initSentry = () => {
  if (!SENTRY_DSN) {
    return console.log("Sentry is currently disabled.");
  }

  const environment = () => {
    if (IS_DEV) {
      return "development";
    }

    if (IS_TESTING) {
      return "testing";
    }

    return NODE_ENV;
  };

  return Sentry.init({
    dsn: SENTRY_DSN,
    environment: environment(),
    tracesSampleRate: 1.0,
  });
};

export default Sentry;
