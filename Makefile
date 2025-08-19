# Fog Renderer Build System
# Requires: npm, node, python3, uglify-js, html-minifier, lighthouse (optional)

# Variables
SRC_DIR = .
BUILD_DIR = build
DIST_DIR = dist
PERF_DIR = performance-reports

# Source files
JS_SRC = fog-renderer.js fog-renderer-optimized.js

# Tools (install with: npm install -g uglify-js)
UGLIFY = npx uglify-js
PYTHON = python3
BROWSER = open # Use 'xdg-open' on Linux, 'start' on Windows

# Default target
.PHONY: all
all: clean build

# Create necessary directories
.PHONY: dirs
dirs:
	@mkdir -p $(BUILD_DIR) $(DIST_DIR) $(PERF_DIR)

# Clean build artifacts
.PHONY: clean
clean:
	@echo "🧹 Cleaning build artifacts..."
	@rm -rf $(BUILD_DIR) $(DIST_DIR) $(PERF_DIR)

# Build minified JavaScript
.PHONY: build-js
build-js: dirs
	@echo "📦 Minifying JavaScript files..."
	@for file in $(JS_SRC); do \
		echo "  Minifying $$file..."; \
		$(UGLIFY) $$file \
			--compress drop_console=true,drop_debugger=true,pure_funcs=['console.log'] \
			--mangle toplevel \
			--output $(BUILD_DIR)/$${file%.js}.min.js \
			2>/dev/null || echo "    ⚠️  Failed to minify $$file"; \
	done
	@echo "  ✅ JavaScript minification complete"

# Combined build target
.PHONY: build
build: build-js
	@echo "🎉 Build complete!"
	@echo "📊 File size comparison:"
	@echo "  Original:"
	@du -sh *.js *.html 2>/dev/null | head -5
	@echo "  Minified:"
	@du -sh $(BUILD_DIR)/*.min.* 2>/dev/null | head -5

# Create production distribution
.PHONY: dist
dist: build
	@echo "📦 Creating production distribution..."
	@cp $(BUILD_DIR)/fog-renderer.min.js $(DIST_DIR)/fog.min.js
	@cp index.html $(DIST_DIR)/index.html
	@echo "  ✅ Distribution created in $(DIST_DIR)/"
	@echo "  📁 Total size: $$(du -sh $(DIST_DIR) | cut -f1)"

# Run local development server
.PHONY: serve
serve:
	@echo "🚀 Starting development server on http://localhost:8000"
	@$(PYTHON) -m http.server 8000

# Run production server with minified files
.PHONY: serve-prod
serve-prod: build
	@echo "🚀 Starting production server on http://localhost:8001"
	@cd $(BUILD_DIR) && $(PYTHON) -m http.server 8001

# Performance testing
.PHONY: perf-test
perf-test: dirs
	@echo "⚡ Running performance tests..."
	@echo "🔍 Testing original renderer..."
	@node -e " \
		const startTime = Date.now(); \
		const testIterations = 1000000; \
		let sum = 0; \
		for (let i = 0; i < testIterations; i++) { \
			sum += Math.sin(i) * Math.cos(i); \
		} \
		const elapsed = Date.now() - startTime; \
		console.log('  Baseline performance: ' + elapsed + 'ms for ' + testIterations + ' iterations'); \
		console.log('  Operations per second: ' + Math.round(testIterations / elapsed * 1000)); \
	"

# Memory profiling
.PHONY: memory-test
memory-test:
	@echo "💾 Running memory analysis..."
	@node --expose-gc -e " \
		const used = process.memoryUsage(); \
		console.log('Memory usage:'); \
		for (let key in used) { \
			console.log('  ' + key + ': ' + Math.round(used[key] / 1024 / 1024 * 100) / 100 + ' MB'); \
		} \
	"

# Bundle size analysis
.PHONY: size-analysis
size-analysis: build
	@echo "📊 Bundle Size Analysis"
	@echo "========================"
	@echo "Original files:"
	@wc -c fog-renderer.js index.html | tail -1 | awk '{print "  Total: " $$1 " bytes"}'
	@echo ""
	@echo "Minified files:"
	@wc -c $(BUILD_DIR)/*.min.* 2>/dev/null | tail -1 | awk '{print "  Total: " $$1 " bytes"}'
	@echo ""
	@echo "Compression ratio:"
	@echo "  $$(echo "scale=2; 100 - ($$(wc -c $(BUILD_DIR)/fog-renderer.min.js | awk '{print $$1}') * 100 / $$(wc -c fog-renderer.js | awk '{print $$1}'))" | bc)% reduction"

# Lighthouse performance audit (requires Chrome and lighthouse CLI)
.PHONY: lighthouse
lighthouse: serve-prod
	@echo "🔦 Running Lighthouse audit..."
	@npx lighthouse http://localhost:8001/index.html \
		--output json \
		--output-path $(PERF_DIR)/lighthouse-report.json \
		--only-categories=performance \
		--chrome-flags="--headless" \
		2>/dev/null || echo "⚠️  Lighthouse not installed. Run: npm install -g lighthouse"
	@echo "  ✅ Report saved to $(PERF_DIR)/lighthouse-report.json"

# Browser performance test
.PHONY: browser-test
browser-test:
	@echo "🌐 Opening performance comparison in browser..."
	@$(BROWSER) performance-test.html

# Watch for changes and rebuild
.PHONY: watch
watch:
	@echo "👀 Watching for changes..."
	@while true; do \
		$(MAKE) build; \
		echo "⏳ Waiting for changes..."; \
		sleep 2; \
	done

# Install dependencies
.PHONY: install-deps
install-deps:
	@echo "📦 Installing build dependencies..."
	npm install -g uglify-js
	@echo "  ✅ Dependencies installed"

# Full test suite
.PHONY: test
test: build perf-test memory-test size-analysis
	@echo "✅ All tests complete!"

# CI/CD pipeline
.PHONY: ci
ci: clean install-deps build test dist
	@echo "🚀 CI pipeline complete!"

# Development workflow
.PHONY: dev
dev:
	@echo "🔧 Starting development environment..."
	@$(MAKE) serve &
	@$(MAKE) watch &
	@$(BROWSER) http://localhost:8000
	@wait

# Production deployment
.PHONY: deploy
deploy: dist
	@echo "🚀 Ready for deployment!"
	@echo "Files to deploy:"
	@ls -la $(DIST_DIR)/

# Help target
.PHONY: help
help:
	@echo "Fog Renderer Build System"
	@echo "========================"
	@echo ""
	@echo "Available targets:"
	@echo "  make all          - Clean and build everything"
	@echo "  make build        - Build minified JS and HTML"
	@echo "  make dist         - Create production distribution"
	@echo "  make serve        - Start development server"
	@echo "  make serve-prod   - Start production server"
	@echo "  make test         - Run all tests"
	@echo "  make perf-test    - Run performance benchmarks"
	@echo "  make memory-test  - Analyze memory usage"
	@echo "  make size-analysis - Analyze bundle sizes"
	@echo "  make lighthouse   - Run Lighthouse audit"
	@echo "  make browser-test - Open performance comparison"
	@echo "  make watch        - Watch and rebuild on changes"
	@echo "  make install-deps - Install build dependencies"
	@echo "  make ci           - Run full CI pipeline"
	@echo "  make dev          - Start development environment"
	@echo "  make deploy       - Prepare for deployment"
	@echo "  make clean        - Remove build artifacts"
	@echo "  make help         - Show this help message"
	@echo ""
	@echo "Requirements:"
	@echo "  - Node.js and npm"
	@echo "  - Python 3 (for local server)"
	@echo "  - uglify-js (run 'make install-deps')"