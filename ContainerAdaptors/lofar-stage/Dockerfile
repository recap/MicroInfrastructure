#FROM python:3.6
# Double ## comment is from previous version which makes use of lofar_lta-2.7.1
# Current version makes use of lofar_python_api_1-0
FROM nikolaik/python-nodejs
ADD lofar_lta-2.7.1.tar.gz /home/lofar_lta-2.7.1.tar.gz
RUN tar -xzf /home/lofar_lta-2.7.1.tar.gz -C /home
WORKDIR /home/lofar_lta-2.7.1
RUN apt update
RUN apt install -y libaio1 python3-pip
#RUN apt install -y python3-pip
RUN pip3 install flask
RUN python3 setup.py install_oracle
RUN python3 setup.py install
RUN sh -c "echo /usr/local/lib/instantclient_11_2 > /etc/ld.so.conf.d/oracle-instantclient.conf"
RUN ldconfig
ADD Environment.cfg /root/.awe/Environment.cfg
ADD src /home/src
WORKDIR /home/src
EXPOSE 5000
ENTRYPOINT ["python3"]
CMD ["staging.py"]
# WORKDIR /home/test
# RUN python3 lta_test.py
#RUN python3 staging.py
#RUN sh
