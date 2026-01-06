from dotenv import load_dotenv
import os

load_dotenv()

class Config:
    MONGO_URI = os.getenv("MONGO_URI")
    
    # Parse ALLOW_ORIGINS từ string thành list
    # Hỗ trợ: "*" hoặc "url1,url2,url3"
    # Mặc định cho phép localhost:3000 (React dev server) và tất cả origins
    _allow_origins_str = os.getenv("ALLOW_ORIGINS", "*")
    if _allow_origins_str == "*":
        ALLOW_ORIGINS = ["*"]  # Cho phép tất cả origins
    else:
        origins = [origin.strip() for origin in _allow_origins_str.split(",")]
        if "http://localhost:3000" not in origins:
            origins.append("http://localhost:3000")
        ALLOW_ORIGINS = origins
    
    # Rainfall Interpolation API
 
    RAINFALL_API_URL = os.getenv("RAINFALL_API_URL", "https://quantrac.baonamdts.com")

config = Config()