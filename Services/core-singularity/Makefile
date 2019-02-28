.PHONY: all

build:
	docker build -t recap/process-core-singularity:v0.1 .

run: build
	docker run -it recap/process-core-singularity:v0.1 /bin/bash

push: build
	docker push recap/process-core-singularity
