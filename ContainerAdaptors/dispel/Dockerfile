FROM ondrejh/process-dispel:newest
RUN apt-get update && apt-get install davfs2 -y
RUN mkdir /data
RUN mkdir /assets
RUN mkdir /shared-data
CMD catalina.sh run
