FROM ubuntu:16.04
LABEL maintainer "r.s.cushing@uva.nl"

ADD requirements.txt /requirements.txt
ADD data_staging.tar.gz /

RUN apt-get update && apt-get install -y \
        python-pip \
        vim \
        python-dev \
        pkg-config \
        libopencv-dev \
        libav-tools  \
        libjpeg-dev \
        libpng-dev \
        libtiff-dev \
        libjasper-dev \
        build-essential \
        openslide-tools \
        cmake \
        git \
        libgtk2.0-dev \
        pkg-config \
        libavcodec-dev \
        libavformat-dev \
        libswscale-dev \
        libcurl4-gnutls-dev \
        librtmp-dev

RUN pip install --upgrade pip
RUN pip install -r /requirements.txt

