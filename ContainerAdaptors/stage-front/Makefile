.PHONY: build

build:
	docker build -t recap/process-stage-front:v0.1 .

push: build
	docker push recap/process-stage-front

run: build
	docker run -it --privileged recap/process-stage-front:v0.1 sh

