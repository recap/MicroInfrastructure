.PHONY: all

build:
	docker build -t lofar-staging .

run: build
	-docker stop lofar-staging
	docker run -t --name lofar-staging -d -p 8002:5000 --rm lofar-staging
	docker ps
#	docker run -it lofar-staging # sh

# docker run -t and in Dockerfile python -u flags added so that print statements end up in docker log
