.PHONY: build

build:
	docker build -t recap/process-lofar-adaptor .

run: build
	docker run -dt --rm -P recap/process-lofar-adaptor

push: build
	docker push recap/process-lofar-adaptor

