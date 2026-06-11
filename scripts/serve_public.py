#!/usr/bin/env python3
"""Serveur HTTP LoL Coach — port 80, domaine public configure."""

from __future__ import annotations

import argparse
import base64
import json
import re
import subprocess
import sys
from pathlib import Path

from aiohttp import web

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG = ROOT / "config" / "server.json"
PUBLIC_DIR = ROOT / "public"
PATCH_DEFAULTS_PATH = PUBLIC_DIR / "data" / "patch-defaults.json"
PATCH_DEFAULTS_GIT_PATH = "public/data/patch-defaults.json"
ADMIN_PASSWORD = "24372"
CORS_ORIGIN_SUFFIXES = (".github.io", ".trycloudflare.com")
CORS_ORIGIN_CONTAINS = ("localhost", "127.0.0.1")


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


def cors_origin_allowed(origin: str) -> bool:
    if not origin:
        return False
    lowered = origin.lower()
    if any(lowered.endswith(suffix) for suffix in CORS_ORIGIN_SUFFIXES):
        return True
    return any(part in lowered for part in CORS_ORIGIN_CONTAINS)


def apply_cors(request: web.Request, response: web.StreamResponse) -> web.StreamResponse:
    origin = request.headers.get("Origin", "")
    if cors_origin_allowed(origin):
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Accept"
        response.headers["Vary"] = "Origin"
    return response


@web.middleware
async def cors_middleware(request: web.Request, handler):
    if request.method == "OPTIONS" and request.path == "/api/patch-defaults":
        return apply_cors(request, web.Response(status=204))
    response = await handler(request)
    if request.path == "/api/patch-defaults":
        apply_cors(request, response)
    return response


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


def parse_github_remote() -> tuple[str, str] | None:
    result = subprocess.run(
        ["git", "remote", "get-url", "origin"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        return None
    match = re.search(r"github\.com[:/]([^/]+)/([^/.]+)", result.stdout.strip())
    if not match:
        return None
    owner, repo = match.group(1), match.group(2).removesuffix(".git")
    return owner, repo


def run_cmd(args: list[str], **kwargs) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(args, cwd=ROOT, capture_output=True, text=True, check=False, **kwargs)
    except FileNotFoundError as exc:
        return subprocess.CompletedProcess(args, 127, "", str(exc))


def deploy_via_gh_api(content: str) -> dict:
    repo_info = parse_github_remote()
    if not repo_info:
        return {"deployed": False, "method": "gh-api", "error": "remote GitHub introuvable"}

    owner, repo = repo_info
    api_path = f"/repos/{owner}/{repo}/contents/{PATCH_DEFAULTS_GIT_PATH}"

    sha_result = run_cmd(["gh", "api", api_path, "-q", ".sha"])
    if sha_result.returncode == 127:
        return {"deployed": False, "method": "gh-api", "error": "gh CLI introuvable"}

    payload: dict[str, str] = {
        "message": "Update site patch defaults",
        "content": base64.b64encode(content.encode("utf-8")).decode("ascii"),
        "branch": "main",
    }
    if sha_result.returncode == 0 and sha_result.stdout.strip():
        payload["sha"] = sha_result.stdout.strip()

    put = run_cmd(
        ["gh", "api", api_path, "-X", "PUT", "--input", "-"],
        input=json.dumps(payload),
    )
    if put.returncode == 0:
        return {"deployed": True, "method": "gh-api"}
    return {"deployed": False, "method": "gh-api", "error": (put.stderr or put.stdout).strip()}


def deploy_via_git() -> dict:
    status = run_cmd(["git", "status", "--porcelain", PATCH_DEFAULTS_GIT_PATH])
    if status.returncode == 127:
        return {"deployed": False, "method": "git", "error": "git introuvable"}
    if status.returncode != 0:
        return {"deployed": False, "method": "git", "error": status.stderr.strip() or "git status failed"}
    if not status.stdout.strip():
        return {"deployed": True, "method": "git", "message": "already up to date"}

    add = run_cmd(["git", "add", PATCH_DEFAULTS_GIT_PATH])
    if add.returncode != 0:
        return {"deployed": False, "method": "git", "error": (add.stderr or add.stdout).strip()}

    commit = run_cmd(["git", "commit", "-m", "Update site patch defaults"])
    if commit.returncode != 0:
        return {"deployed": False, "method": "git", "error": (commit.stderr or commit.stdout).strip()}

    push = run_cmd(["git", "push", "origin", "main"])
    if push.returncode != 0:
        return {"deployed": False, "method": "git", "error": (push.stderr or push.stdout).strip()}
    return {"deployed": True, "method": "git"}


def deploy_patch_defaults(content: str) -> dict:
    gh = deploy_via_gh_api(content)
    if gh.get("deployed"):
        return gh
    git = deploy_via_git()
    if git.get("deployed"):
        return git
    return {
        "deployed": False,
        "method": "none",
        "errors": [gh.get("error"), git.get("error")],
        "message": "Fichier ecrit localement; verifiez gh auth login ou git push",
    }


def html_patch_defaults_response(ok: bool, title: str, detail: str) -> str:
    color = "#3d9e5a" if ok else "#e05238"
    return f"""<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title}</title>
  <style>
    body {{ font-family: system-ui, sans-serif; background: #0f1419; color: #e7ecf3; margin: 2rem; }}
    .card {{ max-width: 32rem; padding: 1.5rem; border: 1px solid #2a3441; border-radius: 12px; background: #151b24; }}
    h1 {{ color: {color}; font-size: 1.25rem; margin: 0 0 0.75rem; }}
    p {{ margin: 0; line-height: 1.5; color: #b8c4d4; }}
  </style>
</head>
<body>
  <div class="card">
    <h1>{title}</h1>
    <p>{detail}</p>
  </div>
</body>
</html>"""


async def parse_patch_defaults_body(request: web.Request) -> dict:
    content_type = request.content_type or ""
    if "application/json" in content_type:
        body = await request.json()
        if not isinstance(body, dict):
            raise ValueError("JSON object requis")
        return body

    if "application/x-www-form-urlencoded" in content_type or "multipart/form-data" in content_type:
        data = await request.post()
        defaults_raw = data.get("defaults")
        if isinstance(defaults_raw, bytes):
            defaults_raw = defaults_raw.decode("utf-8")
        defaults = json.loads(defaults_raw) if defaults_raw else None
        password = data.get("password")
        if isinstance(password, bytes):
            password = password.decode("utf-8")
        return {"password": password, "defaults": defaults}

    text = await request.text()
    if not text.strip():
        raise ValueError("corps vide")
    body = json.loads(text)
    if not isinstance(body, dict):
        raise ValueError("JSON object requis")
    return body


def wants_html_response(request: web.Request) -> bool:
    accept = request.headers.get("Accept", "")
    content_type = request.content_type or ""
    if "application/json" in accept and "text/html" not in accept:
        return False
    return "application/json" not in content_type


async def patch_defaults_handler(request: web.Request) -> web.Response:
    if request.method == "OPTIONS":
        return web.Response(status=204)

    try:
        body = await parse_patch_defaults_body(request)
    except (json.JSONDecodeError, ValueError) as exc:
        message = f"Corps invalide : {exc}"
        if wants_html_response(request):
            return web.Response(
                text=html_patch_defaults_response(False, "Erreur", message),
                status=400,
                content_type="text/html; charset=utf-8",
            )
        return web.json_response({"ok": False, "error": message}, status=400)

    password = str(body.get("password") or "")
    if password != ADMIN_PASSWORD:
        message = "Mot de passe incorrect"
        if wants_html_response(request):
            return web.Response(
                text=html_patch_defaults_response(False, "Refusé", message),
                status=403,
                content_type="text/html; charset=utf-8",
            )
        return web.json_response({"ok": False, "error": message}, status=403)

    defaults = body.get("defaults")
    if not isinstance(defaults, dict):
        message = "Champ defaults requis"
        if wants_html_response(request):
            return web.Response(
                text=html_patch_defaults_response(False, "Erreur", message),
                status=400,
                content_type="text/html; charset=utf-8",
            )
        return web.json_response({"ok": False, "error": message}, status=400)

    PATCH_DEFAULTS_PATH.parent.mkdir(parents=True, exist_ok=True)
    content = json.dumps(defaults, indent=2, ensure_ascii=False) + "\n"
    PATCH_DEFAULTS_PATH.write_text(content, encoding="utf-8")
    deploy = deploy_patch_defaults(content)

    if wants_html_response(request):
        if deploy.get("deployed"):
            detail = "Les nouveaux visiteurs verront ces réglages après le déploiement GitHub Pages (~1–2 min)."
        else:
            detail = deploy.get("message") or "Fichier enregistré localement; déploiement distant en attente."
        return web.Response(
            text=html_patch_defaults_response(True, "Défauts appliqués pour tous les visiteurs", detail),
            content_type="text/html; charset=utf-8",
        )

    return web.json_response({"ok": True, "written": True, "deploy": deploy})


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

    app = web.Application(middlewares=[cors_middleware, public_host_middleware])
    app["cfg"] = cfg
    app["allowed_hosts"] = allowed
    app["listen_port"] = listen_port
    app.router.add_get("/health", health_handler)
    app.router.add_route("POST", "/api/patch-defaults", patch_defaults_handler)
    app.router.add_route("OPTIONS", "/api/patch-defaults", patch_defaults_handler)
    app.router.add_get("/", index_handler)
    app.router.add_static("/", PUBLIC_DIR, show_index=False, follow_symlinks=False)

    public_url = cfg.get("publicUrl", f"http://{cfg['publicHost']}")
    print(f"LoL Coach — domaine public : {cfg['publicHost']}")
    print(f"Ecoute : http://{listen_host}:{listen_port}")
    print(f"URL    : {public_url}/")
    print(f"Health : http://localhost:{listen_port}/health")
    print(f"API    : http://localhost:{listen_port}/api/patch-defaults")
    print(f"Hosts  : {', '.join(sorted(allowed))}")
    print("Arret  : Ctrl+C")

    web.run_app(app, host=listen_host, port=listen_port, print=lambda msg: print(msg, flush=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
