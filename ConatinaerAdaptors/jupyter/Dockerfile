FROM jupyter/scipy-notebook
USER root
RUN whoami
RUN apt-get update && apt-get install davfs2 -y
RUN mkdir /data
RUN mkdir /assets
RUN mkdir /shared-data
RUN mkdir /root/.ssh
