.PHONY: build

build-docker:
	docker build -t recap/process-uc1-2:v0.1 .

push: build-docker
	docker push recap/process-uc1-2

run-docker: build-docker
	docker run -it --privileged recap/process-uc1-2:v0.1 bash

run-dev: build-docker
	docker run -d -p 8080:8080  recap/process-uc1-2:v0.1

build-singularity:
	sudo singularity build process-uc1-2.simg Singularity

run-singularity:
	singularity run --nv process-uc1-2.simg





