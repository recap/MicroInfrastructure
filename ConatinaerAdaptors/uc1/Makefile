.PHONY: build

build:
	docker build -t recap/process-uc1-1:v0.1 .

push: build
	docker push recap/process-uc1-1

run: build
	docker run -it --privileged recap/process-uc1-1:v0.1 bash

run-dev: build
	docker run -d -p 8080:8080  recap/process-uc1-1:v0.1


