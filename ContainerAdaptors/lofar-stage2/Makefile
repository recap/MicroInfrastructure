.PHONY: build

build:
	docker build -t recap/lofar-stage2:latest .

push: build
	docker push recap/lofar-stage2

run: build
	docker run -dt -p 5000:5000 recap/lofar-stage2 

