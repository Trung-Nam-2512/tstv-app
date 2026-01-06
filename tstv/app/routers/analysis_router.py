from fastapi import APIRouter, Depends, Query, Path, HTTPException
from ..dependencies import get_analysis_service, get_chart_service
from ..services.analysis_service import AnalysisService
from ..services.chart_service import ChartService
import time
import logging
import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/analysis", tags=["analysis"])

def _validate_frequency_curve_params(agg_func: str, method: str):
    """Helper function để validate parameters cho frequency curve endpoints."""
    valid_agg_funcs = ['max', 'min', 'mean', 'sum']
    if agg_func not in valid_agg_funcs:
        raise HTTPException(
            status_code=400,
            detail=f"Hàm tổng hợp '{agg_func}' không hợp lệ. Các hàm hợp lệ: {', '.join(valid_agg_funcs)}"
        )
    
    valid_methods = ['auto', 'mom', 'mle']
    if method not in valid_methods:
        raise HTTPException(
            status_code=400,
            detail=f"Phương pháp fitting '{method}' không hợp lệ. Các phương pháp hợp lệ: {', '.join(valid_methods)}"
        )

def _handle_frequency_curve_endpoint(distribution_name: str, agg_func: str, method: str, analysis_service: AnalysisService):
    """Helper function để handle frequency curve endpoints với error handling."""
    try:
        _validate_frequency_curve_params(agg_func, method)
        
        # Validate distribution
        valid_models = ['gumbel', 'lognorm', 'gamma', 'logistic', 'expon', 
                       'genextreme', 'genpareto', 'frechet', 'pearson3']
        if distribution_name not in valid_models:
            raise HTTPException(
                status_code=400,
                detail=f"Mô hình '{distribution_name}' không được hỗ trợ. Các mô hình hợp lệ: {', '.join(valid_models)}"
            )
        
        return analysis_service.compute_frequency_curve(distribution_name, agg_func, method)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in frequency curve ({distribution_name}): {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Lỗi server khi tính frequency curve: {str(e)}"
        )

@router.get("/distribution")
def get_distribution_analysis(
    agg_func: str = Query('max', description="Aggregation function: max, min, mean, sum"),
    analysis_service: AnalysisService = Depends(get_analysis_service)
):
    """
    Get distribution analysis với error handling.
    """
    try:
        # Validate agg_func
        valid_agg_funcs = ['max', 'min', 'mean', 'sum']
        if agg_func not in valid_agg_funcs:
            raise HTTPException(
                status_code=400,
                detail=f"Hàm tổng hợp '{agg_func}' không hợp lệ. Các hàm hợp lệ: {', '.join(valid_agg_funcs)}"
            )
        
        return analysis_service.get_distribution_analysis(agg_func)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in get_distribution_analysis: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Lỗi server khi phân tích phân phối: {str(e)}")

@router.get("/quantile_data/{model}")
def call_get_quantile_data(
    model: str = Path(..., description="Distribution name: gumbel, lognorm, gamma, etc."),
    agg_func: str = Query('max', description="Aggregation function: max, min, mean, sum"),
    analysis_service: AnalysisService = Depends(get_analysis_service)
):
    """
    Get quantile data với error handling.
    """
    try:
        # Validate model
        valid_models = ['gumbel', 'lognorm', 'gamma', 'logistic', 'expon', 
                       'genextreme', 'genpareto', 'frechet', 'pearson3']
        if model not in valid_models:
            raise HTTPException(
                status_code=400,
                detail=f"Mô hình '{model}' không được hỗ trợ. Các mô hình hợp lệ: {', '.join(valid_models)}"
            )
        
        # Validate agg_func
        valid_agg_funcs = ['max', 'min', 'mean', 'sum']
        if agg_func not in valid_agg_funcs:
            raise HTTPException(
                status_code=400,
                detail=f"Hàm tổng hợp '{agg_func}' không hợp lệ. Các hàm hợp lệ: {', '.join(valid_agg_funcs)}"
            )
        
        return analysis_service.get_quantile_data(model, agg_func)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in call_get_quantile_data: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Lỗi server khi lấy quantile data: {str(e)}")

@router.get("/frequency_curve_gumbel")
def get_frequency_curve_gumbel(
    agg_func: str = Query('max', description="Aggregation function: max, min, mean, sum"),
    method: str = Query('auto', description="Fitting method: auto (MOM for Gumbel), mom, mle"),
    analysis_service: AnalysisService = Depends(get_analysis_service)
):
    """Get Gumbel frequency curve với error handling."""
    return _handle_frequency_curve_endpoint("gumbel", agg_func, method, analysis_service)

@router.get("/frequency_curve_lognorm")
def get_frequency_curve_lognorm(
    agg_func: str = Query('max', description="Aggregation function: max, min, mean, sum"),
    method: str = Query('auto', description="Fitting method: auto, mom, mle"),
    analysis_service: AnalysisService = Depends(get_analysis_service)
):
    """Get Lognormal frequency curve với error handling."""
    return _handle_frequency_curve_endpoint("lognorm", agg_func, method, analysis_service)

@router.get("/frequency_curve_gamma")
def get_frequency_curve_gamma(
    agg_func: str = Query('max', description="Aggregation function: max, min, mean, sum"),
    method: str = Query('auto', description="Fitting method: auto, mom, mle"),
    analysis_service: AnalysisService = Depends(get_analysis_service)
):
    """Get Gamma frequency curve với error handling."""
    return _handle_frequency_curve_endpoint("gamma", agg_func, method, analysis_service)

@router.get("/frequency_curve_logistic")
def get_frequency_curve_logistic(
    agg_func: str = Query('max', description="Aggregation function: max, min, mean, sum"),
    method: str = Query('auto', description="Fitting method: auto, mom, mle"),
    analysis_service: AnalysisService = Depends(get_analysis_service)
):
    """Get Logistic frequency curve với error handling."""
    return _handle_frequency_curve_endpoint("logistic", agg_func, method, analysis_service)

@router.get("/frequency_curve_exponential")
def get_frequency_curve_exponential(
    agg_func: str = Query('max', description="Aggregation function: max, min, mean, sum"),
    method: str = Query('auto', description="Fitting method: auto, mom, mle"),
    analysis_service: AnalysisService = Depends(get_analysis_service)
):
    """Get Exponential frequency curve với error handling."""
    return _handle_frequency_curve_endpoint("expon", agg_func, method, analysis_service)

@router.get("/frequency_curve_gpd")
def get_frequency_curve_gpd(
    agg_func: str = Query('max', description="Aggregation function: max, min, mean, sum"),
    method: str = Query('auto', description="Fitting method: auto, mom, mle"),
    analysis_service: AnalysisService = Depends(get_analysis_service)
):
    """Get GPD (Generalized Pareto Distribution) frequency curve với error handling."""
    return _handle_frequency_curve_endpoint("genpareto", agg_func, method, analysis_service)

@router.get("/frequency_curve_frechet")
def get_frequency_curve_frechet(
    agg_func: str = Query('max', description="Aggregation function: max, min, mean, sum"),
    method: str = Query('auto', description="Fitting method: auto, mom, mle"),
    analysis_service: AnalysisService = Depends(get_analysis_service)
):
    """Get Frechet frequency curve với error handling."""
    return _handle_frequency_curve_endpoint("frechet", agg_func, method, analysis_service)

@router.get("/frequency_curve_pearson3")
def get_frequency_curve_pearson3(
    agg_func: str = Query('max', description="Aggregation function: max, min, mean, sum"),
    method: str = Query('auto', description="Fitting method: auto, mom, mle"),
    analysis_service: AnalysisService = Depends(get_analysis_service)
):
    """Get Pearson3 frequency curve với error handling."""
    return _handle_frequency_curve_endpoint("pearson3", agg_func, method, analysis_service)

@router.get("/frequency_curve_genextreme")
def get_frequency_curve_genextreme(
    agg_func: str = Query('max', description="Aggregation function: max, min, mean, sum"),
    method: str = Query('auto', description="Fitting method: auto, mom, mle"),
    analysis_service: AnalysisService = Depends(get_analysis_service)
):
    """Get Generalized Extreme Value frequency curve với error handling."""
    return _handle_frequency_curve_endpoint("genextreme", agg_func, method, analysis_service)

@router.get("/frequency_curve_chart/{model}")
def get_frequency_curve_chart(
    model: str = Path(..., description="Distribution name: gumbel, lognorm, gamma, etc."),
    agg_func: str = Query('max', description="Aggregation function: max, min, mean, sum"),
    method: str = Query('auto', description="Fitting method: auto, mom, mle"),
    dpi: int = Query(150, ge=100, le=300, description="Image resolution (100-300)"),
    with_ci: bool = Query(False, description="Include confidence intervals"),
    chart_service: ChartService = Depends(get_chart_service)
):
    """
    Render frequency curve chart từ backend và trả về base64 encoded image.
    
    Tham khảo code từ vebieudo_example.py để đảm bảo chất lượng và độ mượt.
    
    Args:
        model: Distribution name (gumbel, lognorm, gamma, logistic, expon, genpareto, frechet, pearson3, genextreme)
        agg_func: Aggregation function
        method: Fitting method
        dpi: Image resolution
        with_ci: Include confidence intervals in chart
    
    Returns:
        JSON với keys:
        - image: Base64 encoded PNG image (data URI)
        - format: "png"
        - dpi: Resolution used
        - width: Image width in pixels
        - height: Image height in pixels
        - distribution: Distribution name
        - statistics: Statistical parameters (mean, cv, cs)
    """
    try:
        if with_ci:
            result = chart_service.render_frequency_curve_chart_with_ci(
                distribution_name=model,
                agg_func=agg_func,
                method=method,
                dpi=dpi
            )
        else:
            result = chart_service.render_frequency_curve_chart(
                distribution_name=model,
                agg_func=agg_func,
                method=method,
                dpi=dpi
            )
        
        return result
        
    except ValueError as e:
        logger.error(f"Chart rendering failed: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error in chart rendering: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@router.get("/qq_pp/{model}")
def get_qq_pp_plot_data(
    model: str = Path(..., description="Distribution name: gumbel, lognorm, gamma, etc."),
    agg_func: str = Query('max', description="Aggregation function: max, min, mean, sum"),
    analysis_service: AnalysisService = Depends(get_analysis_service)
):
    """
    Get QQ-PP plot data với error handling đầy đủ.
    """
    try:
        # Validate model name
        valid_models = ['gumbel', 'lognorm', 'gamma', 'logistic', 'expon', 
                       'genextreme', 'genpareto', 'frechet', 'pearson3']
        if model not in valid_models:
            raise HTTPException(
                status_code=400, 
                detail=f"Mô hình '{model}' không được hỗ trợ. Các mô hình hợp lệ: {', '.join(valid_models)}"
            )
        
        # Validate agg_func
        valid_agg_funcs = ['max', 'min', 'mean', 'sum']
        if agg_func not in valid_agg_funcs:
            raise HTTPException(
                status_code=400,
                detail=f"Hàm tổng hợp '{agg_func}' không hợp lệ. Các hàm hợp lệ: {', '.join(valid_agg_funcs)}"
            )
        
        result = analysis_service.compute_qq_pp(model, agg_func)
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in get_qq_pp_plot_data: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Lỗi server khi lấy dữ liệu QQ-PP: {str(e)}"
        )

@router.get("/frequency")
def get_frequency_analysis(analysis_service: AnalysisService = Depends(get_analysis_service)):
    """Get frequency analysis với error handling."""
    try:
        return analysis_service.get_frequency_analysis()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in get_frequency_analysis: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Lỗi server khi phân tích tần suất: {str(e)}")

@router.get("/frequency_by_model")
def get_frequency_by_model(
    distribution_name: str = Query(..., description="Distribution name: gumbel, lognorm, gamma, etc."),
    agg_func: str = Query('max', description="Aggregation function: max, min, mean, sum"),
    analysis_service: AnalysisService = Depends(get_analysis_service)
):
    """Get frequency by model với error handling."""
    try:
        # Validate model
        valid_models = ['gumbel', 'lognorm', 'gamma', 'logistic', 'expon', 
                       'genextreme', 'genpareto', 'frechet', 'pearson3']
        if distribution_name not in valid_models:
            raise HTTPException(
                status_code=400,
                detail=f"Mô hình '{distribution_name}' không được hỗ trợ. Các mô hình hợp lệ: {', '.join(valid_models)}"
            )
        
        # Validate agg_func
        valid_agg_funcs = ['max', 'min', 'mean', 'sum']
        if agg_func not in valid_agg_funcs:
            raise HTTPException(
                status_code=400,
                detail=f"Hàm tổng hợp '{agg_func}' không hợp lệ. Các hàm hợp lệ: {', '.join(valid_agg_funcs)}"
            )
        
        return analysis_service.get_frequency_by_model(distribution_name, agg_func)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in get_frequency_by_model: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Lỗi server khi lấy frequency by model: {str(e)}")

def _compute_single_distribution(dist_name: str, agg_func: str, analysis_service: AnalysisService) -> Dict[str, Any]:
    """Helper function để compute một distribution - dùng cho parallel execution"""
    try:
        t0 = time.time()
        logger.info(f"Computing {dist_name}...")
        
        result = analysis_service.compute_frequency_curve(dist_name, agg_func)
        
        elapsed = time.time() - t0
        logger.info(f"✓ {dist_name} completed in {elapsed:.2f}s")
        
        return {
            "success": True,
            "name": dist_name,
            "result": result,
            "timing": round(elapsed, 2),
            "error": None
        }
    except Exception as e:
        error_msg = str(e)
        logger.error(f"✗ {dist_name} failed: {error_msg}")
        return {
            "success": False,
            "name": dist_name,
            "result": None,
            "timing": None,
            "error": error_msg
        }

@router.post("/precompute_all")
def precompute_all_distributions(
    agg_func: str = Query('max', description="Aggregation function: max, min, mean, sum"),
    distributions: str = Query(None, description="Comma-separated list of distributions to compute. If not provided, all distributions will be computed."),
    analysis_service: AnalysisService = Depends(get_analysis_service)
):
    """
    Pre-compute distributions cho rainfall analysis (PARALLEL).
    Dùng cho workflow: User chọn location → Pre-compute selected models → Navigate to results.
    
    Tính toán song song các models để tăng tốc độ đáng kể (2-4x faster).
    
    Args:
        agg_func: Hàm tổng hợp (max, min, mean, sum)
        distributions: Danh sách mô hình cách nhau bởi dấu phẩy (ví dụ: "gumbel,lognorm,genextreme")
                       Nếu không truyền, sẽ tính toán tất cả mô hình.
    
    Returns:
        - status: "success" | "partial" | "error"
        - results: Dict[distribution_name, frequency_curve_data]
        - timing: Dict với thời gian tính toán cho từng model
        - errors: Dict với lỗi (nếu có)
    """
    # Danh sách tất cả distributions có sẵn
    all_distributions = [
        'gumbel', 'lognorm', 'gamma', 'logistic', 'expon',
        'genextreme', 'genpareto', 'frechet', 'pearson3'
    ]
    
    # Parse distributions từ query parameter
    if distributions:
        # Split và validate
        requested_dists = [d.strip().lower() for d in distributions.split(',') if d.strip()]
        # Chỉ lấy những distributions hợp lệ
        dist_list = [d for d in requested_dists if d in all_distributions]
        if not dist_list:
            logger.warning(f"No valid distributions found in: {distributions}. Using all.")
            dist_list = all_distributions
    else:
        dist_list = all_distributions
    
    logger.info(f"=== PRECOMPUTE {len(dist_list)} DISTRIBUTIONS (PARALLEL, agg_func={agg_func}) ===")
    logger.info(f"Selected distributions: {dist_list}")
    start_time = time.time()
    
    # Parallel execution với ThreadPoolExecutor
    # Note: scipy distributions có thể release GIL, nên thread pool sẽ giúp parallelize
    max_workers = min(len(dist_list), 4)  # Tối đa 4 workers để tránh quá tải CPU
    
    results = {}
    timing = {}
    errors = {}
    success_count = 0
    
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        # Submit tất cả tasks
        futures = {
            executor.submit(_compute_single_distribution, dist_name, agg_func, analysis_service): dist_name
            for dist_name in dist_list
        }
        
        # Collect results
        for future in futures:
            dist_result = future.result()
            dist_name = dist_result["name"]
            
            if dist_result["success"]:
                results[dist_name] = dist_result["result"]
                timing[dist_name] = dist_result["timing"]
                success_count += 1
            else:
                errors[dist_name] = dist_result["error"]
    
    total_time = time.time() - start_time
    
    # Determine overall status
    if success_count == len(dist_list):
        status = "success"
    elif success_count > 0:
        status = "partial"
    else:
        status = "error"
    
    sequential_time = sum(timing.values()) if timing else 0
    speedup = sequential_time / total_time if total_time > 0 else 1
    
    logger.info(f"=== PRECOMPUTE COMPLETED (PARALLEL): {success_count}/{len(dist_list)} in {total_time:.2f}s ===")
    logger.info(f"Speedup: Sequential would be ~{sequential_time:.2f}s, Parallel: {total_time:.2f}s (x{speedup:.2f} faster)\n")
    
    return {
        "status": status,
        "results": results,
        "timing": timing,
        "errors": errors if errors else None,
        "summary": {
            "total": len(dist_list),
            "success": success_count,
            "failed": len(errors),
            "total_time": round(total_time, 2),
            "parallel": True,
            "speedup": round(speedup, 2) if speedup > 1 else None,
            "requested_distributions": dist_list
        }
    }