.PHONY: build

build:
	docker build -t recap/process-medical-preprocessing:latest .

push: build
	docker push recap/process-medical-preprocessing

run: build
	docker run -it --privileged recap/process-medical-preprocessing bash

