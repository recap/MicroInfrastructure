FROM nvidia/cuda:8.0-cudnn6-runtime
LABEL maintainer "ivan.eggel@hevs.ch"

ADD requirements.txt /requirements.txt

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

ADD process_uc1.tar.gz /code
