.PHONY: up down build

up: build
	docker-compose up -d

down:
	docker-compose down

build:
	docker-compose build

status:
	docker-compose ps

logs:
	docker-compose logs -f
