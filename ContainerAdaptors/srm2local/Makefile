.PHONY: all

build:
	docker build -t srm2scp .

run: build
	-docker stop srm2scp
	docker run -t --name srm2scp -d -p 8001:5001 --rm srm2scp
	docker ps
#	docker run -it lofar-staging # sh

# docker run -t and in Dockerfile python -u flags added so that print statements end up in docker log
