FROM nikolaik/python-nodejs
RUN echo "deb [trusted=yes] http://repository.egi.eu/sw/production/cas/1/current egi-igtf core" >> /etc/apt/sources.list
RUN apt update
RUN apt install -y software-properties-common
RUN add-apt-repository 'deb http://repository.egi.eu/sw/production/cas/1/current egi-igtf core'
##RUN apt update
##RUN apt install -y globus-gass-copy-progs ca-policy-egi-core default-jdk openjdk-8-jre-headless voms-clients
RUN apt update
RUN apt install -y default-jdk openjdk-8-jre-headless voms-clients ca-policy-egi-core
WORKDIR /home
COPY srmclient-2.6.28.tar.gz /home/srmclient-2.6.28.tar.gz
RUN tar -xzf srmclient-2.6.28.tar.gz
RUN mv srmclient-2.6.28 /opt
ENV SRM_PATH=/opt/srmclient-2.6.28/usr/share/srm
ENV PATH=/opt/srmclient-2.6.28/usr/bin:$PATH
ADD voms.grid.sara.nl.lsc /etc/grid-security/vomsdir/lofar/voms.grid.sara.nl.lsc
ADD .proxy /home/.proxy
#RUN srmcp -x509_user_proxy=/home/.proxy -server_mode=passive srm://srm.grid.sara.nl/pnfs/grid.sara.nl/data/lofar/ops/fifotest/file1M file:////home/tim/file1M
