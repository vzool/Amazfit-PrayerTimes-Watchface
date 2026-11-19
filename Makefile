.PHONY: all build dev preview

all: build

build:
	node sync-git-build.js && zeus build

dev:
	node sync-git-build.js && zeus dev

preview:
	node sync-git-build.js && zeus preview