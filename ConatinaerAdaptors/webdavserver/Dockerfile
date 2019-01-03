FROM mhart/alpine-node:8
RUN apk update && apk add davfs2 && apk add git
RUN mkdir /data
RUN mkdir /assets
RUN mkdir /shared-data
RUN mkdir /root/.ssh
ADD webdavserver /root/webdavserver
RUN cd /root/webdavserver && npm install

