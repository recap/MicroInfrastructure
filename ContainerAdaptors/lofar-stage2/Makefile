.PHONY: build

build:
	docker build -t recap/lofar-stage2:latest .

push: build
	docker push recap/lofar-stage2

run: build
	docker run -it --privileged recap/lofar-stage2 /bin/bash

