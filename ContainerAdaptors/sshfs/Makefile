.PHONY: build

build:
	docker build -t recap/process-sshfs:v0.1 .

push: build
	docker push recap/process-sshfs

run: build
	docker run -it --privileged recap/process-sshfs:v0.1 sh

