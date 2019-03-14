FROM ubuntu
ENV DEBIAN_FRONTEND noninteractive
RUN apt-get update && apt-get install davfs2 wget gnupg alien fetch-crl -y
RUN mkdir /data
RUN mkdir /assets
RUN mkdir /shared-data
WORKDIR /root/
RUN wget http://toolkit.globus.org/ftppub/gt6/installers/repo/globus-toolkit-repo_latest_all.deb
RUN dpkg -i globus-toolkit-repo_latest_all.deb
RUN apt-get update && apt-get install globus-gridftp -y
RUN wget -q -O - https://dist.eugridpma.info/distribution/igtf/current/GPG-KEY-EUGridPMA-RPM-3 | apt-key add -
RUN echo "deb http://repository.egi.eu/sw/production/cas/1/current egi-igtf core" > /etc/apt/sources.list.d/egi.list
RUN apt-get update && apt-get install ca-policy-egi-core -y 
RUN wget http://software.plgrid.pl/packages/general/ca_PLGRID-SimpleCA-1.0-4.noarch.rpm
RUN alien --to-deb ca_PLGRID-SimpleCA-1.0-4.noarch.rpm
RUN dpkg -i ca-plgrid-simpleca_1.0-5_all.deb



