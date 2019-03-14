FROM nextcloud
ENV DEBIAN_FRONTEND noninteractive
RUN apt-get update && apt-get install davfs2 -yq
RUN mkdir /data
RUN mkdir /assets
RUN mkdir /shared-data
