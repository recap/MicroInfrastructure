FROM mhart/alpine-node:8
RUN mkdir /app
RUN mkdir /app/deployments
ADD src/app.js /app/
ADD src/jupyter.js /app/
ADD src/index.html /app/
ADD src/package.json /app/
WORKDIR /app
RUN npm install
