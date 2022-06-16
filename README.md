# The deployment flow is...

0. Code is brought from branches into develop. When ready... (write that app, baby)
1. Code is committed to stage. (manual)
2. Github action runs unit tests and lints. (GHA)
3. Pulumi provisions resources for stages. (GHA)
4. Run post-deploy script for database migration. (in AppPlatform spec?)
5. E2Es run. (GHA)
6. Code is pull requested to master. (GHA? If not, manual)
7. Manual verification of the stage. (manual)
8. Code is merged to master. (manual)
9. New Github action provisions resources for production. (GHA)
10. Run post-deploy script for database migration. (in AppPlatform spec?)
11. Pulumi destroys stage resources. (GHA) (optional)
12. E2Es run? (GHA) (optional)
13. Manual verification of production. (manual)

Gotchas:

- If you are going to perform a database migration, your production database will be affected. This means that your previous deployment will be out of sync with your database until you put up your new deployment.

  - It is recommended to create a feature flag that will disable your application if you are to perform any breaking changes to your production database.

- Changing infrastructure will cause your application deployments to get out of sync with your main branch. You will need to push to `main` twice to get everything freshened up.
  - First, deploy your new infrastructure.
  - Then, deploy the new main branch application code.
  - Alternatively, you can choose to deploy the new infra from

Desired Improvements:

- The database connection string has to be managed twice: once in Pulumi and another for github actions. Can we get this cleaned up?

Questions:

- Does the rollback-db in the pulumi program actually work? It has not been tested to this point.
