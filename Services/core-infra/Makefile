.PHONY: all

build:
	docker build -t recap/process-core-infra:v0.1 .

run: build
	docker run -it recap/process-core-infra:v0.1 /bin/sh

push: build
	docker push recap/process-core-infra
