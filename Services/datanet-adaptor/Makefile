.PHONY: all

build:
	docker build -t recap/process-datanet-adaptor:v0.1 .

run: build
	docker run -it recap/process-datanet-adaptor:v0.1 /bin/sh

push: build
	docker push recap/process-datanet-adaptor
