.PHONY: build

build:
	docker build -t recap/process-dispel:v0.1 .

push: build
	docker push recap/process-dispel

run: build
	docker run -it --privileged recap/process-dispel:v0.1 bash

run-dev: build
	docker run -d -p 8080:8080  recap/process-dispel:v0.1


