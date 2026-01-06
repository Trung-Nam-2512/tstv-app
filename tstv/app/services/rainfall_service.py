import httpx
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime
from fastapi import HTTPException
from ..config import config
from ..models.data_models import (
    RainfallInterpolateRequest,
    RainfallInterpolateResponse,
    RainfallAnalysisData,
    RainfallQueryHistory
)
from .rainfall_analyzer import RainfallDataAnalyzer

logger = logging.getLogger(__name__)

class RainfallService:
    """Service để gọi Rainfall Interpolation API và xử lý dữ liệu"""
    
    def __init__(self):
        self.api_url = config.RAINFALL_API_URL
        self.api_endpoint = f"{self.api_url}/api/rainfall/interpolate"
        self.analyzer = RainfallDataAnalyzer()
    
    async def fetch_rainfall_data(self, request: RainfallInterpolateRequest) -> RainfallInterpolateResponse:
        """
        Gọi API nội suy lượng mưa
        
        Args:
            request: RainfallInterpolateRequest
            
        Returns:
            RainfallInterpolateResponse
            
        Raises:
            HTTPException: Khi API call thất bại
        """
        try:
            # SSL verification enabled by default for HTTPS
            async with httpx.AsyncClient(timeout=30.0, verify=True) as client:
                logger.info(f"Calling rainfall API: {self.api_endpoint}")
                logger.info(f"Request params: lat={request.latitude}, lng={request.longitude}, days={request.days}")
                
                response = await client.post(
                    self.api_endpoint,
                    json=request.model_dump(exclude_none=True)
                )
                
                if response.status_code != 200:
                    logger.error(f"API returned status {response.status_code}: {response.text}")
                    raise HTTPException(
                        status_code=response.status_code,
                        detail=f"Rainfall API error: {response.text}"
                    )
                
                data = response.json()
                logger.info(f"API response received: {len(data.get('timeSeries', []))} data points")
                
                return RainfallInterpolateResponse(**data)
                
        except httpx.TimeoutException:
            logger.error("Rainfall API timeout")
            raise HTTPException(
                status_code=504,
                detail="Rainfall API timeout. Vui lòng thử lại sau."
            )
        except httpx.RequestError as e:
            error_type = type(e).__name__
            error_msg = str(e)
            logger.error(f"Rainfall API request error ({error_type}): {error_msg}")
            logger.error(f"API URL: {self.api_endpoint}")
            
            # Provide more helpful error messages
            if "connection" in error_msg.lower() or "refused" in error_msg.lower() or "failed" in error_msg.lower():
                detail = (
                    f"Không thể kết nối đến Rainfall API tại {self.api_url}. "
                    f"Kiểm tra: (1) API có đang chạy không? "
                    f"(2) URL có đúng không? (3) Firewall có block không? "
                    f"Chi tiết: {error_msg}"
                )
            else:
                detail = f"Lỗi kết nối đến Rainfall API: {error_msg}"
            
            raise HTTPException(
                status_code=503,
                detail=detail
            )
        except Exception as e:
            logger.error(f"Unexpected error calling rainfall API: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"Lỗi khi gọi Rainfall API: {str(e)}"
            )
    
    def transform_for_analysis(
        self, 
        api_response: RainfallInterpolateResponse,
        data_field: str = "rainfall",
        min_threshold: float = 0.0
    ) -> RainfallAnalysisData:
        """
        Transform dữ liệu từ API thành format phù hợp cho phân tích tần suất
        
        Format đầu ra:
        - Mỗi ngày = 1 năm (giả định)
        - Không có cột Month
        - Cột dữ liệu: "Rainfall"
        
        Args:
            api_response: Response từ API
            data_field: Trường dữ liệu để dùng ('rainfall', 'max', 'min', 'mean', 'sum')
            
        Returns:
            RainfallAnalysisData với data = [{"Year": 1, "Rainfall": value}, ...]
        """
        logger.info(f"Transforming data for analysis. data_field={data_field}")
        
        # Validate data_field
        valid_fields = ["rainfall", "max", "min", "mean", "sum"]
        if data_field not in valid_fields:
            raise ValueError(f"data_field phải là một trong {valid_fields}")
        
        transformed_data = []
        
        if data_field == "rainfall":
            # Dùng timeSeries[].rainfall
            for idx, point in enumerate(api_response.timeSeries, start=1):
                if point.rainfall is not None:
                    transformed_data.append({
                        "Year": idx,
                        "Rainfall": point.rainfall
                    })
        else:
            # Dùng statistics (max, min, mean, sum)
            stats_array = getattr(api_response.statistics, data_field, None)
            
            if stats_array is None:
                raise ValueError(f"Statistics field '{data_field}' không có trong response")
            
            for idx, value in enumerate(stats_array, start=1):
                if value is not None:
                    transformed_data.append({
                        "Year": idx,
                        "Rainfall": value
                    })
        
        # Filter dữ liệu theo min_threshold
        # Lý do: Phân tích tần suất thủy văn thường chỉ quan tâm đến "events" (ngày có mưa)
        # - min_threshold = 0.0: Lấy tất cả (bao gồm ngày không mưa)
        # - min_threshold > 0.0: Chỉ lấy ngày có mưa > threshold (khuyến nghị cho frequency analysis)
        original_count = len(transformed_data)
        transformed_data = [d for d in transformed_data if d["Rainfall"] > min_threshold]
        filtered_count = original_count - len(transformed_data)
        
        if not transformed_data:
            raise ValueError(f"Không có dữ liệu hợp lệ sau khi lọc (tất cả giá trị <= {min_threshold} hoặc None)")
        
        if filtered_count > 0:
            logger.info(f"Filtered out {filtered_count} records with rainfall <= {min_threshold}mm (kept {len(transformed_data)} records)")
        
        logger.info(f"Transformed {len(transformed_data)} valid data points out of {original_count} total records")
        
        return RainfallAnalysisData(
            data=transformed_data,
            main_column="Rainfall",
            source={
                "location": api_response.location,
                "dateRange": api_response.dateRange,
                "parameters": api_response.parameters,
                "data_field": data_field
            },
            metadata=api_response.metadata
        )
    
    def create_query_history(
        self,
        request: RainfallInterpolateRequest,
        data_field: str,
        api_response: RainfallInterpolateResponse,
        user_id: Optional[str] = None
    ) -> RainfallQueryHistory:
        """
        Tạo record lịch sử query để lưu vào MongoDB
        
        Args:
            request: Request gốc
            data_field: Trường dữ liệu đã chọn
            api_response: Response từ API
            user_id: ID người dùng (optional)
            
        Returns:
            RainfallQueryHistory
        """
        return RainfallQueryHistory(
            latitude=request.latitude,
            longitude=request.longitude,
            days=request.days,
            field=request.field,
            k=request.k,
            power=request.power,
            data_field=data_field,
            dateRange=api_response.dateRange,
            result_summary={
                "totalDays": api_response.metadata.totalDays,
                "availableDays": api_response.metadata.availableDays,
                "missingDays": api_response.metadata.missingDays,
                "avgConfidence": api_response.metadata.avgConfidence,
                "quality": api_response.metadata.quality
            },
            timestamp=datetime.utcnow(),
            user_id=user_id
        )
    
    def validate_confidence(self, metadata: Any, threshold: float = 0.5) -> Dict[str, Any]:
        """
        Validate độ tin cậy của dữ liệu (Simple validation - deprecated, use analyzer instead)
        
        Args:
            metadata: RainfallMetadata
            threshold: Ngưỡng confidence tối thiểu
            
        Returns:
            Dict với warnings nếu có
        """
        warnings = []
        
        if metadata.avgConfidence < threshold:
            warnings.append(
                f"Độ tin cậy trung bình thấp ({metadata.avgConfidence:.2f} < {threshold}). "
                "Dữ liệu có thể không chính xác cho phân tích."
            )
        
        if metadata.quality == "poor":
            warnings.append("Chất lượng dữ liệu kém. Nên xem xét trước khi phân tích.")
        
        if metadata.missingDays > metadata.totalDays * 0.3:
            warnings.append(
                f"Thiếu nhiều dữ liệu ({metadata.missingDays}/{metadata.totalDays} ngày). "
                "Kết quả phân tích có thể không đáng tin cậy."
            )
        
        return {
            "is_valid": len(warnings) == 0,
            "warnings": warnings,
            "avgConfidence": metadata.avgConfidence,
            "quality": metadata.quality
        }
    
    def analyze_data_quality(
        self,
        data: List[Dict[str, Any]],
        metadata: Dict[str, Any],
        request_params: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Phân tích toàn diện chất lượng dữ liệu sử dụng RainfallDataAnalyzer
        
        Args:
            data: Transformed data [{"Year": int, "Rainfall": float}, ...]
            metadata: Metadata từ API
            request_params: Parameters từ request (days, data_field, min_threshold, etc.)
        
        Returns:
            Quality assessment với score, issues, warnings, suggestions
        """
        return self.analyzer.analyze_data_quality(data, metadata, request_params)
    
    def get_optimal_parameters(
        self,
        initial_data: List[Dict[str, Any]],
        initial_metadata: Dict[str, Any],
        current_params: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Lấy parameters tối ưu dựa trên phân tích dữ liệu hiện tại
        
        Args:
            initial_data: Dữ liệu hiện tại
            initial_metadata: Metadata từ API
            current_params: Parameters hiện tại
        
        Returns:
            Suggestions với optimal config
        """
        return self.analyzer.suggest_optimal_parameters(
            initial_data,
            initial_metadata,
            current_params
        )

