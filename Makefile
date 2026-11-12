.PHONY: build test race vet vuln fmt check clean

BIN := bin/usts

build:
	go build -trimpath -o $(BIN) ./cmd/usts

test:
	go test ./...

race:
	go test -race ./...

vet:
	go vet ./...

vuln:
	go run golang.org/x/vuln/cmd/govulncheck@latest ./...

fmt:
	gofmt -w cmd internal

check: vet test

clean:
	rm -rf bin
