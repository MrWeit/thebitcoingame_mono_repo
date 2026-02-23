# Makefile for TBG ckpool unit tests
# These tests are standalone (don't link against ckpool)
# Run with: make && make test

CC ?= gcc
CFLAGS = -Wall -Wextra -g -std=c11
LDFLAGS = -lm

TESTS = test_coinbase_sig test_metrics test_bech32m test_vardiff

all: $(TESTS)

test_coinbase_sig: test_coinbase_sig.c test_harness.h
	$(CC) $(CFLAGS) -o $@ $< $(LDFLAGS)

test_metrics: test_metrics.c test_harness.h
	$(CC) $(CFLAGS) -o $@ $< $(LDFLAGS)

test_bech32m: test_bech32m.c test_harness.h
	$(CC) $(CFLAGS) -o $@ $< $(LDFLAGS)

test_vardiff: test_vardiff.c test_harness.h
	$(CC) $(CFLAGS) -o $@ $< $(LDFLAGS)

test: $(TESTS)
	@echo ""
	@echo "===== Running TBG Unit Tests ====="
	@echo ""
	@FAILED=0; \
	for t in $(TESTS); do \
		if ./$$t; then \
			echo ""; \
		else \
			echo "  ^^^ $$t FAILED ^^^"; \
			echo ""; \
			FAILED=$$((FAILED + 1)); \
		fi; \
	done; \
	echo "===== All test suites complete ====="; \
	if [ $$FAILED -gt 0 ]; then \
		echo "  $$FAILED suite(s) FAILED"; \
		exit 1; \
	else \
		echo "  All passed!"; \
	fi

clean:
	rm -f $(TESTS)

.PHONY: all test clean
