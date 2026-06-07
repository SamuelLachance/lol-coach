#!/usr/bin/env python3
"""Serveur HTTP LoL Coach — port 80, domaine public configure."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from aiohttp import web

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG = ROOT / "config" / "server.json"
PUBLIC_DIR = ROOT / "public"


def load_config(path: Path) -> dict:
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def normalize_host(value: str) -> str:
    return value.split(":", 1)[0].strip().lower()


def build_allowed_hosts(cfg: dict) -> set[str]:
    hosts = {normalize_host(cfg["publicHost"])}
    for name in cfg.get("allowedHosts", []):
        hosts.add(normalize_host(name))
    return hosts


@web.middleware
async def public_host_middleware(request: web.Request, handler):
    cfg = request.app["cfg"]
    response = await handler(request)
    response.headers["X-Public-Host"] = cfg["publicHost"]
    response.headers["X-Public-Url"] = cfg["publicUrl"]
    return response


async def health_handler(request: web.Request) -> web.Response:
    cfg = request.app["cfg"]
    return web.json_response(
        {
            "ok": True,
            "publicHost": cfg["publicHost"],
            "publicUrl": cfg["publicUrl"],
            "requestHost": request.host,
            "port": request.app["listen_port"],
        }
    )


async def index_handler(request: web.Request) -> web.FileResponse:
    index = PUBLIC_DIR / "index.html"
    if not index.is_file():
        raise web.HTTPNotFound(text="index.html introuvable")
    return web.FileResponse(index)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Serveur public LoL Coach (aiohttp).")
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG, help="Fichier config JSON")
    parser.add_argument("--listen", help="Adresse d'ecoute (override config)")
    parser.add_argument("--port", type=int, help="Port (override config)")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if not args.config.is_file():
        print(f"Config introuvable : {args.config}", file=sys.stderr)
        return 1
    if not PUBLIC_DIR.is_dir():
        print(f"Dossier public introuvable : {PUBLIC_DIR}", file=sys.stderr)
        return 1

    cfg = load_config(args.config)
    listen_host = args.listen or cfg.get("listenHost", "0.0.0.0")
    listen_port = args.port or cfg.get("listenPort", 80)
    allowed = build_allowed_hosts(cfg)

    app = web.Application(middlewares=[public_host_middleware])
    app["cfg"] = cfg
    app["allowed_hosts"] = allowed
    app["listen_port"] = listen_port
    app.router.add_get("/health", health_handler)
    app.router.add_get("/", index_handler)
    app.router.add_static("/", PUBLIC_DIR, show_index=False, follow_symlinks=False)

    public_url = cfg.get("publicUrl", f"http://{cfg['publicHost']}")
    print(f"LoL Coach — domaine public : {cfg['publicHost']}")
    print(f"Ecoute : http://{listen_host}:{listen_port}")
    print(f"URL    : {public_url}/")
    print(f"Health : http://localhost:{listen_port}/health")
    print(f"Hosts  : {', '.join(sorted(allowed))}")
    print("Arret  : Ctrl+C")

    web.run_app(app, host=listen_host, port=listen_port, print=lambda msg: print(msg, flush=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
