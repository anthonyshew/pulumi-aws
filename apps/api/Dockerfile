FROM node:14
WORKDIR /usr/src/app
COPY package*.json index.js ./
RUN yarn install
EXPOSE 80
CMD ["node", "index.js"]