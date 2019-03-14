.PHONY: build

build:
	docker build -t recap/process-gridftp:latest .

push: build
	docker push recap/process-gridftp

run: build
	docker run -it --privileged recap/process-gridftp:latest bash

