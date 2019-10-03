.PHONY: build

build:
	docker build -t recap/process-srm2local-adaptor .

run: build
	docker run -dt --rm -P recap/process-srm2local-adaptor

push: build
	docker push recap/process-srm2local-adaptor

