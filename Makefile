# Simple helpers to serve simulations locally

PY ?= python3
HOST ?= 127.0.0.1
PORT ?= 8000

.PHONY: serve serve-solar serve-gr

serve:
	$(PY) serve.py --host $(HOST) --port $(PORT)

serve-solar:
	$(PY) serve.py --host $(HOST) --port $(PORT) --solar

serve-gr:
	$(PY) serve.py --host $(HOST) --port $(PORT) --gr

