.PHONY: build

build:
	docker build -t recap/process-nextcloud:latest .

push: build
	docker push recap/process-nextcloud

run: build
	docker run -it --privileged recap/process-nextcloud bash

