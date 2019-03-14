FROM mhart/alpine-node:8
RUN apk update && apk add sshfs
RUN mkdir /data
RUN mkdir /root/.ssh
ADD app /root/app
RUN cd /root/app && npm install

