from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional
import logging
from datetime import datetime
from ..models.data_models import (
    RainfallInterpolateRequest,
    RainfallAnalyzeRequest,
    RainfallInterpolateResponse,
    RainfallAnalysisData,
    RainfallQueryHistory
)
from ..services.rainfall_service import RainfallService
from ..services.data_service import DataService
from ..services.mongo_service import MongoService
from ..dependencies import get_data_service, get_mongo_service

router = APIRouter(prefix="/rainfall", tags=["rainfall"])
logger = logging.getLogger(__name__)

def get_rainfall_service() -> RainfallService:
    """Dependency để lấy RainfallService"""
    return RainfallService()

@router.post("/interpolate", response_model=RainfallInterpolateResponse)
async def interpolate_rainfall(
    request: RainfallInterpolateRequest,
    rainfall_service: RainfallService = Depends(get_rainfall_service)
):
    """
    Gọi API nội suy lượng mưa
    
    - **latitude**: Vĩ độ (8-24)
    - **longitude**: Kinh độ (102-110)
    - **days**: Số ngày lấy dữ liệu (mặc định 30)
    - **field**: Trường dữ liệu (mặc định "total_24h")
    - **k**: Số trạm gần nhất (mặc định 8)
    - **power**: Power IDW (mặc định 2.0)
    - **stats**: Danh sách statistics cần tính
    
    Returns raw response từ Rainfall Interpolation API
    """
    logger.info(f"POST /rainfall/interpolate - lat={request.latitude}, lng={request.longitude}")
    
    try:
        response = await rainfall_service.fetch_rainfall_data(request)
        return response
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in interpolate_rainfall: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/analyze")
async def analyze_rainfall(
    request: RainfallAnalyzeRequest,
    rainfall_service: RainfallService = Depends(get_rainfall_service),
    data_service: DataService = Depends(get_data_service),
    mongo_service: MongoService = Depends(get_mongo_service)
):
    """
    Gọi API nội suy lượng mưa và tự động load vào DataService để phân tích
    
    Workflow:
    1. Gọi Rainfall API với parameters
    2. Transform dữ liệu theo data_field đã chọn
    3. Validate confidence/quality
    4. Load vào DataService (tương tự upload file)
    5. Lưu lịch sử query vào MongoDB
    6. Trả về dữ liệu đã transform + warnings nếu có
    
    Parameters:
    - **data_field**: Trường dữ liệu để phân tích
      - "rainfall": Dùng timeSeries[].rainfall (giá trị nội suy)
      - "max": Dùng statistics.max[] (max từ k trạm)
      - "min": Dùng statistics.min[]
      - "mean": Dùng statistics.mean[]
      - "sum": Dùng statistics.sum[]
    """
    logger.info(f"POST /rainfall/analyze - lat={request.latitude}, lng={request.longitude}, data_field={request.data_field}")
    
    try:
        # Bước 1: Gọi Rainfall API
        interpolate_request = RainfallInterpolateRequest(
            latitude=request.latitude,
            longitude=request.longitude,
            days=request.days,
            startDate=request.startDate,
            endDate=request.endDate,
            field=request.field,
            k=request.k,
            power=request.power,
            stats=request.stats
        )
        
        api_response = await rainfall_service.fetch_rainfall_data(interpolate_request)
        
        # Bước 2: Transform dữ liệu
        analysis_data = rainfall_service.transform_for_analysis(
            api_response,
            data_field=request.data_field,
            min_threshold=request.min_threshold
        )
        
        # Bước 3: Phân tích chất lượng dữ liệu (comprehensive)
        request_params = {
            "days": request.days,
            "data_field": request.data_field,
            "min_threshold": request.min_threshold,
            "k": request.k,
            "power": request.power
        }
        
        quality_assessment = rainfall_service.analyze_data_quality(
            analysis_data.data,
            api_response.metadata.model_dump(),
            request_params
        )
        
        # Bước 4: Load vào DataService
        import pandas as pd
        df = pd.DataFrame(analysis_data.data)
        
        # QUAN TRỌNG: Với dữ liệu rainfall, mỗi ngày = 1 năm riêng
        # KHÔNG cần process_data vì:
        # - Không có Month (đã đúng format)
        # - Mỗi Year đã là 1 giá trị duy nhất
        # - process_data sẽ tạo 12 tháng cho mỗi Year → sai!
        # Chỉ cần validate và load trực tiếp
        
        # Validate dữ liệu
        if "Year" not in df.columns:
            raise HTTPException(status_code=400, detail="Dữ liệu phải chứa cột 'Year'")
        if analysis_data.main_column not in df.columns:
            raise HTTPException(status_code=400, detail=f"Cột '{analysis_data.main_column}' không tồn tại")
        
        # Convert to numeric
        df["Year"] = pd.to_numeric(df["Year"], errors="coerce")
        df[analysis_data.main_column] = pd.to_numeric(df[analysis_data.main_column], errors="coerce")
        
        # Remove NaN
        df = df.dropna(subset=["Year", analysis_data.main_column])
        
        # Clear old data và load new data
        # Đảm bảo dữ liệu cũ được xóa hoàn toàn trước khi load dữ liệu mới
        data_service.data = None
        data_service.main_column = None
        
        # Load dữ liệu mới (KHÔNG qua process_data)
        data_service.data = df
        data_service.main_column = analysis_data.main_column
        
        # Log chi tiết để debug
        logger.info(f"=== DATA LOADED INTO DATASERVICE (RAINFALL) ===")
        logger.info(f"Rows: {len(df)}, Columns: {list(df.columns)}")
        logger.info(f"Main column: {analysis_data.main_column}")
        logger.info(f"Year range: {df['Year'].min()} - {df['Year'].max()}")
        logger.info(f"Data sample (first 5 rows):\n{df.head()}")
        logger.info(f"Data statistics:\n{df.describe()}")
        logger.info(f"Value range: min={df[analysis_data.main_column].min():.2f}, max={df[analysis_data.main_column].max():.2f}, mean={df[analysis_data.main_column].mean():.2f}")
        logger.info(f"=====================================")
        
        # Bước 5: Lưu lịch sử vào MongoDB
        try:
            query_history = rainfall_service.create_query_history(
                interpolate_request,
                request.data_field,
                api_response,
                user_id=None  # TODO: Lấy từ auth sau
            )
            
            # Lưu vào MongoDB
            history_dict = query_history.model_dump()
            history_dict["_id"] = str(datetime.utcnow().timestamp())
            
            if mongo_service.client:
                db = mongo_service.client["hydro_db"]
                collection = db["rainfall_queries"]
                await collection.insert_one(history_dict)
                logger.info(f"Query history saved to MongoDB")
        except Exception as e:
            # Không fail nếu lưu MongoDB thất bại
            logger.warning(f"Failed to save query history: {str(e)}")
        
        # Bước 6: Trả về kết quả với quality assessment
        return {
            "status": "success",
            "message": "Dữ liệu đã được load và sẵn sàng phân tích",
            "data": analysis_data.data,
            "main_column": analysis_data.main_column,
            "source": analysis_data.source,
            "metadata": api_response.metadata.model_dump(),
            "quality_assessment": quality_assessment,
            "shape": {
                "rows": len(analysis_data.data),
                "columns": 2,  # Year, Rainfall
                "total_days": api_response.metadata.totalDays,
                "filtered_out": api_response.metadata.totalDays - len(analysis_data.data)
            },
            "parameters_used": request_params
        }
        
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error in analyze_rainfall: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/history")
async def get_query_history(
    limit: int = Query(10, ge=1, le=100, description="Số lượng records"),
    skip: int = Query(0, ge=0, description="Số records bỏ qua"),
    mongo_service: MongoService = Depends(get_mongo_service)
):
    """
    Lấy lịch sử các queries đã thực hiện
    
    - **limit**: Số lượng records trả về (mặc định 10)
    - **skip**: Số records bỏ qua (cho pagination)
    
    Returns danh sách queries, sắp xếp theo thời gian mới nhất
    """
    logger.info(f"GET /rainfall/history - limit={limit}, skip={skip}")
    
    try:
        if not mongo_service.client:
            raise HTTPException(
                status_code=503,
                detail="MongoDB không khả dụng. Không thể lấy lịch sử."
            )
        
        db = mongo_service.client["hydro_db"]
        collection = db["rainfall_queries"]
        
        # Query MongoDB
        cursor = collection.find().sort("timestamp", -1).skip(skip).limit(limit)
        history = await cursor.to_list(length=limit)
        
        # Convert ObjectId to string
        for record in history:
            if "_id" in record:
                record["_id"] = str(record["_id"])
        
        # Count total
        total = await collection.count_documents({})
        
        return {
            "status": "success",
            "total": total,
            "limit": limit,
            "skip": skip,
            "data": history
        }
        
    except Exception as e:
        logger.error(f"Error getting query history: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/history/{query_id}")
async def delete_query_history(
    query_id: str,
    mongo_service: MongoService = Depends(get_mongo_service)
):
    """
    Xóa một query history theo ID
    
    - **query_id**: ID của query cần xóa
    """
    logger.info(f"DELETE /rainfall/history/{query_id}")
    
    try:
        if not mongo_service.client:
            raise HTTPException(
                status_code=503,
                detail="MongoDB không khả dụng."
            )
        
        db = mongo_service.client["hydro_db"]
        collection = db["rainfall_queries"]
        
        result = await collection.delete_one({"_id": query_id})
        
        if result.deleted_count == 0:
            raise HTTPException(
                status_code=404,
                detail=f"Không tìm thấy query với ID: {query_id}"
            )
        
        return {
            "status": "success",
            "message": f"Đã xóa query {query_id}"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting query history: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/suggest-params")
async def suggest_optimal_parameters(
    request: RainfallAnalyzeRequest,
    rainfall_service: RainfallService = Depends(get_rainfall_service)
):
    """
    Đề xuất parameters tối ưu dựa trên phân tích dữ liệu ban đầu
    
    Workflow:
    1. Gọi API với parameters hiện tại
    2. Phân tích chất lượng dữ liệu
    3. Đề xuất parameters tối ưu để cải thiện
    
    Use case: User chạy thử với params ban đầu, hệ thống suggest params tốt hơn
    
    Returns:
        - current_result: Kết quả với params hiện tại
        - quality_assessment: Đánh giá chất lượng
        - suggestions: Các đề xuất cải thiện
        - optimal_config: Config tối ưu đề xuất
    """
    logger.info(f"POST /rainfall/suggest-params - lat={request.latitude}, lng={request.longitude}")
    
    try:
        # Bước 1: Gọi API với params hiện tại
        interpolate_request = RainfallInterpolateRequest(
            latitude=request.latitude,
            longitude=request.longitude,
            days=request.days,
            startDate=request.startDate,
            endDate=request.endDate,
            field=request.field,
            k=request.k,
            power=request.power,
            stats=request.stats
        )
        
        api_response = await rainfall_service.fetch_rainfall_data(interpolate_request)
        
        # Bước 2: Transform data
        analysis_data = rainfall_service.transform_for_analysis(
            api_response,
            data_field=request.data_field,
            min_threshold=request.min_threshold
        )
        
        # Bước 3: Analyze quality
        current_params = {
            "days": request.days,
            "data_field": request.data_field,
            "min_threshold": request.min_threshold,
            "k": request.k,
            "power": request.power
        }
        
        quality_assessment = rainfall_service.analyze_data_quality(
            analysis_data.data,
            api_response.metadata.model_dump(),
            current_params
        )
        
        # Bước 4: Get optimal suggestions
        optimal_suggestions = rainfall_service.get_optimal_parameters(
            analysis_data.data,
            api_response.metadata.model_dump(),
            current_params
        )
        
        return {
            "status": "success",
            "message": "Đã phân tích và đề xuất parameters tối ưu",
            "current_result": {
                "parameters": current_params,
                "data_points": len(analysis_data.data),
                "quality_score": quality_assessment["quality_score"],
                "is_suitable": quality_assessment["is_suitable_for_analysis"]
            },
            "quality_assessment": quality_assessment,
            "optimization": optimal_suggestions,
            "recommendation": {
                "should_rerun": optimal_suggestions["has_suggestions"],
                "message": (
                    "Dữ liệu hiện tại chưa tối ưu. Khuyến nghị chạy lại với config được đề xuất."
                    if optimal_suggestions["has_suggestions"]
                    else "Dữ liệu hiện tại đã khá tốt, có thể tiến hành phân tích."
                )
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in suggest_optimal_parameters: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/health")
def check_rainfall_api_health(
    rainfall_service: RainfallService = Depends(get_rainfall_service)
):
    """
    Kiểm tra kết nối đến Rainfall Interpolation API
    
    Returns trạng thái của API
    """
    return {
        "status": "ok",
        "rainfall_api_url": rainfall_service.api_url,
        "endpoint": rainfall_service.api_endpoint
    }

