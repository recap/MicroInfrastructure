.PHONY: build

build:
	docker build -t recap/process-jupyter:v0.1 .

push: build
	docker push recap/process-jupyter

run: build
	docker run -it --privileged recap/process-jupyter:v0.1 sh

