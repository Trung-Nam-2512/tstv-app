from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .config import config
from .routers.data_router import router as data_router
from .routers.stats_router import router as stats_router
from .routers.analysis_router import router as analysis_router
from .routers.external_router import router as external_router
from .routers.rainfall_router import router as rainfall_router
import logging
from motor.motor_asyncio import AsyncIOMotorClient
from contextlib import asynccontextmanager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Quản lý lifecycle của ứng dụng: startup và shutdown"""
    # Startup
    logger.info("Starting up application...")
    if config.MONGO_URI:
        try:
            import asyncio
            # Set timeout cho MongoDB connection (5 seconds)
            app.state.mongo_client = AsyncIOMotorClient(
                config.MONGO_URI,
                serverSelectionTimeoutMS=5000  # 5 seconds timeout
            )
            # Test connection với timeout
            await asyncio.wait_for(
                app.state.mongo_client.admin.command('ping'),
                timeout=5.0
            )
            logger.info("MongoDB connected successfully")
        except asyncio.TimeoutError:
            logger.warning("MongoDB connection timeout - continuing without MongoDB")
            app.state.mongo_client = None
        except Exception as e:
            logger.warning(f"MongoDB connection failed: {e}")
            app.state.mongo_client = None
    else:
        logger.info("MongoDB URI not provided, skipping MongoDB connection")
        app.state.mongo_client = None
    
    logger.info("Application startup complete.")
    
    yield
    
    # Shutdown
    logger.info("Shutting down application...")
    if hasattr(app.state, 'mongo_client') and app.state.mongo_client:
        app.state.mongo_client.close()
        logger.info("MongoDB connection closed")

app = FastAPI(
    title="Phần mềm phân tích dữ liệu khí tượng thủy văn",
    description="API phân tích tần suất dữ liệu khí tượng thủy văn",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration - Đảm bảo frontend có thể truy cập API
# Nếu ALLOW_ORIGINS = ["*"], thì không thể dùng allow_credentials=True
# Phải chọn một trong hai: "*" hoặc specific origins với credentials
if config.ALLOW_ORIGINS == ["*"]:
    logger.info("CORS configured: Allowing all origins (*)")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,  # Không thể dùng credentials với "*"
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    logger.info(f"CORS configured with allowed origins: {config.ALLOW_ORIGINS}")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.ALLOW_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["*"],
    )

app.include_router(data_router)
app.include_router(stats_router)
app.include_router(analysis_router)
app.include_router(external_router)
app.include_router(rainfall_router)