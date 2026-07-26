.PHONY: test coverage test-docker test-docker-image clean deps

export LUA_PATH := ./lua/?.lua;./spec/?.lua;./spec/helper/?.lua;;$(LUA_PATH)

deps:
	luarocks make --deps-only wolf-agent-dev-1.rockspec

test:
	busted

coverage:
	rm -f luacov.stats.out luacov.report.out spec/.branch_hits
	busted -c
	luacov
	lua spec/helper/check_coverage.lua

# Build once: docker build -f Dockerfile.test -t wolf-agent-test .
# Then: make test-docker (reuses image with busted/luacov preinstalled)
DOCKER_TEST_IMAGE ?= wolf-agent-test

test-docker-image:
	docker build -f Dockerfile.test -t $(DOCKER_TEST_IMAGE) .

test-docker:
	@if ! docker image inspect $(DOCKER_TEST_IMAGE) >/dev/null 2>&1; then \
		$(MAKE) test-docker-image; \
	fi
	docker run --rm \
		-v "$(CURDIR)":/opt/wolf/agent \
		-w /opt/wolf/agent \
		$(DOCKER_TEST_IMAGE) \
		sh -c 'rm -f luacov.stats.out luacov.report.out spec/.branch_hits && busted -c && luacov && lua5.1 spec/helper/check_coverage.lua'

clean:
	rm -f luacov.stats.out luacov.report.out spec/.branch_hits
