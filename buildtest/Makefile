# ITDLUPanel Build & Deploy Makefile
# Convenience wrapper for panel-build.sh

.PHONY: help build restart stop status logs health

PROJECT_DIR := $(shell dirname $(realpath $(lastword $(MAKEFILE_LIST))))/..
BUILD_SCRIPT := $(shell dirname $(realpath $(lastword $(MAKEFILE_LIST))))/panel-build.sh

help:
	@echo "ITDLUPanel Build & Deploy"
	@echo ""
	@echo "Usage: make <target>"
	@echo ""
	@echo "Targets:"
	@echo "  build    - Build the panel binary"
	@echo "  restart  - Build and restart the panel (default)"
	@echo "  stop     - Stop the panel"
	@echo "  status   - Show panel status"
	@echo "  logs     - Show panel logs (last 50 lines)"
	@echo "  health   - Check panel health"
	@echo ""

build:
	@chmod +x $(BUILD_SCRIPT)
	@$(BUILD_SCRIPT) build

restart:
	@chmod +x $(BUILD_SCRIPT)
	@$(BUILD_SCRIPT) restart

start:
	@chmod +x $(BUILD_SCRIPT)
	@$(BUILD_SCRIPT) start

stop:
	@chmod +x $(BUILD_SCRIPT)
	@$(BUILD_SCRIPT) stop

status:
	@chmod +x $(BUILD_SCRIPT)
	@$(BUILD_SCRIPT) status

logs:
	@chmod +x $(BUILD_SCRIPT)
	@$(BUILD_SCRIPT) logs

health:
	@chmod +x $(BUILD_SCRIPT)
	@$(BUILD_SCRIPT) health
