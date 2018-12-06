.PHONY: build

build:
	docker build -t recap/process-webdav:v0.3 .

push: build
	docker push recap/process-webdav

run: build
	docker run -it recap/process-webdav:v0.3 sh

