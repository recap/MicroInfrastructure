FROM mhart/alpine-node:8
RUN mkdir /app
RUN mkdir /app/frontend
RUN mkdir /app/frontend/icon
ADD src/app.js /app/
ADD src/index.html /app/
ADD src/audit.html /app/
ADD src/ocean.html /app/
ADD src/package.json /app/
ADD src/frontend /app/frontend
ADD src/img /app/img
ADD src/frontend/icon /app/frontend/icon
WORKDIR /app
RUN npm install
