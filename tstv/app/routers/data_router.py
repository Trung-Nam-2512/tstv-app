from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Query
from fastapi.responses import StreamingResponse
from ..dependencies import get_data_service
from ..services.data_service import DataService
from ..services.nasa_power_service import NasaPowerService
from ..models.data_models import UploadManualPayload
import io

router = APIRouter(prefix="/data", tags=["data"])

@router.post("/upload")
async def upload_file(file: UploadFile = File(...), data_service: DataService = Depends(get_data_service)):
    """Upload file CSV hoặc Excel"""
    return await data_service.upload_file(file)

@router.post("/upload_manual")
def upload_manual(payload: UploadManualPayload, data_service: DataService = Depends(get_data_service)):
    """Upload dữ liệu thủ công qua JSON"""
    return data_service.upload_manual(payload)

@router.get("/current")
def get_current_data(data_service: DataService = Depends(get_data_service)):
    """Lấy dữ liệu hiện tại"""
    if data_service.data is None:
        raise HTTPException(status_code=404, detail="Chưa có dữ liệu được tải")
    return {
        "data": data_service.data.to_dict(orient="records"),
        "main_column": data_service.main_column,
        "shape": data_service.data.shape
    }

@router.delete("/clear")
def clear_data(data_service: DataService = Depends(get_data_service)):
    """Xóa dữ liệu hiện tại"""
    data_service.data = None
    data_service.main_column = None
    return {"message": "Dữ liệu đã được xóa"}

@router.get("/nasa_power/clean")
async def get_nasa_power_data(
    lat: float = Query(..., description="Vĩ độ"),
    lon: float = Query(..., description="Kinh độ"),
    start_year: int = Query(..., description="Năm bắt đầu"),
    end_year: int = Query(..., description="Năm kết thúc")
):
    """
    Lấy dữ liệu nhiệt độ từ NASA POWER API và trả về file CSV
    
    Args:
        lat: Vĩ độ (-90 đến 90)
        lon: Kinh độ (-180 đến 180)
        start_year: Năm bắt đầu (từ 1980)
        end_year: Năm kết thúc (đến năm hiện tại)
        
    Returns:
        CSV file chứa dữ liệu nhiệt độ
    """
    nasa_service = NasaPowerService()
    
    try:
        # Fetch data from NASA POWER API
        df = await nasa_service.fetch_temperature_data(lat, lon, start_year, end_year)
        
        # Convert to CSV
        csv_string = nasa_service.convert_to_csv(df)
        
        # Create streaming response
        csv_bytes = csv_string.encode('utf-8')
        return StreamingResponse(
            io.BytesIO(csv_bytes),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=temperature_{lat}_{lon}_{start_year}_{end_year}.csv"
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi khi lấy dữ liệu: {str(e)}")
