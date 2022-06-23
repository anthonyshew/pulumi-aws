---
sidebar_position: 1
---

# Overview

This monorepo is managed by Turborepo. We love Turborepo for being a lightweight, easy-to-use, insanely powerful monorepo manager.
We are also using `yarn workspaces` to manage this repository.

This project features three applications:

- A Node API back-end
- A Nextjs front-end
- These docs

It is written completely in TypeScript.

---

## Apps

### The Node API

A barebones Express server.

### Web App

A Nextjs server that has been wrapped with Sentry for logging.

### These Docs

These docs are built with Docusaurus for ease of maintenance.

---

## Testing

Unit testing in this repository is conducted using vitest - except in the Nextjs app. Nextjs has a really easy to setup integration with Jest so we used that.

TODO: E2E tests will be carried out by Cypress.
