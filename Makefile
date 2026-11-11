.PHONY: build test race vet fmt check clean

BIN := bin/usts

build:
	go build -trimpath -o $(BIN) ./cmd/usts

test:
	go test ./...

race:
	go test -race ./...

vet:
	go vet ./...

fmt:
	gofmt -w cmd internal

check: vet test

clean:
	rm -rf bin
