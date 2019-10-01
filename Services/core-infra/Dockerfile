FROM mhart/alpine-node:8
RUN mkdir /app
RUN mkdir /app/deployments
RUN mkdir /app/containers
ADD src/app.js /app/
ADD src/containers /app/containers/
ADD src/index.html /app/
ADD src/package.json /app/
WORKDIR /app
RUN npm install
