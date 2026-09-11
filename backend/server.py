from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware
from pathlib import Path
from dotenv import load_dotenv
import os
import logging

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from db import client  # noqa: E402
from auth import router as auth_router  # noqa: E402
from routers_hospitals import router as hospitals_router  # noqa: E402
from routers_appointments import router as appointments_router  # noqa: E402
from routers_medical import router as medical_router  # noqa: E402
from routers_reports import router as reports_router  # noqa: E402
from routers_ai import router as ai_router  # noqa: E402
from routers_misc import router as misc_router  # noqa: E402
from routers_files import router as files_router  # noqa: E402

app = FastAPI(title="SmartCare AI")

for r in [auth_router, hospitals_router, appointments_router, medical_router, reports_router, ai_router, misc_router, files_router]:
    app.include_router(r, prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def create_indexes():
    from db import db
    await db.users.create_index("user_id", unique=True)
    await db.users.create_index("email", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.hospitals.create_index("hospital_id", unique=True)
    await db.doctors.create_index("doctor_id", unique=True)
    await db.doctors.create_index("email", unique=True)
    await db.appointments.create_index([("doctor_id", 1), ("date", 1), ("time", 1)])
    await db.appointments.create_index("patient_id")
    await db.notifications.create_index("user_id")
    await db.lab_reports.create_index("patient_id")
    await db.documents.create_index("patient_id")
    try:
        import asyncio
        from storage import init_storage
        await asyncio.to_thread(init_storage)
        logger.info("Object storage initialized")
    except Exception as e:
        logger.error("Storage init failed (uploads will retry on demand): %s", e)
    logger.info("SmartCare AI started, indexes ensured")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
