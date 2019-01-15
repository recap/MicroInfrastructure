.PHONY: build

build:
	docker build -t recap/process-lofar-stage:latest .

push: build
	docker push recap/process-lofar-stage

run: build
	docker run -it --privileged recap/process-lofar-stage bash

