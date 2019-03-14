.PHONY: build

build:
	docker build -t recap/process-general:latest .

push: build
	docker push recap/process-general

run: build
	docker run -it --privileged recap/process-general sh

