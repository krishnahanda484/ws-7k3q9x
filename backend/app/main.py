from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.core.config import get_settings
from app.core.errors import AppError, register_handlers
from app.core.logging import configure_logging
from app.data.store import load_repository

log = logging.getLogger("windsight")


@asynccontextmanager
async def lifespan(app: FastAPI):
    s = get_settings()
    try:
        app.state.repo = load_repository(s.data_dir)
    except AppError as exc:  # keep serving /api/health so the problem is diagnosable
        app.state.repo = None
        app.state.repo_error = exc.message
        log.error("data not loaded: %s", exc.message)
    yield


def create_app() -> FastAPI:
    s = get_settings()
    configure_logging(s.log_level)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    app = FastAPI(
        title="WindSight API",
        version="1.0.0",
        description="UK wind forecast intelligence over Elexon FUELHH (actuals) and WINDFOR (forecasts). "
                    "Forecast cutoffs are enforced to prevent look-ahead bias.",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware, allow_origins=s.cors_origin_list, allow_methods=["GET"], allow_headers=["*"],
    )
    register_handlers(app)
    app.include_router(router)
    return app


app = create_app()
