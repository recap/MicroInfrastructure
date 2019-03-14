.PHONY: all

build:
	docker build -t lofar-staging .

run: build
	-docker stop lofar-staging
	docker run --name lofar-staging -d -p 8000:5000 --rm lofar-staging
	docker ps
#	docker run -it lofar-staging # sh
