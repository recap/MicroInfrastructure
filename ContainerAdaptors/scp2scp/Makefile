.PHONY: build

build:
	docker build -t recap/process-scp2scp:v0.1 .

push: build
	docker push recap/process-scp2scp

run: build
	docker run -it --privileged recap/process-scp2scp:v0.1 sh

