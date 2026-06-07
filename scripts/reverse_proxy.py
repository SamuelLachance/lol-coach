#!/usr/bin/env python3
"""Reverse HTTP proxy (aiohttp) : port public -> serveur app local."""

from __future__ import annotations

import argparse
import sys
from urllib.parse import urljoin, urlparse

from aiohttp import ClientSession, web

HOP_BY_HOP = frozenset(
    {
        "connection",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "te",
        "trailers",
        "transfer-encoding",
        "upgrade",
        "host",
    }
)


def filter_headers(headers) -> dict[str, str]:
    return {k: v for k, v in headers.items() if k.lower() not in HOP_BY_HOP}


async def proxy_handler(request: web.Request) -> web.StreamResponse:
    target_base: str = request.app["target_base"]
    url = urljoin(target_base, str(request.rel_url))
    session: ClientSession = request.app["client_session"]

    body = await request.read() if request.can_read_body else None
    headers = filter_headers(request.headers)

    async with session.request(
        request.method,
        url,
        headers=headers,
        data=body,
        allow_redirects=False,
    ) as upstream:
        response = web.StreamResponse(
            status=upstream.status,
            headers=filter_headers(upstream.headers),
        )
        await response.prepare(request)
        async for chunk in upstream.content.iter_chunked(65536):
            await response.write(chunk)
        return response


async def on_startup(app: web.Application) -> None:
    app["client_session"] = ClientSession()


async def on_cleanup(app: web.Application) -> None:
    await app["client_session"].close()


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Reverse proxy HTTP vers le serveur LoL Coach.")
    parser.add_argument("--listen", default="0.0.0.0", help="Adresse d'écoute (défaut: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=80, help="Port public (défaut: 80)")
    parser.add_argument(
        "--target",
        default="http://127.0.0.1:8081",
        help="URL du serveur app (défaut: http://127.0.0.1:8081)",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    target = args.target.rstrip("/") + "/"
    parsed = urlparse(target)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        print(f"URL cible invalide : {args.target}", file=sys.stderr)
        return 1

    app = web.Application()
    app["target_base"] = target
    app.router.add_route("*", r"/{path_info:.*}", proxy_handler)
    app.on_startup.append(on_startup)
    app.on_cleanup.append(on_cleanup)

    print(f"Proxy aiohttp : http://{args.listen}:{args.port} -> {args.target}")
    web.run_app(app, host=args.listen, port=args.port, print=lambda msg: print(msg, flush=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
