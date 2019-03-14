FROM mhart/alpine-node:8
RUN apk update && apk add sshfs
RUN mkdir /data
RUN mkdir /root/.ssh
ADD fileagent /root/fileagent
RUN cd /root/fileagent && npm install

