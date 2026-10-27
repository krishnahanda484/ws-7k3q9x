"""Centralised exception types and handlers. Clients never see stack traces."""
from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

log = logging.getLogger("windsight.errors")


class AppError(Exception):
    def __init__(self, status_code: int, code: str, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


class DataUnavailableError(AppError):
    def __init__(self, message: str):
        super().__init__(503, "data_unavailable", message)


class UpstreamError(Exception):
    """Raised by the Elexon client after retries are exhausted."""


def _body(code: str, message: str, details=None) -> dict:
    err = {"code": code, "message": message}
    if details:
        err["details"] = details
    return {"error": err}


def register_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError):
        return JSONResponse(status_code=exc.status_code, content=_body(exc.code, exc.message))

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError):
        details = [
            {"field": ".".join(str(p) for p in e["loc"] if p != "query"), "issue": e["msg"]}
            for e in exc.errors()
        ]
        return JSONResponse(
            status_code=422, content=_body("invalid_parameters", "Invalid request parameters.", details)
        )

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception):
        log.exception("unhandled error")  # full trace stays in server logs only
        return JSONResponse(
            status_code=500, content=_body("internal_error", "An unexpected error occurred.")
        )
