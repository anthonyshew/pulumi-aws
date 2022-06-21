FROM node:16-alpine
WORKDIR /usr/src/app
COPY ./ ./
RUN yarn install
EXPOSE 80
CMD ["npx","ts-node", "index.js"]