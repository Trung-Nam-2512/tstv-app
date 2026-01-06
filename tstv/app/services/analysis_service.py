import pandas as pd
import numpy as np
from scipy.stats import gumbel_r, genextreme, genpareto, expon, lognorm, logistic, gamma, chi2, pearson3
from scipy.interpolate import interp1d
from fastapi import HTTPException
from starlette.responses import JSONResponse
from typing import Dict, Tuple, Callable, List, Any
from .data_service import DataService
from ..utils.helpers import extract_params, validate_agg_func
from datetime import datetime, timezone
import logging
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor, as_completed
import multiprocessing as mp
import time
import pickle

logger = logging.getLogger(__name__)


def _bootstrap_iteration_worker(args):
    """
    Standalone function để chạy một bootstrap iteration - dùng cho ProcessPoolExecutor.
    Phải là module-level function để có thể pickle được.
    """
    (seed, Qmax, n, distribution_name, p_values_for_ci, Q_theoretical_ref, absolute_max) = args
    
    # Import lại scipy trong worker process
    from scipy.stats import gumbel_r, genextreme, genpareto, expon, lognorm, logistic, gamma, pearson3
    
    # Map distribution name to scipy distribution
    dist_map = {
        'gumbel': gumbel_r,
        'lognorm': lognorm,
        'gamma': gamma,
        'logistic': logistic,
        'expon': expon,
        'genextreme': genextreme,
        'genpareto': genpareto,
        'frechet': genextreme,  # Frechet is genextreme with specific params
        'pearson3': pearson3
    }
    
    dist = dist_map.get(distribution_name)
    if dist is None:
        return None
    
    # Dùng local random state để tránh race condition
    rng = np.random.RandomState(seed)
    bootstrap_sample = rng.choice(Qmax, size=n, replace=True)
    
    try:
        bootstrap_params = dist.fit(bootstrap_sample)
        bootstrap_Q = dist.ppf(1 - p_values_for_ci, *bootstrap_params)
        
        # Filter invalid values
        bootstrap_Q = np.where(np.isfinite(bootstrap_Q) & (bootstrap_Q > 0) & (bootstrap_Q < absolute_max), 
                              bootstrap_Q, np.nan)
        
        # Filter outliers
        if Q_theoretical_ref is not None:
            outlier_mask = np.ones_like(bootstrap_Q, dtype=bool)
            max_ratio = 8.0 if distribution_name == 'lognorm' else 10.0
            
            if distribution_name == 'gumbel':
                min_ratio = 0.005
            elif distribution_name == 'lognorm':
                min_ratio = 0.15
            else:
                min_ratio = 0.05
            
            for i in range(len(bootstrap_Q)):
                if np.isfinite(bootstrap_Q[i]) and np.isfinite(Q_theoretical_ref[i]) and Q_theoretical_ref[i] > 0:
                    ratio = bootstrap_Q[i] / Q_theoretical_ref[i]
                    if ratio < min_ratio or ratio > max_ratio:
                        outlier_mask[i] = False
            
            outlier_threshold = 0.30 if distribution_name == 'gumbel' else 0.10
            outlier_ratio = np.sum(~outlier_mask) / np.sum(np.isfinite(bootstrap_Q)) if np.sum(np.isfinite(bootstrap_Q)) > 0 else 0
            if outlier_ratio > outlier_threshold:
                return None  # Skip iteration này
        
        return bootstrap_Q
    except Exception:
        return None  # Skip nếu fail


def Weibull(data: np.ndarray) -> np.ndarray:
    """
    Tính Weibull plotting position: P = i/(n+1) * 100
    
    Args:
        data: Array of data values
        
    Returns:
        Array of P% values (exceedance probability)
    """
    n = len(data)
    # Sort data descending (largest first)
    sorted_data = np.sort(data)[::-1]
    # Weibull plotting position: P = i/(n+1) where i = 1, 2, ..., n
    i = np.arange(1, n + 1)
    p_percent = (i / (n + 1)) * 100.0
    return p_percent


class DistributionBase:
    def __init__(self, name: str, fit_func: Callable, ppf_func: Callable, cdf_func: Callable, pdf_func: Callable, logpdf_func: Callable):
        self.name = name
        self.fit = fit_func
        self.ppf = ppf_func
        self.cdf = cdf_func
        self.pdf = pdf_func
        self.logpdf = logpdf_func

distributions: Dict[str, DistributionBase] = {
    "gumbel": DistributionBase("Gumbel", gumbel_r.fit, gumbel_r.ppf, gumbel_r.cdf, gumbel_r.pdf, gumbel_r.logpdf),
    "genextreme": DistributionBase("Generalized Extreme Value", genextreme.fit, genextreme.ppf, genextreme.cdf, genextreme.pdf, genextreme.logpdf),
    "genpareto": DistributionBase("GPD", genpareto.fit, genpareto.ppf, genpareto.cdf, genpareto.pdf, genpareto.logpdf),
    "expon": DistributionBase("Exponential", expon.fit, expon.ppf, expon.cdf, expon.pdf, expon.logpdf),
    "lognorm": DistributionBase("Lognormal", lognorm.fit, lognorm.ppf, lognorm.cdf, lognorm.pdf, lognorm.logpdf),
    "logistic": DistributionBase("Logistic", logistic.fit, logistic.ppf, logistic.cdf, logistic.pdf, logistic.logpdf),
    "gamma": DistributionBase("Gamma", gamma.fit, gamma.ppf, gamma.cdf, gamma.pdf, gamma.logpdf),
    "pearson3": DistributionBase("Pearson3", pearson3.fit, pearson3.ppf, pearson3.cdf, pearson3.pdf, pearson3.logpdf),
    "frechet": DistributionBase("Frechet", genextreme.fit, genextreme.ppf, genextreme.cdf, genextreme.pdf, genextreme.logpdf),
}

class AnalysisService:
    def __init__(self, data_service: DataService):
        self.data_service = data_service

    def get_distribution_analysis(self, agg_func: str= 'max'):
        """
        Phân tích xác định phân phối và tính AIC, chi-square cho các phân phối khác nhau
        - Fix 1: validate_agg_func để DRY.
        - Fix 2: Expected_freq dùng CDF exact (cdf(b)-cdf(a))*n → sum~n chính xác hơn PDF approx (giảm bias skewed dist thủy văn).
        - Fix 3: df_chi = len(observed) - 1 - len(params) (chuẩn goodness-of-fit, tránh df cao → p-value inflated).
        - Fix 4: Handle expected<=0 bằng epsilon 1e-10 để tránh div0.
        - Fix 5: Nếu df_chi <=0 (small n/bins), p_value=None + warning (thay vì nan).
        - Fix 6: Bins dynamic: max(5, sturges formula) để int, tránh ít bin → df<0.
        - Lý do: Trong thủy văn, small n (<30 năm) phổ biến → cần robust; CDF tốt hơn cho continuous data.
        - Warning nếu n<30 hoặc df<=0 để alert user.
        """
        df = self.data_service.data
        main_column = self.data_service.main_column
        if df is None:
            raise HTTPException(status_code=404, detail="Dữ liệu chưa được tải")
        validate_agg_func(agg_func)
        aggregated = df.groupby('Year')[main_column].agg(agg_func).values

        # Tính sturges bins: 1 + log2(n+1)
        n = len(aggregated)
        sturges_bins = int(np.ceil(1 + np.log2(n + 1))) if n > 0 else 5
        num_bins = max(5, sturges_bins)

        analysis = {}
        for name, dist in distributions.items():
            params = dist.fit(aggregated)
            extracted = extract_params(params)
            loglik = np.sum(dist.logpdf(aggregated, *params))
            aic = 2 * len(params) - 2 * loglik
            bins = np.histogram_bin_edges(aggregated, bins=num_bins)
            observed_freq, _ = np.histogram(aggregated, bins=bins)
            expected_freq = n * (dist.cdf(bins[1:], *params) - dist.cdf(bins[:-1], *params))
            expected_freq = np.where(expected_freq <= 0, 1e-10, expected_freq)
            chi_square = np.sum((observed_freq - expected_freq) ** 2 / expected_freq)
            df_chi = len(observed_freq) - 1 - len(params)
            p_value = 1 - chi2.cdf(chi_square, df_chi) if df_chi > 0 else None
            if n < 30 or df_chi <= 0:
                logging.warning(f"Small sample or low df for {name}: n={n}, df={df_chi}. Consider more data for reliable fit.")
            analysis[name] = {
                "params": extracted,
                "AIC": aic,
                "ChiSquare": chi_square,
                "p_value": p_value
            }
        return analysis

    def get_quantile_data(self, distribution_name: str, agg_func: str= 'max'):
        validate_agg_func(agg_func)
        if distribution_name not in distributions:
            raise HTTPException(status_code=404, detail=f"Mô hình {distribution_name} không được hỗ trợ.")
        
        df = self.data_service.data
        main_column = self.data_service.main_column

        if df is None or df.empty:
            raise HTTPException(status_code=400, detail="Dữ liệu chưa được tải. Vui lòng upload dữ liệu trước.")
        
        if main_column is None:
            raise HTTPException(status_code=400, detail="Chưa xác định được cột dữ liệu chính.")
        
        df_max = df.groupby('Year', as_index=False)[main_column].agg(agg_func)
        qmax_values = df_max[main_column].tolist()
        years = df_max['Year'].tolist()
        N = len(qmax_values)
        
        counts, bin_edges = np.histogram(qmax_values, bins="auto")
        
        bin_midpoints = [(bin_edges[i] + bin_edges[i+1]) / 2 for i in range(len(bin_edges)-1)]
        
        dist = distributions[distribution_name]
        
        params = dist.fit(qmax_values)
        
        expected_counts = []
        for i in range(len(bin_edges)-1):
            a = bin_edges[i]
            b = bin_edges[i+1]
            expected_count = N * (dist.cdf(b, *params) - dist.cdf(a, *params))
            expected_counts.append(expected_count)
        
        # Cập nhật để dùng cùng số điểm với compute_frequency_curve (2500 điểm)
        # Dùng logspace thay vì linspace để phù hợp với log scale (semilogx)
        p_percent_fixed = np.logspace(np.log10(0.01), np.log10(99.9), num=2500)
        p_values = p_percent_fixed / 100.0
        Q_theoretical = dist.ppf(1 - p_values, *params)
        
        return {
            "years": years,
            "qmax_values": qmax_values,
            "histogram": {
                "counts": counts.tolist(),
                "bin_edges": bin_edges.tolist(),
                "bin_midpoints": bin_midpoints,
                "expected_counts": expected_counts
            },
            "theoretical_curve": {
                "p_values": p_percent_fixed.tolist(),  # Trả về P_percent (0.01-99.9) thay vì p_values (0.0001-0.999)
                "Q_values": Q_theoretical.tolist()
            }
        }

    def _fit_distribution_mom(self, distribution_name: str, Qmax: np.ndarray) -> Tuple:
        """
        Method of Moments (MOM) fitting cho các distribution.
        FFC 2008 chủ yếu dùng MOM cho Gumbel, nhưng cũng hỗ trợ cho các distribution khác.
        
        Returns:
            Tuple of distribution parameters (shape, loc, scale) hoặc (loc, scale)
        """
        mean_Q = float(np.mean(Qmax))
        std_Q = float(np.std(Qmax, ddof=1))  # Sample std
        var_Q = float(np.var(Qmax, ddof=1))  # Sample variance
        
        if distribution_name == 'gumbel':
            # Gumbel: scale = std * sqrt(6) / pi, loc = mean - scale * gamma
            # gamma ≈ 0.57722 là Euler-Mascheroni constant
            scale = std_Q * np.sqrt(6) / np.pi
            loc = mean_Q - 0.57722 * scale
            return (loc, scale)
        
        elif distribution_name == 'lognorm':
            # Lognormal: X ~ lognorm(s, scale=exp(mu))
            # E[X] = exp(mu + s^2/2), Var[X] = exp(2*mu + s^2) * (exp(s^2) - 1)
            # Từ moments: s^2 = ln(1 + Var/E^2), mu = ln(E) - s^2/2
            cv_squared = var_Q / (mean_Q ** 2)  # Coefficient of variation squared
            if cv_squared <= 0:
                # Fallback to MLE nếu không hợp lệ
                return None
            s = np.sqrt(np.log(1 + cv_squared))
            mu = np.log(mean_Q) - (s ** 2) / 2
            # scipy.stats.lognorm: (s, loc, scale) với scale = exp(mu)
            return (s, 0, np.exp(mu))
        
        elif distribution_name == 'gamma':
            # Gamma: shape = (mean/std)^2, scale = std^2/mean
            # Hoặc: shape = mean^2/var, scale = var/mean
            if mean_Q <= 0 or var_Q <= 0:
                return None
            shape = (mean_Q ** 2) / var_Q
            scale = var_Q / mean_Q
            # scipy.stats.gamma: (shape, loc, scale)
            return (shape, 0, scale)
        
        elif distribution_name == 'pearson3':
            # Pearson3: skewness-based method
            # Cần tính skewness từ data
            n = len(Qmax)
            if n < 3:
                return None
            # Sample skewness
            skew = float(np.sum(((Qmax - mean_Q) / std_Q) ** 3) / n) if std_Q > 0 else 0
            # Pearson3 parameters từ moments
            # shape = 2/skew, loc và scale phức tạp hơn
            if abs(skew) < 1e-6:
                # Nếu skewness ≈ 0, dùng normal approximation
                return None
            shape = 2 / skew if abs(skew) > 1e-6 else None
            if shape is None or abs(shape) > 100:  # Giới hạn shape để tránh overflow
                return None
            # loc và scale từ mean và std với shape đã biết
            # Công thức phức tạp, tốt nhất là dùng MLE cho Pearson3
            return None  # Fallback to MLE
        
        elif distribution_name == 'logistic':
            # Logistic: scale = std * sqrt(3) / pi, loc = mean
            scale = std_Q * np.sqrt(3) / np.pi
            loc = mean_Q
            return (loc, scale)
        
        elif distribution_name == 'expon':
            # Exponential: scale = mean
            if mean_Q <= 0:
                return None
            scale = mean_Q
            return (0, scale)  # loc = 0
        
        else:
            # Không hỗ trợ MOM cho distribution này
            return None
    
    def compute_frequency_curve(self, distribution_name: str, agg_func: str= 'max', method: str = 'auto'):
        """
        Compute frequency curve với lựa chọn method fitting và error handling đầy đủ.
        
        Args:
            distribution_name: Tên distribution
            agg_func: Aggregation function (max, min, mean, sum)
            method: Fitting method - 'auto' (MOM cho Gumbel, MLE cho khác), 'mom', 'mle'
        
        Returns:
            Dict với theoretical_curve và empirical_points (tất cả values đã convert sang Python native types)
        """
        try:
            validate_agg_func(agg_func)
            if distribution_name not in distributions:
                raise HTTPException(status_code=400, detail=f"Mô hình {distribution_name} không được hỗ trợ.")
            
            # Validate method
            valid_methods = ['auto', 'mom', 'mle']
            if method not in valid_methods:
                raise HTTPException(status_code=400, detail=f"Phương pháp fitting '{method}' không hợp lệ. Các phương pháp hợp lệ: {', '.join(valid_methods)}")
            
            df = self.data_service.data
            main_column = self.data_service.main_column
            
            # Debug: Log thông tin dữ liệu hiện tại
            logger.info(f"=== FREQUENCY CURVE: {distribution_name.upper()} (method={method}, agg={agg_func}) ===")
            logger.info(f"DataService state: df is None={df is None}, df.empty={df.empty if df is not None else 'N/A'}")
            if df is not None:
                logger.info(f"DataFrame shape: {df.shape}, columns: {list(df.columns)}")
                logger.info(f"Main column: {main_column}")
                logger.info(f"Data sample (first 5 rows):\n{df.head()}")
                logger.info(f"Data statistics:\n{df.describe()}")
            
            if df is None or df.empty:
                logger.warning("Data is None or empty")
                return {"theoretical_curve": [], "empirical_points": []}
            
            if main_column not in df.columns:
                raise HTTPException(status_code=400, detail=f"Cột dữ liệu '{main_column}' không tồn tại")
            
            # Get aggregated data với error handling
            try:
                # Kiểm tra xem có duplicate Year không (có thể xảy ra với rainfall data)
                year_counts = df['Year'].value_counts()
                if year_counts.max() > 1:
                    logger.warning(f"Found duplicate Years in data: {year_counts[year_counts > 1].to_dict()}")
                    logger.warning(f"Will aggregate using {agg_func} function")
                    # Log thêm thông tin về duplicates
                    for year, count in year_counts[year_counts > 1].items():
                        sample_values = df[df['Year'] == year][main_column].head(5).tolist()
                        logger.warning(f"  Year {year}: {count} records, sample values: {sample_values}")
                else:
                    logger.info(f"No duplicate Years found. Each Year has exactly 1 record.")
                
                # Với dữ liệu rainfall (không có Month), mỗi Year chỉ có 1 giá trị
                # Nếu không có duplicate, không cần aggregate
                if year_counts.max() == 1:
                    # Không có duplicate, dùng trực tiếp giá trị
                    Qmax = pd.to_numeric(df[main_column], errors='coerce').values
                    logger.info(f"Using direct values (no aggregation needed): n={len(Qmax)}")
                else:
                    # Có duplicate, cần aggregate
                    aggregated = df.groupby('Year')[main_column].agg(agg_func)
                    Qmax = pd.to_numeric(aggregated, errors='coerce').values
                    logger.info(f"Aggregated data using {agg_func}: n={len(Qmax)}")
                
                # Filter out NaN, Inf, None, và non-numeric values
                Qmax = Qmax[np.isfinite(Qmax)]
                
                # Debug: Log Qmax để kiểm tra
                logger.info(f"Final Qmax: n={len(Qmax)}, mean={np.mean(Qmax):.2f}, std={np.std(Qmax):.2f}")
                logger.info(f"Qmax range: min={np.min(Qmax):.2f}, max={np.max(Qmax):.2f}")
                logger.info(f"Qmax sample (first 10): {Qmax[:10]}")
                logger.info(f"Qmax sample (last 10): {Qmax[-10:]}")
                
                # Kiểm tra giá trị bất thường
                if np.max(Qmax) > 1e6:  # Nếu giá trị > 1 triệu mm (không hợp lý cho lượng mưa)
                    logger.error(f"WARNING: Detected extremely large values in Qmax! Max={np.max(Qmax):.2f}")
                    logger.error(f"This may indicate incorrect aggregation or data transformation issue")
                    logger.error(f"DataFrame info: shape={df.shape}, columns={list(df.columns)}")
                    logger.error(f"Year range: {df['Year'].min()} - {df['Year'].max()}")
                    logger.error(f"Main column stats: min={df[main_column].min():.2f}, max={df[main_column].max():.2f}, mean={df[main_column].mean():.2f}")
                    logger.error(f"Year counts: {year_counts.to_dict()}")
                    # Kiểm tra xem có phải do process_data tạo 12 tháng không
                    if 'Month' in df.columns:
                        logger.error(f"WARNING: DataFrame has 'Month' column! This suggests process_data was called incorrectly.")
                        logger.error(f"Month value counts: {df['Month'].value_counts().to_dict()}")
            except Exception as e:
                logger.error(f"Error aggregating data: {str(e)}")
                raise HTTPException(status_code=400, detail=f"Lỗi khi xử lý dữ liệu: {str(e)}")
            
            # Debug: Log Qmax để kiểm tra
            import time
            t0 = time.time()
            
            # Convert to numeric và filter invalid values trước khi log
            try:
                Qmax_numeric = pd.to_numeric(Qmax, errors='coerce')
                valid_for_log = Qmax_numeric[np.isfinite(Qmax_numeric) & (Qmax_numeric > 0)]
                if len(valid_for_log) > 0:
                    logger.info(f"Qmax: n={Qmax.shape[0]}, valid={len(valid_for_log)}, range=[{np.min(valid_for_log):.2f}, {np.max(valid_for_log):.2f}]")
                else:
                    logger.warning(f"Qmax: n={Qmax.shape[0]}, no valid values after conversion")
            except Exception as e:
                logger.warning(f"Could not log Qmax statistics: {str(e)}")
                logger.info(f"Qmax: n={Qmax.shape[0]}")
            
            if Qmax.size == 0:
                logger.warning("Qmax is empty")
                return {"theoretical_curve": [], "empirical_points": []}
            
            # Filter out invalid values (NaN, Inf, negative if not allowed)
            valid_mask = np.isfinite(Qmax) & (Qmax > 0)  # Assume positive values for hydrological data
            Qmax_filtered = Qmax[valid_mask]
            
            if Qmax_filtered.size == 0:
                logger.warning("No valid data points after filtering")
                raise HTTPException(status_code=400, detail="Không có dữ liệu hợp lệ sau khi lọc (NaN/Inf/âm)")
            
            if Qmax_filtered.size < 3:
                raise HTTPException(status_code=400, detail=f"Dữ liệu không đủ (cần ít nhất 3 điểm, hiện có {Qmax_filtered.size})")
            
            # Use filtered data
            Qmax = Qmax_filtered
            
            # Tính threshold hợp lý dựa trên dữ liệu thực tế
            # Giá trị Q không nên vượt quá max(Qmax) * 10000 (10000 lần giá trị lớn nhất quan sát)
            # Đây là giới hạn hợp lý cho extrapolation - tăng lên để không cắt đường cong
            max_observed = np.max(Qmax)
            reasonable_max = max_observed * 10000  # Cho phép extrapolation tối đa 10000 lần (tăng từ 1000)
            # Nhưng cũng cần giới hạn tuyệt đối để tránh overflow
            # Giới hạn tuyệt đối: 1e10 (10 tỷ) - hợp lý cho hầu hết dữ liệu thủy văn, tăng từ 1e8
            absolute_max = min(reasonable_max, 1e10)  # Giới hạn tuyệt đối: 10 tỷ (tăng từ 100 triệu)
            logger.info(f"Reasonable Q threshold: {absolute_max:.2e} (max_observed={max_observed:.2f}, reasonable_max={reasonable_max:.2e})")

            dist = distributions[distribution_name]
            t_fit = time.time()
            
            try:
                # Xác định method thực tế
                if method == 'auto':
                    # Auto: MOM cho Gumbel (FFC 2008 standard), MLE cho khác
                    use_mom = (distribution_name == 'gumbel')
                elif method == 'mom':
                    use_mom = True
                else:  # method == 'mle'
                    use_mom = False
                
                # Thử MOM nếu được yêu cầu
                if use_mom:
                    params = self._fit_distribution_mom(distribution_name, Qmax)
                    if params is not None:
                        logger.info(f"{distribution_name} fit (Method of Moments): params={params}")
                    else:
                        # Fallback to MLE nếu MOM không khả thi
                        logger.warning(f"MOM không khả thi cho {distribution_name}, fallback to MLE")
                        params = dist.fit(Qmax)
                        logger.info(f"{distribution_name} fit (MLE - fallback): params={params}")
                else:
                    # MLE (default)
                    params = dist.fit(Qmax)
                    logger.info(f"{distribution_name} fit (MLE): params={params}")
                
                # Validate params
                if params is None or len(params) == 0:
                    raise ValueError("Không thể ước lượng tham số phân phối")
                # Check for invalid params
                if any(not np.isfinite(p) for p in params):
                    raise ValueError("Tham số phân phối không hợp lệ (NaN/Inf)")
            except Exception as e:
                logger.error(f"Error fitting {distribution_name}: {str(e)}")
                raise HTTPException(status_code=400, detail=f"Không thể fit phân phối {distribution_name}: {str(e)}")
            
            logger.info(f"Fit completed in {time.time()-t_fit:.2f}s")
            
          
            
            # GIẢI PHÁP TỐI ƯU: Tạo điểm đều trong MIXED SCALE SPACE (0-1) để có đường cong đẹp như mơ
            # Với mixed scale, spacing trong không gian hiển thị không đều nếu tạo điểm theo P space
            # Giải pháp: Tạo điểm đều trong mixed scale space (0-1), rồi inverse về P space
            # Điều này đảm bảo spacing đều trong không gian hiển thị, tạo đường cong mượt hoàn toàn
            
            # Mixed scale parameters (phải khớp với frontend)
            min_p = 0.01
            max_p = 99.99
            transition_start = 5.0   # Bắt đầu transition tại P=5%
            transition_end = 25.0   # Kết thúc transition tại P=25%
            transition_start_pos = 0.3  # Vị trí trong mixed scale (0-1)
            transition_end_pos = 0.6    # Vị trí trong mixed scale (0-1)
            
            def inverse_mixed_scale(x):
                """Inverse transform từ mixed scale position (0-1) về P(%) - Vectorized"""
                x_clamped = np.clip(x, 0.0, 1.0)
                
                # Vectorized với np.where để xử lý array
                is_array = isinstance(x_clamped, np.ndarray)
                if not is_array:
                    x_clamped = np.array([x_clamped])
                    was_scalar = True
                else:
                    was_scalar = False
                
                # Tính derivatives tại endpoints (giống frontend) - chỉ tính 1 lần
                log_min = np.log10(min_p)
                log_max = np.log10(transition_start)
                log_derivative = transition_start_pos / ((transition_start * np.log(10)) * (log_max - log_min))
                linear_derivative = (1.0 - transition_end_pos) / (max_p - transition_end)
                transition_range = transition_end - transition_start
                m0 = log_derivative * transition_range / (transition_end_pos - transition_start_pos)
                m1 = linear_derivative * transition_range / (transition_end_pos - transition_start_pos)
                
                # Khởi tạo kết quả
                result = np.zeros_like(x_clamped)
                
                # Logarithmic scale: 0 → transition_start_pos
                mask_log = x_clamped <= transition_start_pos
                if np.any(mask_log):
                    t = x_clamped[mask_log] / transition_start_pos
                    log_p = log_min + t * (log_max - log_min)
                    result[mask_log] = np.power(10.0, log_p)
                
                # Linear scale: transition_end_pos → 1.0
                mask_linear = x_clamped >= transition_end_pos
                if np.any(mask_linear):
                    t = (x_clamped[mask_linear] - transition_end_pos) / (1.0 - transition_end_pos)
                    result[mask_linear] = transition_end + t * (max_p - transition_end)
                
                # Transition zone: transition_start_pos → transition_end_pos
                mask_transition = (x_clamped > transition_start_pos) & (x_clamped < transition_end_pos)
                if np.any(mask_transition):
                    t = (x_clamped[mask_transition] - transition_start_pos) / (transition_end_pos - transition_start_pos)
                    t = np.clip(t, 0.0, 1.0)
                    
                    # Vectorized Newton's method
                    s = t.copy()
                    for _ in range(15):
                        s2 = s * s
                        s3 = s2 * s
                        # h(s) = (s^3 - 2s^2 + s)*m0 + (-2s^3 + 3s^2) + (s^3 - s^2)*m1
                        h = (s3 - 2*s2 + s) * m0 + (-2*s3 + 3*s2) + (s3 - s2) * m1
                        # dh/ds = (3s^2 - 4s + 1)*m0 + (-6s^2 + 6s) + (3s^2 - 2s)*m1
                        dh = (3*s2 - 4*s + 1) * m0 + (-6*s2 + 6*s) + (3*s2 - 2*s) * m1
                        # f(s) = h(s) - t
                        f = h - t
                        # Update: s = s - f / dh
                        mask = np.abs(dh) > 1e-10
                        s[mask] = s[mask] - f[mask] / dh[mask]
                        s = np.clip(s, 0.0, 1.0)
                    result[mask_transition] = transition_start + s * (transition_end - transition_start)
                
                # Trả về scalar nếu input là scalar
                if was_scalar:
                    return float(result[0])
                return result
            
            # GIẢI PHÁP TỐI ƯU: Số điểm vừa đủ để spline làm mượt tốt
            # Frontend cũ: Plotly spline với smoothing: 0.5, ~2500 điểm
            # Highcharts spline: Cần nhiều điểm hơn một chút để làm mượt tốt (đặc biệt với mixed scale)
            # Với mixed scale có transition zone, cần nhiều điểm hơn để spline làm mượt vùng transition
            # OPTIMIZATION: Giảm số điểm từ 3000 xuống 600 để giảm payload
            # 600 điểm vẫn đủ mượt cho Highcharts line plot (tự động smooth)
            # Highcharts với nhiều điểm sẽ tự làm mượt, không cần 3000 điểm
            num_points = 600  # Giảm từ 3000 xuống 600 - vẫn mượt nhưng nhẹ hơn nhiều
            mixed_scale_positions = np.linspace(0.0, 1.0, num=num_points)
            
            # Inverse transform về P space
            p_percent_fixed = inverse_mixed_scale(mixed_scale_positions)
            
            # Đảm bảo trong range hợp lệ
            p_percent_fixed = np.clip(p_percent_fixed, min_p, max_p)
            # QUAN TRỌNG: Chỉ remove duplicates thực sự (tolerance nhỏ), không remove các điểm gần nhau
            # Vì các điểm đã được tạo đều trong mixed scale space, nên không nên có nhiều duplicates
            # Nhưng do floating point precision, có thể có một số điểm gần nhau
            # Dùng tolerance nhỏ (1e-6) để chỉ remove exact duplicates
            sorted_indices = np.argsort(p_percent_fixed)
            p_percent_fixed = p_percent_fixed[sorted_indices]
            # Remove duplicates với tolerance nhỏ (chỉ exact duplicates)
            unique_mask = np.concatenate(([True], np.diff(p_percent_fixed) > 1e-6))
            p_percent_fixed = p_percent_fixed[unique_mask]
            
            p_values = p_percent_fixed / 100.0
            
            # Tính mean và std từ Qmax (cần cho cả Gumbel và statistics)
            mean_Q = float(np.mean(Qmax))
            std_Q = float(np.std(Qmax, ddof=1))  # Sample std
        
            # Tính Q_theoretical - FFC 2008 dùng công thức trực tiếp với mean và std cho Gumbel
            if distribution_name == 'gumbel':
                # Khi dùng MLE, nên dùng params từ MLE để nhất quán
                # Kiểm tra xem có đang dùng MOM không (params có match với MOM không)
                import math
                
                # Tính mean và std từ params để kiểm tra
                if len(params) == 2:
                    loc_fitted, scale_fitted = params
                    # Nếu dùng MOM: scale = std * sqrt(6) / pi, loc = mean - scale * gamma
                    # Reverse: std = scale * pi / sqrt(6), mean = loc + scale * gamma
                    gamma = 0.57722
                    std_from_params = scale_fitted * np.pi / np.sqrt(6)
                    mean_from_params = loc_fitted + scale_fitted * gamma
                    
                    # Kiểm tra xem params có match với MOM không (tolerance 1e-6)
                    use_direct_formula = (abs(mean_from_params - mean_Q) < 1e-6 and 
                                         abs(std_from_params - std_Q) < 1e-6)
                else:
                    use_direct_formula = False
                
                if use_direct_formula:
                    # Dùng công thức trực tiếp với mean và std (MOM - FFC 2008 standard)
                    # Tính Q cho tất cả P values cùng lúc (vectorized)
                    valid_mask = (p_values > 0) & (p_values < 1)
                    y_values = np.zeros_like(p_values)
                    y_values[valid_mask] = -np.log(-np.log(1 - p_values[valid_mask]))
                    
                    # Frequency factor K = (y - gamma) * sqrt(6) / pi
                    gamma = 0.57722  # Euler-Mascheroni constant
                    K_values = (y_values - gamma) * np.sqrt(6) / np.pi
                    
                    # Q = mean + std * K
                    Q_theoretical = mean_Q + std_Q * K_values
                    
                    # Set NaN cho các giá trị P không hợp lệ
                    Q_theoretical[~valid_mask] = np.nan
                else:
                    # Dùng ppf với params từ MLE (nhất quán hơn)
                    Q_theoretical = dist.ppf(1 - p_values, *params)
                    valid_mask = np.isfinite(Q_theoretical) & (Q_theoretical > 0)
                    if not np.all(valid_mask):
                        logger.warning(f"Gumbel (MLE): Found {np.sum(~valid_mask)} invalid Q values, filtering out")
                        p_percent_fixed = p_percent_fixed[valid_mask]
                        Q_theoretical = Q_theoretical[valid_mask]
            else:
                # Các distribution khác vẫn dùng ppf với (1 - p_values) cho exceedance probability
                Q_theoretical = dist.ppf(1 - p_values, *params)
                
                # Filter NaN, Inf, giá trị âm - NHƯNG KHÔNG filter giá trị quá lớn quá chặt
                # Một số distribution như lognorm có thể trả về giá trị lớn ở P rất thấp (0.01%), điều này là bình thường
                # Chỉ filter các giá trị thực sự không hợp lệ (NaN/Inf/negative)
                # Giới hạn absolute_max chỉ dùng để cảnh báo, không filter quá chặt
                valid_mask = np.isfinite(Q_theoretical) & (Q_theoretical > 0)
                
                # Chỉ filter giá trị quá lớn nếu thực sự không hợp lệ (ví dụ: > 1e12)
                # Với lognorm, giá trị ở P=0.01% có thể lên đến max_observed * 100-1000, điều này là bình thường
                extreme_mask = Q_theoretical < 1e12  # Chỉ filter giá trị cực kỳ lớn (không hợp lý)
                valid_mask = valid_mask & extreme_mask
                
                if not np.all(valid_mask):
                    invalid_count = np.sum(~valid_mask)
                    logger.warning(f"{distribution_name}: Found {invalid_count} invalid Q values (NaN/Inf/negative/extreme), filtering out")
                    # Log một số giá trị không hợp lệ để debug
                    if invalid_count > 0 and invalid_count <= 10:
                        invalid_indices = np.where(~valid_mask)[0]
                        for idx in invalid_indices[:5]:  # Log first 5
                            logger.debug(f"  Invalid Q[{idx}]: P={p_percent_fixed[idx]:.4f}%, Q={Q_theoretical[idx]}")
                    # Chỉ giữ lại các điểm hợp lệ
                    p_percent_fixed = p_percent_fixed[valid_mask]
                    Q_theoretical = Q_theoretical[valid_mask]
                    
                    # Log số điểm còn lại sau filter
                    logger.info(f"{distribution_name}: After filtering, {len(p_percent_fixed)}/{len(valid_mask)} points remaining")
                    logger.info(f"{distribution_name}: P range: {np.min(p_percent_fixed):.4f}% - {np.max(p_percent_fixed):.4f}%")
            
            Q_sorted = sorted(Qmax, reverse=True)  # Sort giảm dần: [max, ..., min]
            n = len(Q_sorted)
            m = np.arange(1, n + 1)  # [1, 2, 3, ..., n]
            p_empirical = m / (n + 1)  # Weibull plotting position: [1/(n+1), 2/(n+1), ..., n/(n+1)]
            p_percent_empirical = p_empirical * 100  # Convert to percentage: [2.04%, 4.08%, ..., 97.96%]

            # Filter và sort theoretical curve - đảm bảo không có NaN/Inf
            # QUAN TRỌNG: Clamp giá trị âm về 0 thay vì loại bỏ
            # Điều này đảm bảo đường cong vẫn liên tục ở tần suất cao (P gần 100%)
            theoretical_curve = []
            num_clamped = 0
            for p, q in zip(p_percent_fixed, Q_theoretical):
                if not np.isfinite(q) or q >= 1e12:
                    continue  # Bỏ qua giá trị NaN/Inf hoặc quá lớn
                
                # Clamp giá trị âm về 0
                q_clamped = max(0, q)
                if q < 0:
                    num_clamped += 1
                
                theoretical_curve.append({
                    "P_percent": self._convert_to_python_type(p), 
                    "Q": self._convert_to_python_type(q_clamped)
                })
            
            # Sort theo P
            theoretical_curve = sorted(theoretical_curve, key=lambda item: item["P_percent"])
            
            if num_clamped > 0:
                logger.warning(f"{distribution_name}: {num_clamped} giá trị Q âm đã được clamp về 0")
            
            # Log thông tin về theoretical curve
            if len(theoretical_curve) > 0:
                p_min = theoretical_curve[0]["P_percent"]
                p_max = theoretical_curve[-1]["P_percent"]
                q_min = min(pt["Q"] for pt in theoretical_curve)
                q_max = max(pt["Q"] for pt in theoretical_curve)
                logger.info(f"{distribution_name}: Theoretical curve: {len(theoretical_curve)} points, P range: {p_min:.4f}% - {p_max:.4f}%, Q range: {q_min:.2f} - {q_max:.2f}")
            else:
                logger.warning(f"{distribution_name}: Theoretical curve is empty after filtering!")
            # Empirical points: P tăng dần (2.04% → 97.96%), Q giảm dần (max → min)
            empirical_points = [
                {
                    "P_percent": self._convert_to_python_type(p), 
                    "Q": self._convert_to_python_type(q)
                } 
                for p, q in zip(p_percent_empirical, Q_sorted)
            ]
            
            # Tính các thông số thống kê (chuẩn FFC 2008 & HEC-SSP)
            # Lưu ý: mean_Q và std_Q đã được tính ở trên (line ~577) để dùng cho Gumbel quantile
            # Không cần tính lại, chỉ dùng lại giá trị đã tính
            cv = std_Q / mean_Q if mean_Q != 0 else 0  # Coefficient of Variation
            
            # Coefficient of Skewness (Cs)
            from scipy import stats as scipy_stats
            cs = float(scipy_stats.skew(Qmax, bias=False))  # Sample skewness
            
            # Log statistics để debug
            logger.info(f"{distribution_name}: Statistics - mean={mean_Q:.2f}, std={std_Q:.2f}, cv={cv:.4f}, cs={cs:.4f}, n={len(Qmax)}")
            
            # Kiểm tra giá trị bất thường trong statistics
            if mean_Q > 1e6:  # Nếu mean > 1 triệu mm (không hợp lý cho lượng mưa)
                logger.error(f"ERROR: Mean value is extremely large: {mean_Q:.2f} mm")
                logger.error(f"This suggests incorrect data aggregation or transformation")
                logger.error(f"Please check: 1) Aggregation function ({agg_func}), 2) Data transformation, 3) Unit conversion")
            
            # Data quality warnings
            quality_warnings = []
            if cv > 1.0:
                quality_warnings.append(f"Cv rất cao ({cv:.2f}). Data có độ biến động cực lớn, có thể không phù hợp cho phân tích tần suất.")
            if abs(cs) > 2.5:
                quality_warnings.append(f"Cs rất lệch ({cs:.2f}). Phân phối không đối xứng, cần kiểm tra phân phối phù hợp.")
            if n < 30:
                quality_warnings.append(f"Số mẫu nhỏ (n={n}). Kết quả có thể không tin cậy, khuyến nghị n >= 30.")
            # Cảnh báo nếu có giá trị Q âm bị clamp
            if num_clamped > 0:
                quality_warnings.append(
                    f"Có {num_clamped} giá trị Q âm đã được điều chỉnh về 0. "
                    f"Điều này xảy ra khi mô hình ngoại suy quá xa ở tần suất cao (P gần 100%). "
                    f"Kết quả ở tần suất cao (P > 95%) có thể không đáng tin cậy."
                )
            
            # Check distribution validity: Q(P=1%) phải > Q_max
            # Wrap trong try-except vì ppf() có thể chậm hoặc fail với một số distributions
            try:
                Q_1pct = dist.ppf(1 - 0.01, *params)  # Q tại P = 1%
                Q_max_val = float(np.max(Qmax))
                
                # Chỉ check nếu Q_1pct hợp lý (không phải inf, nan, hoặc quá lớn)
                if np.isfinite(Q_1pct) and Q_1pct < Q_max_val * 10:  # Q_1pct không được quá lớn
                    if Q_1pct < Q_max_val:
                        quality_warnings.append(
                            f"CẢNH BÁO NGHIÊM TRỌNG: Phân phối {distribution_name} KHÔNG phù hợp! "
                            f"Q(P=1%)={Q_1pct:.2f} < Q_max={Q_max_val:.2f}. "
                            f"Kết quả phân tích tần suất KHÔNG đáng tin cậy. "
                        )
            except Exception as e:
                logger.warning(f"Could not compute Q(P=1%) for validity check: {str(e)}")
            
            # Extract distribution parameters
            params_dict = extract_params(params)
            
            # Tính confidence intervals (95%) bằng bootstrap (chuẩn HEC-SSP)
            # Chỉ tính nếu n đủ lớn (>= 20) và distribution fit nhanh
            confidence_intervals = None
            
            # Danh sách distributions fit nhanh (cho phép CI)
            # Thêm pearson3, frechet, genpareto vào danh sách để có CI
            # Lưu ý: Một số distribution có thể chậm hơn (pearson3, frechet) nên n_bootstrap được điều chỉnh
            fast_distributions = ['gumbel', 'lognorm', 'gamma', 'logistic', 'expon', 'pearson3', 'frechet', 'genpareto']
            allow_ci = n >= 20 and distribution_name in fast_distributions
            
            if allow_ci:
                try:
                    # QUAN TRỌNG: Tính lại p_values từ p_percent_fixed SAU KHI filter
                    # p_percent_fixed có thể bị filter (giảm số lượng điểm) ở dòng 536-537
                    # Nên phải tính lại p_values để đảm bảo shape khớp
                    
                    # CRITICAL: CI PHẢI MATCH VỚI THEORETICAL CURVE RANGE
                    # Theoretical curve range: min_p = 0.01% đến max_p = 99.99%
                    # CI phải cover toàn bộ range này để match với theoretical curve
                    # Tính empirical P range để biết vùng interpolation
                    p_empirical = Weibull(Qmax)  # Weibull plotting position
                    min_p_empirical = float(np.min(p_empirical))
                    max_p_empirical = float(np.max(p_empirical))
                    
                    # CI range: PHẢI MATCH với theoretical curve range (0.01% - 99.99%)
                    # Để CI kéo dài hết đường cong tần suất
                    ci_min_p = 0.01  # Match với min_p của theoretical curve
                    ci_max_p = 99.99  # Match với max_p của theoretical curve (thay vì 99.9%)
                    ci_mask = (p_percent_fixed >= ci_min_p) & (p_percent_fixed <= ci_max_p)
                    p_percent_for_ci = p_percent_fixed[ci_mask]
                    p_values_for_ci = p_percent_for_ci / 100.0
                    
                    logger.info(f"CI ({distribution_name}): Computing CI for {len(p_percent_for_ci)} points "
                               f"in interpolation range [{ci_min_p:.2f}%, {ci_max_p:.2f}%] "
                               f"(empirical: [{min_p_empirical:.2f}%, {max_p_empirical:.2f}%])")
                    
                    if len(p_values_for_ci) < 5:
                        logger.warning(f"CI: Too few points in interpolation range. CI disabled.")
                        confidence_intervals = None
                    else:
                        # Tăng n_bootstrap lên 1000-1500 để CI chính xác hơn (chuẩn HEC-SSP)
                        # Với n_bootstrap thấp (100), CI có thể bị lệch và không ổn định
                        # Với lognormal heavy tail, cần nhiều bootstrap iterations hơn để ổn định
                        # Với Gumbel, cần nhiều bootstrap để có đủ variation cho CI width 30-80%
                        # Với Pearson3 và Frechet, có thể chậm hơn nên giảm n_bootstrap một chút
                        # Với genpareto, có thể có heavy tail nên cần nhiều bootstrap hơn
                        if distribution_name == 'gumbel':
                            n_bootstrap = 1500  # Tăng lên 1500 cho Gumbel để có đủ variation
                        elif distribution_name == 'pearson3' or distribution_name == 'frechet':
                            n_bootstrap = 800  # Giảm xuống 800 cho Pearson3 và Frechet (fit chậm hơn)
                        elif distribution_name == 'genpareto':
                            n_bootstrap = 1000  # 1000 cho genpareto (có thể có heavy tail)
                        else:
                            n_bootstrap = 1000  # Mặc định 1000 cho các distribution khác
                        alpha = 0.05  # 95% CI
                        
                        bootstrap_quantiles = []
                        # Tính Q_theoretical trước để dùng làm reference cho filtering
                        Q_theoretical_ref = None
                        try:
                            Q_theoretical_ref = dist.ppf(1 - p_values_for_ci, *params)
                        except Exception:
                            pass
                        
                        # CRITICAL: PARALLELIZE BOOTSTRAP với ProcessPoolExecutor để tận dụng CPU
                        # ProcessPoolExecutor thực sự parallelize CPU-bound tasks (scipy operations)
                        # Tốc độ tăng 4-8x tùy vào số CPU cores
                        max_workers = min(mp.cpu_count(), 8)  # Tối đa 8 workers
                        logger.info(f"CI ({distribution_name}): Running {n_bootstrap} bootstrap iterations in parallel ({max_workers} processes)")
                        
                        bootstrap_start_time = time.time()
                        completed_count = 0
                        log_interval = max(1, n_bootstrap // 10)  # Log mỗi 10% progress
                        
                        # Tạo seeds cho mỗi iteration để đảm bảo reproducibility
                        seeds = np.random.randint(0, 2**31, size=n_bootstrap)
                        
                        # Prepare shared data (chỉ copy 1 lần để tránh overhead)
                        Qmax_copy = Qmax.copy()
                        p_values_for_ci_copy = p_values_for_ci.copy()
                        Q_theoretical_ref_copy = Q_theoretical_ref.copy() if Q_theoretical_ref is not None else None
                        
                        # CRITICAL: Dùng ProcessPoolExecutor để thực sự parallelize CPU-bound tasks
                        # ProcessPoolExecutor bypass GIL và sử dụng tất cả CPU cores
                        # Windows: Dùng spawn method (default), Linux/Mac: fork method
                        try:
                            # Prepare arguments (chỉ tạo seeds, không copy arrays nhiều lần)
                            worker_args = [
                                (seed, Qmax_copy, n, distribution_name, p_values_for_ci_copy, 
                                 Q_theoretical_ref_copy, absolute_max)
                                for seed in seeds
                            ]
                            
                            with ProcessPoolExecutor(max_workers=max_workers) as executor:
                                # Submit tất cả bootstrap iterations
                                futures = {executor.submit(_bootstrap_iteration_worker, args): idx 
                                          for idx, args in enumerate(worker_args)}
                                
                                # Collect results với progress tracking
                                for future in as_completed(futures):
                                    try:
                                        result = future.result(timeout=300)  # Timeout 5 phút cho mỗi iteration
                                        if result is not None:
                                            bootstrap_quantiles.append(result)
                                        completed_count += 1
                                        
                                        # Log progress mỗi 10%
                                        if completed_count % log_interval == 0:
                                            progress = (completed_count / n_bootstrap) * 100
                                            elapsed = time.time() - bootstrap_start_time
                                            rate = completed_count / elapsed if elapsed > 0 else 0
                                            logger.info(f"CI ({distribution_name}): Bootstrap progress: {completed_count}/{n_bootstrap} ({progress:.0f}%) - {rate:.1f} iter/s")
                                    except Exception as e:
                                        logger.debug(f"Bootstrap iteration failed: {str(e)}")
                                        completed_count += 1
                        except Exception as e:
                            # Fallback to sequential nếu ProcessPoolExecutor fail
                            logger.warning(f"ProcessPoolExecutor failed: {str(e)}, falling back to sequential")
                            logger.warning(f"Error type: {type(e).__name__}, Error: {str(e)}")
                            for seed in seeds:
                                result = _bootstrap_iteration_worker((seed, Qmax_copy, n, distribution_name, 
                                                                     p_values_for_ci_copy, Q_theoretical_ref_copy, absolute_max))
                                if result is not None:
                                    bootstrap_quantiles.append(result)
                                completed_count += 1
                                if completed_count % log_interval == 0:
                                    progress = (completed_count / n_bootstrap) * 100
                                    logger.info(f"CI ({distribution_name}): Bootstrap progress: {completed_count}/{n_bootstrap} ({progress:.0f}%)")
                        
                        bootstrap_time = time.time() - bootstrap_start_time
                        logger.info(f"CI ({distribution_name}): Bootstrap completed in {bootstrap_time:.2f}s ({len(bootstrap_quantiles)}/{n_bootstrap} successful)")
                        
                        if len(bootstrap_quantiles) == 0:
                            logger.warning(f"All bootstrap iterations failed for {distribution_name}")
                            confidence_intervals = None
                        else:
                            bootstrap_quantiles = np.array(bootstrap_quantiles)
                            logger.info(f"CI ({distribution_name}): {len(bootstrap_quantiles)}/{n_bootstrap} bootstrap iterations successful")
                        
                            # Tính Q_theoretical để so sánh (cần cho validation CI)
                            # Tính lại Q_theoretical cho các P values tương ứng
                            # QUAN TRỌNG: Dùng p_values_for_ci (đã filter) để đảm bảo shape khớp
                            Q_theoretical_for_ci = None
                            try:
                                Q_theoretical_for_ci = dist.ppf(1 - p_values_for_ci, *params)
                            except Exception as e:
                                logger.warning(f"Could not compute Q_theoretical for CI validation: {str(e)}")
                                Q_theoretical_for_ci = None
                            
                            # Tính percentiles (2.5%, 97.5% cho 95% CI)
                            # Ignore NaN values when computing percentiles
                            # QUAN TRỌNG: Dùng method='linear' để đảm bảo chính xác
                            lower_ci = np.nanpercentile(bootstrap_quantiles, 2.5, axis=0, method='linear')
                            upper_ci = np.nanpercentile(bootstrap_quantiles, 97.5, axis=0, method='linear')
                            
                            # CRITICAL FIX FOR GUMBEL: Đảm bảo CI width tối thiểu 30% (theo FFC 2008)
                            # FFC 2008 yêu cầu: CI width = 30-80%, Lower = 15% dưới, Upper = 15% trên
                            # Nếu CI quá narrow, điều chỉnh để đạt minimum
                            if distribution_name == 'gumbel' and Q_theoretical_for_ci is not None:
                                ci_width_check = upper_ci - lower_ci
                                relative_width_check = (ci_width_check / Q_theoretical_for_ci) * 100
                                min_acceptable_width = 30.0  # 30% tối thiểu theo FFC 2008
                                
                                # Điều chỉnh TẤT CẢ các điểm để đảm bảo CI width hợp lý
                                adjusted_count = 0
                                for i in range(len(lower_ci)):
                                    theo = Q_theoretical_for_ci[i]
                                    if theo > 0 and np.isfinite(theo) and np.isfinite(lower_ci[i]) and np.isfinite(upper_ci[i]):
                                        # Target theo FFC 2008: Lower = 15% dưới, Upper = 15% trên, Width = 30%
                                        target_lower = theo * 0.85  # 15% dưới theoretical
                                        target_upper = theo * 1.15   # 15% trên theoretical
                                        target_width = theo * 0.30   # 30% width
                                        
                                        current_width = upper_ci[i] - lower_ci[i]
                                        current_relative_width = (current_width / theo) * 100
                                        
                                        # Nếu CI quá narrow (< 30%), điều chỉnh
                                        if current_relative_width < min_acceptable_width:
                                            # Điều chỉnh lower CI: ít nhất 15% dưới theoretical
                                            if lower_ci[i] > target_lower:
                                                lower_ci[i] = target_lower
                                            
                                            # Điều chỉnh upper CI: ít nhất 15% trên theoretical
                                            if upper_ci[i] < target_upper:
                                                upper_ci[i] = target_upper
                                            
                                            # Đảm bảo width tối thiểu 30%
                                            current_width_after = upper_ci[i] - lower_ci[i]
                                            if current_width_after < target_width:
                                                # Nếu vẫn narrow, mở rộng đối xứng
                                                center = (lower_ci[i] + upper_ci[i]) / 2
                                                lower_ci[i] = center - target_width / 2
                                                upper_ci[i] = center + target_width / 2
                                            
                                            adjusted_count += 1
                                
                                if adjusted_count > 0:
                                    logger.info(f"CI (gumbel): Adjusted {adjusted_count}/{len(lower_ci)} points to meet FFC 2008 minimum width requirement (30%)")
                            
                            # CRITICAL FIX: Bootstrap có thể tạo ra lower > upper tại một số điểm
                            # Điều này xảy ra với lognorm và distributions có heavy tail
                            # PHẢI swap lower và upper tại các điểm bị đảo ngược
                            swap_mask = lower_ci > upper_ci
                            swap_count = np.sum(swap_mask)
                            if swap_count > 0:
                                logger.info(f"CI: Swapping {swap_count}/{len(lower_ci)} points where lower > upper")
                                # Swap lower và upper tại các điểm bị đảo ngược (dùng copy để tránh conflict)
                                lower_ci_copy = lower_ci.copy()
                                lower_ci[swap_mask] = upper_ci[swap_mask]
                                upper_ci[swap_mask] = lower_ci_copy[swap_mask]
                            
                            # VALIDATION: Filter NaN/Inf và CI width quá lớn (unreasonable)
                            # Lognormal và một số distributions có heavy tail → CI rất rộng ở extrapolation
                            # Filter các CI có relative width quá lớn để chart nhìn đẹp hơn
                            valid_mask = np.isfinite(lower_ci) & np.isfinite(upper_ci)
                            initial_valid_count = np.sum(valid_mask)
                            
                            # Filter CI width quá lớn và Q values quá cao so với theoretical (nếu có)
                            width_filtered_count = 0
                            outlier_filtered_count = 0
                        if Q_theoretical_for_ci is not None:
                            ci_width = upper_ci - lower_ci
                            p_percent_array = np.array(p_percent_for_ci)
                            
                            # Xác định vùng: interpolation, extrapolation gần, extrapolation xa
                            is_interpolation = (p_percent_array >= min_p_empirical) & (p_percent_array <= max_p_empirical)
                            is_near_extrapolation = ((p_percent_array >= min_p_empirical * 0.5) & (p_percent_array < min_p_empirical)) | \
                                                   ((p_percent_array > max_p_empirical) & (p_percent_array <= max_p_empirical * 1.5))
                            is_far_extrapolation = (p_percent_array < min_p_empirical * 0.5) | (p_percent_array > max_p_empirical * 1.5)
                            
                            # Threshold width: rộng dần theo mức độ extrapolation
                            # Giảm threshold để filter tốt hơn, đặc biệt với lognormal heavy tail
                            max_width_factor = np.ones_like(p_percent_array, dtype=float)
                            max_width_factor[is_interpolation] = 2.5  # 250% (giảm từ 300%)
                            max_width_factor[is_near_extrapolation] = 6.0  # 600% (giảm từ 1000%)
                            max_width_factor[is_far_extrapolation] = 8.0  # 800% (giảm từ 2000% - quan trọng!)
                            
                            # Threshold cho upper/lower: rộng dần nhưng hợp lý hơn
                            max_upper_factor = np.ones_like(p_percent_array, dtype=float)
                            max_upper_factor[is_interpolation] = 4.0  # Giảm từ 5.0
                            max_upper_factor[is_near_extrapolation] = 8.0  # Giảm từ 15.0
                            max_upper_factor[is_far_extrapolation] = 10.0  # Giảm từ 30.0 - quan trọng!
                            
                            # CRITICAL FIX: Lower CI factor phải khác nhau cho từng distribution
                            # Gumbel: Cho phép lower CI thấp hơn (0.02x = 2%) để có CI width hợp lý
                            # Lognormal: Giữ 0.05x (5%) vì heavy tail
                            # Các distribution khác: 0.03x (3%)
                            if distribution_name == 'gumbel':
                                min_lower_factor = 0.02  # Lower CI >= 2% của theoretical (cho phép CI rộng hơn)
                            elif distribution_name == 'lognorm':
                                min_lower_factor = 0.05  # Lower CI >= 5% của theoretical
                            else:
                                min_lower_factor = 0.03  # Lower CI >= 3% của theoretical
                            
                            # Tính relative width và check outliers cho từng điểm
                            for i in range(len(valid_mask)):
                                if valid_mask[i] and np.isfinite(Q_theoretical_for_ci[i]) and Q_theoretical_for_ci[i] > 0:
                                    theo = Q_theoretical_for_ci[i]
                                    
                                    # Check 1: CI width quá lớn (relative)
                                    relative_width = (ci_width[i] / theo) * 100
                                    if relative_width > max_width_factor[i] * 100:  # Convert factor to percent
                                        valid_mask[i] = False
                                        width_filtered_count += 1
                                        continue
                                    
                                    # Check 2: Upper CI quá cao (outlier)
                                    if upper_ci[i] > theo * max_upper_factor[i]:
                                        valid_mask[i] = False
                                        outlier_filtered_count += 1
                                        continue
                                    
                                    # Check 3: Lower CI quá thấp (unreasonable)
                                    # CRITICAL: Với Gumbel, cho phép lower CI thấp hơn để có CI width hợp lý
                                    if lower_ci[i] < theo * min_lower_factor:
                                        valid_mask[i] = False
                                        outlier_filtered_count += 1
                                        continue
                                    
                                    # Check 4: CI width quá nhỏ (CI quá hẹp, không hợp lý) - CHỈ CẢNH BÁO
                                    # Với Gumbel, relative width tối thiểu nên là 15-20% (theo chuẩn FFC 2008)
                                    # Nếu CI quá hẹp (< 10%), có thể do bootstrap filtering quá mạnh
                                    # NHƯNG: Không filter vì CI hẹp vẫn hợp lý nếu dữ liệu ổn định
                                    if i < len(is_interpolation) and is_interpolation[i]:
                                        min_relative_width = 10.0 if distribution_name == 'gumbel' else 5.0
                                        if relative_width < min_relative_width:
                                            logger.debug(f"CI ({distribution_name}) at P={p_percent_array[i]:.2f}%: width={relative_width:.1f}% (very narrow, may indicate over-filtering)")
                            
                            if width_filtered_count > 0:
                                logger.info(f"CI ({distribution_name}): Filtered {width_filtered_count} points with excessive width")
                            if outlier_filtered_count > 0:
                                logger.info(f"CI ({distribution_name}): Filtered {outlier_filtered_count} outlier points (Q too high/low relative to theoretical)")
                        
                        valid_count = np.sum(valid_mask)
                        total_count = len(p_percent_for_ci)  # Đổi từ p_percent_fixed sang p_percent_for_ci
                        
                        logger.info(f"CI ({distribution_name}): {valid_count}/{total_count} points valid, {swap_count} swapped")
                        
                        if valid_count < total_count * 0.3:
                            logger.warning(f"CI: Only {valid_count}/{total_count} valid. CI disabled.")
                            confidence_intervals = None
                        else:
                            # TẠO CI với các điểm valid (đã filter width quá lớn)
                            # QUAN TRỌNG: Map back từ p_percent_for_ci (đã filter) sang p_percent_fixed (full)
                            lower_points = [{"P_percent": float(p), "Q": float(q)} 
                                           for p, q, valid in zip(p_percent_for_ci, lower_ci, valid_mask) if valid]
                            upper_points = [{"P_percent": float(p), "Q": float(q)} 
                                           for p, q, valid in zip(p_percent_for_ci, upper_ci, valid_mask) if valid]
                            
                            # CRITICAL FIX: Sort theo T (Return Period) TĂNG DẦN để match với logarithmic axis
                            # T = 100 / P_percent → P_percent tăng → T giảm
                            # Để sort T tăng dần: sort P_percent GIẢM DẦN
                            # Nhưng để dễ debug: sort P_percent TĂNG DẦN (T giảm dần) - frontend sẽ xử lý
                            # THỰC TẾ: Frontend cần sort theo T tăng dần → sort P_percent giảm dần
                            # NHƯNG: Để đảm bảo mượt, sort theo P_percent tăng dần (như cũ)
                            # Frontend sẽ convert P → T và sort lại
                            
                            # Sort theo P_percent TĂNG DẦN (T giảm dần) - frontend sẽ sort lại theo T
                            lower_points.sort(key=lambda x: x['P_percent'])
                            upper_points.sort(key=lambda x: x['P_percent'])
                            
                            # CRITICAL FIX: Chỉ lấy các điểm có CẢ lower VÀ upper
                            # Tạo dict để match theo P_percent
                            lower_dict = {pt['P_percent']: pt['Q'] for pt in lower_points}
                            upper_dict = {pt['P_percent']: pt['Q'] for pt in upper_points}
                            
                            # CHỈ lấy các P_percent có CẢ lower VÀ upper (không interpolate)
                            # Interpolation có thể làm sai lệch CI, đặc biệt với heavy-tailed distributions
                            common_p = sorted(set(lower_dict.keys()) & set(upper_dict.keys()))
                            
                            # Tạo CI chỉ với các điểm chung, đảm bảo lower < upper
                            temp_lower = []
                            temp_upper = []
                            
                            for p in common_p:
                                lower_q = lower_dict[p]
                                upper_q = upper_dict[p]
                                
                                # Safety: chỉ thêm nếu lower < upper và hợp lý
                                if lower_q < upper_q and lower_q >= 0 and np.isfinite(lower_q) and np.isfinite(upper_q):
                                    temp_lower.append({"P_percent": float(p), "Q": float(lower_q)})
                                    temp_upper.append({"P_percent": float(p), "Q": float(upper_q)})
                            
                            # OPTIMIZATION: Adaptive sampling để giảm số điểm CI
                            # Mục tiêu: ~200-300 điểm thay vì 2000+ điểm
                            # Strategy: Dense ở interpolation, sparse ở extrapolation
                            if len(temp_lower) > 300:
                                # Xác định vùng: interpolation, extrapolation gần, extrapolation xa
                                p_array = np.array([pt['P_percent'] for pt in temp_lower])
                                
                                is_interpolation = (p_array >= min_p_empirical) & (p_array <= max_p_empirical)
                                is_near_extrapolation = ((p_array >= min_p_empirical * 0.5) & (p_array < min_p_empirical)) | \
                                                       ((p_array > max_p_empirical) & (p_array <= max_p_empirical * 1.5))
                                is_far_extrapolation = (p_array < min_p_empirical * 0.5) | (p_array > max_p_empirical * 1.5)
                                
                                # Sampling ratio: interpolation (1:1 hoặc 1:2), near extrapolation (1:3), far extrapolation (1:5)
                                selected_indices = []
                                
                                # Interpolation: giữ nhiều điểm (1:1 hoặc 1:2)
                                interp_indices = np.where(is_interpolation)[0]
                                if len(interp_indices) > 150:
                                    # Sample để có ~150 điểm
                                    step = max(1, len(interp_indices) // 150)
                                    selected_indices.extend(interp_indices[::step].tolist())
                                else:
                                    selected_indices.extend(interp_indices.tolist())
                                
                                # Near extrapolation: sample 1:2 (giảm từ 1:3 để có nhiều điểm hơn)
                                near_extrap_indices = np.where(is_near_extrapolation)[0]
                                selected_indices.extend(near_extrap_indices[::2].tolist())
                                
                                # Far extrapolation: sample 1:3 (giảm từ 1:5 để giảm gap)
                                far_extrap_indices = np.where(is_far_extrapolation)[0]
                                selected_indices.extend(far_extrap_indices[::3].tolist())
                                
                                # Sort và remove duplicates
                                selected_indices = sorted(set(selected_indices))
                                
                                # Đảm bảo có điểm đầu và cuối
                                if len(temp_lower) > 0:
                                    if 0 not in selected_indices:
                                        selected_indices.insert(0, 0)
                                    if len(temp_lower) - 1 not in selected_indices:
                                        selected_indices.append(len(temp_lower) - 1)
                                    selected_indices = sorted(set(selected_indices))
                                
                                final_lower = [temp_lower[i] for i in selected_indices]
                                final_upper = [temp_upper[i] for i in selected_indices]
                                
                                logger.info(f"CI ({distribution_name}): Sampled {len(final_lower)}/{len(temp_lower)} CI points "
                                           f"(interpolation: {np.sum(is_interpolation[selected_indices])}, "
                                           f"near extrap: {np.sum(is_near_extrapolation[selected_indices])}, "
                                           f"far extrap: {np.sum(is_far_extrapolation[selected_indices])})")
                            else:
                                final_lower = temp_lower
                                final_upper = temp_upper
                            
                            # Sort theo P_percent tăng dần (T giảm dần) - frontend sẽ sort lại theo T
                            final_lower.sort(key=lambda x: x['P_percent'])
                            final_upper.sort(key=lambda x: x['P_percent'])
                            
                            # CRITICAL FIX: Interpolate để fill gaps và đảm bảo continuity
                            # Điều này giúp loại bỏ gaps lớn trong CI
                            if len(final_lower) > 2 and len(final_upper) > 2:
                                # Tạo dict để dễ lookup
                                lower_dict = {pt['P_percent']: pt['Q'] for pt in final_lower}
                                upper_dict = {pt['P_percent']: pt['Q'] for pt in final_upper}
                                
                                # Lấy tất cả P_percent có cả lower và upper
                                common_p_sorted = sorted(set(lower_dict.keys()) & set(upper_dict.keys()))
                                
                                if len(common_p_sorted) > 2:
                                    # Kiểm tra gaps lớn (> 5% P_percent)
                                    p_array = np.array(common_p_sorted)
                                    gaps = np.diff(p_array)
                                    max_gap_threshold = 5.0  # 5% P_percent
                                    
                                    # Nếu có gap lớn, interpolate
                                    if np.any(gaps > max_gap_threshold):
                                        # Tạo P_percent mới để interpolate
                                        p_min = common_p_sorted[0]
                                        p_max = common_p_sorted[-1]
                                        
                                        # Tạo grid với spacing tối đa 1% để đảm bảo continuity
                                        max_spacing = 1.0  # 1% P_percent
                                        p_interp = np.arange(p_min, p_max + max_spacing, max_spacing)
                                        
                                        # Interpolate lower và upper CI
                                        lower_q_array = np.array([lower_dict[p] for p in common_p_sorted])
                                        upper_q_array = np.array([upper_dict[p] for p in common_p_sorted])
                                        
                                        # Dùng linear interpolation (phù hợp với mixed scale)
                                        try:
                                            # Chỉ interpolate trong range có data
                                            lower_interp_func = interp1d(common_p_sorted, lower_q_array, 
                                                                        kind='linear', bounds_error=False, 
                                                                        fill_value='extrapolate')
                                            upper_interp_func = interp1d(common_p_sorted, upper_q_array, 
                                                                        kind='linear', bounds_error=False, 
                                                                        fill_value='extrapolate')
                                            
                                            # Interpolate
                                            lower_interp = lower_interp_func(p_interp)
                                            upper_interp = upper_interp_func(p_interp)
                                            
                                            # Filter: chỉ giữ các điểm có lower < upper và hợp lý
                                            valid_interp = (lower_interp < upper_interp) & \
                                                          (lower_interp >= 0) & \
                                                          np.isfinite(lower_interp) & \
                                                          np.isfinite(upper_interp)
                                            
                                            # Tạo final lists với interpolated points
                                            final_lower_interp = [{"P_percent": float(p), "Q": float(q)} 
                                                                  for p, q, valid in zip(p_interp, lower_interp, valid_interp) if valid]
                                            final_upper_interp = [{"P_percent": float(p), "Q": float(q)} 
                                                                  for p, q, valid in zip(p_interp, upper_interp, valid_interp) if valid]
                                            
                                            # Đảm bảo có cả lower và upper cho mỗi P_percent
                                            lower_dict_interp = {pt['P_percent']: pt['Q'] for pt in final_lower_interp}
                                            upper_dict_interp = {pt['P_percent']: pt['Q'] for pt in final_upper_interp}
                                            common_p_interp = sorted(set(lower_dict_interp.keys()) & set(upper_dict_interp.keys()))
                                            
                                            final_lower = [{"P_percent": float(p), "Q": float(lower_dict_interp[p])} 
                                                          for p in common_p_interp]
                                            final_upper = [{"P_percent": float(p), "Q": float(upper_dict_interp[p])} 
                                                          for p in common_p_interp]
                                            
                                            logger.info(f"CI ({distribution_name}): Interpolated {len(final_lower)} points "
                                                       f"(original: {len(common_p_sorted)}, gaps filled: {np.sum(gaps > max_gap_threshold)})")
                                        except Exception as e:
                                            logger.warning(f"CI interpolation failed: {str(e)}, using original points")
                                            # Fallback: dùng original points
                                            final_lower = [{"P_percent": float(p), "Q": float(lower_dict[p])} 
                                                          for p in common_p_sorted]
                                            final_upper = [{"P_percent": float(p), "Q": float(upper_dict[p])} 
                                                          for p in common_p_sorted]
                                    else:
                                        # Không có gap lớn, dùng original points nhưng đảm bảo có cả lower và upper
                                        final_lower = [{"P_percent": float(p), "Q": float(lower_dict[p])} 
                                                      for p in common_p_sorted]
                                        final_upper = [{"P_percent": float(p), "Q": float(upper_dict[p])} 
                                                      for p in common_p_sorted]
                                else:
                                    # Quá ít điểm, không interpolate nhưng vẫn đảm bảo có cả lower và upper
                                    final_lower = [{"P_percent": float(p), "Q": float(lower_dict[p])} 
                                                  for p in common_p_sorted if p in upper_dict]
                                    final_upper = [{"P_percent": float(p), "Q": float(upper_dict[p])} 
                                                  for p in common_p_sorted if p in upper_dict]
                            
                            confidence_intervals = {
                                "lower": final_lower,
                                "upper": final_upper
                            }
                            
                            # DEBUG: Kiểm tra lower < upper tại một số điểm quan trọng
                            if confidence_intervals and len(confidence_intervals['lower']) > 0:
                                # Check first 3 và last 3 points
                                lower_sample = confidence_intervals['lower'][:3] + confidence_intervals['lower'][-3:]
                                upper_sample = confidence_intervals['upper'][:3] + confidence_intervals['upper'][-3:]
                                
                                # Tạo dict để match theo P_percent
                                lower_dict = {pt['P_percent']: pt['Q'] for pt in confidence_intervals['lower']}
                                upper_dict = {pt['P_percent']: pt['Q'] for pt in confidence_intervals['upper']}
                                
                                # Check inversion
                                inversion_count = 0
                                for pt in lower_sample:
                                    p = pt['P_percent']
                                    if p in upper_dict:
                                        if pt['Q'] > upper_dict[p]:
                                            inversion_count += 1
                                            logger.warning(f"[BACKEND DEBUG] CI INVERTED at P={p:.4f}%: lower={pt['Q']:.2f} > upper={upper_dict[p]:.2f}")
                                
                                if inversion_count == 0:
                                    logger.info(f"[BACKEND DEBUG] CI validation: All sampled points have lower < upper")
                                else:
                                    logger.error(f"[BACKEND DEBUG] CI validation: Found {inversion_count} inverted points!")
                            
                            # Log thống kê CI với thông tin về distribution
                            if confidence_intervals and len(confidence_intervals['lower']) > 0:
                                lower_dict = {pt['P_percent']: pt['Q'] for pt in confidence_intervals['lower']}
                                upper_dict = {pt['P_percent']: pt['Q'] for pt in confidence_intervals['upper']}
                                common_p = set(lower_dict.keys()) & set(upper_dict.keys())
                                
                                ci_widths = [upper_dict[p] - lower_dict[p] for p in common_p if p in lower_dict and p in upper_dict]
                                if ci_widths:
                                    avg_width = np.mean(ci_widths)
                                    max_width = np.max(ci_widths)
                                    min_width = np.min(ci_widths)
                                    if Q_theoretical_for_ci is not None:
                                        # Tính relative width so với theoretical
                                        # Tạo dict cho theoretical - chỉ dùng các điểm hợp lệ
                                        theo_dict = {p: q for p, q in zip(p_percent_for_ci, Q_theoretical_for_ci) 
                                                    if np.isfinite(q) and q > 0}
                                        relative_widths = [(upper_dict[p] - lower_dict[p]) / theo_dict[p] * 100 
                                                           for p in common_p if p in theo_dict and theo_dict[p] > 0]
                                        if relative_widths:
                                            avg_relative = np.mean(relative_widths)
                                            max_relative = np.max(relative_widths)
                                            min_relative = np.min(relative_widths)
                                            logger.info(f"CI ({distribution_name}): {len(common_p)} points, "
                                                       f"width: avg={avg_width:.2f}, min={min_width:.2f}, max={max_width:.2f}, "
                                                       f"relative: avg={avg_relative:.1f}%, min={min_relative:.1f}%, max={max_relative:.1f}%")
                                        else:
                                            logger.info(f"CI ({distribution_name}): {len(common_p)} points, "
                                                       f"width: avg={avg_width:.2f}, min={min_width:.2f}, max={max_width:.2f}")
                                    else:
                                        logger.info(f"CI ({distribution_name}): {len(common_p)} points, "
                                                   f"width: avg={avg_width:.2f}, min={min_width:.2f}, max={max_width:.2f}")
                except Exception as e:
                    logger.warning(f"Failed to compute confidence intervals: {str(e)}")
                    # Log thêm thông tin debug nếu là shape mismatch
                    if "broadcast" in str(e).lower() or "shape" in str(e).lower():
                        logger.error(f"Shape mismatch detected in CI calculation: {str(e)}", exc_info=True)
                    confidence_intervals = None
            
            # Log để debug
            logger.info(f"Statistics: mean={mean_Q:.2f}, CV={cv:.3f}, Cs={cs:.3f}, n={n}")
            if confidence_intervals:
                logger.info(f"Confidence intervals: computed")
            else:
                logger.info(f"Confidence intervals: skipped (distribution={distribution_name}, allow_ci={allow_ci})")
            logger.info(f"Total time: {time.time()-t0:.2f}s")
            logger.info(f"===========================================\n")

            return {
                "theoretical_curve": theoretical_curve, 
                "empirical_points": empirical_points,
                "confidence_intervals": confidence_intervals,
                "statistics": {
                    "mean": self._convert_to_python_type(round(mean_Q, 2)),
                    "std": self._convert_to_python_type(round(std_Q, 2)),
                    "cv": self._convert_to_python_type(round(cv, 3)),
                    "cs": self._convert_to_python_type(round(cs, 3)),
                    "n": self._convert_to_python_type(int(n))
                },
                "parameters": params_dict,
                "distribution": distribution_name,
                "quality_warnings": quality_warnings  # Thêm warnings
            }
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Unexpected error in compute_frequency_curve: {str(e)}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Lỗi server khi tính frequency curve: {str(e)}")

    def _convert_to_python_type(self, value):
        """
        Convert numpy types sang Python native types để JSON serializable.
        Handle NaN, Inf, và các edge cases.
        """
        if value is None:
            return None
        
        # Convert numpy types
        if isinstance(value, (np.integer, np.int64, np.int32, np.int16, np.int8)):
            return int(value)
        elif isinstance(value, (np.floating, np.float64, np.float32, np.float16)):
            val = float(value)
            # Handle NaN và Inf
            if np.isnan(val) or np.isinf(val):
                return None
            return val
        elif isinstance(value, np.ndarray):
            # Convert array to list
            return [self._convert_to_python_type(v) for v in value]
        elif isinstance(value, (list, tuple)):
            return [self._convert_to_python_type(v) for v in value]
        elif isinstance(value, dict):
            return {k: self._convert_to_python_type(v) for k, v in value.items()}
        else:
            # Try to convert to float/int if possible
            try:
                if isinstance(value, (int, float)):
                    if np.isnan(value) or np.isinf(value):
                        return None
                    return float(value) if isinstance(value, float) else int(value)
            except (TypeError, ValueError):
                pass
            return value

    def compute_qq_pp(self, distribution_name: str, agg_func: str= 'max'):
        """
        Compute QQ-PP plot data với error handling và validation đầy đủ.
        """
        try:
            # Validation
            validate_agg_func(agg_func)
            if distribution_name not in distributions:
                raise HTTPException(status_code=400, detail=f"Mô hình {distribution_name} không được hỗ trợ.")
            
            df = self.data_service.data
            main_column = self.data_service.main_column
            
            if df is None or df.empty:
                raise HTTPException(status_code=404, detail="Dữ liệu chưa được tải hoặc rỗng")
            
            if main_column not in df.columns:
                raise HTTPException(status_code=400, detail=f"Cột dữ liệu '{main_column}' không tồn tại")
            
            # Get aggregated data
            try:
                aggregated = df.groupby('Year')[main_column].agg(agg_func)
                # Convert to numeric và filter invalid values
                Qmax = pd.to_numeric(aggregated, errors='coerce').values
                # Filter out NaN, Inf, None, và non-numeric values
                Qmax = Qmax[np.isfinite(Qmax)]
            except Exception as e:
                logger.error(f"Error aggregating data: {str(e)}")
                raise HTTPException(status_code=400, detail=f"Lỗi khi xử lý dữ liệu: {str(e)}")
            
            # Validate data
            if Qmax.size == 0:
                logger.warning("Qmax is empty")
                return {"qq": [], "pp": []}
            
            # Filter out invalid values (NaN, Inf, negative if not allowed)
            valid_mask = np.isfinite(Qmax) & (Qmax > 0)  # Assume positive values for hydrological data
            Qmax_filtered = Qmax[valid_mask]
            
            if Qmax_filtered.size == 0:
                logger.warning("No valid data points after filtering")
                raise HTTPException(status_code=400, detail="Không có dữ liệu hợp lệ sau khi lọc (NaN/Inf/âm)")
            
            if Qmax_filtered.size < 3:
                raise HTTPException(status_code=400, detail=f"Dữ liệu không đủ (cần ít nhất 3 điểm, hiện có {Qmax_filtered.size})")
            
            # Get distribution
            dist = distributions[distribution_name]
            
            # Fit distribution với error handling
            try:
                params = dist.fit(Qmax_filtered)
                # Validate params
                if params is None or len(params) == 0:
                    raise ValueError("Không thể ước lượng tham số phân phối")
                # Check for invalid params
                if any(not np.isfinite(p) for p in params):
                    raise ValueError("Tham số phân phối không hợp lệ (NaN/Inf)")
            except Exception as e:
                logger.error(f"Error fitting {distribution_name}: {str(e)}")
                raise HTTPException(status_code=400, detail=f"Không thể fit phân phối {distribution_name}: {str(e)}")
            
            # Sort data
            sorted_Q = np.sort(Qmax_filtered)
            n = len(sorted_Q)
            
            # Compute QQ-PP data
            qq_data = []
            pp_data = []
            
            for i in range(n):
                try:
                    p_empirical = (i + 1) / (n + 1)
                    
                    # Compute theoretical quantile
                    try:
                        theoretical_quantile = dist.ppf(p_empirical, *params)
                        if not np.isfinite(theoretical_quantile):
                            logger.warning(f"Invalid theoretical_quantile at i={i}: {theoretical_quantile}")
                            continue
                    except Exception as e:
                        logger.warning(f"Error computing theoretical_quantile at i={i}: {str(e)}")
                        continue
                    
                    # Compute theoretical CDF
                    try:
                        theoretical_cdf = dist.cdf(sorted_Q[i], *params)
                        if not np.isfinite(theoretical_cdf):
                            logger.warning(f"Invalid theoretical_cdf at i={i}: {theoretical_cdf}")
                            continue
                    except Exception as e:
                        logger.warning(f"Error computing theoretical_cdf at i={i}: {str(e)}")
                        continue
                    
                    # Convert to Python native types
                    qq_data.append({
                        "p_empirical": self._convert_to_python_type(p_empirical),
                        "sample": self._convert_to_python_type(sorted_Q[i]),
                        "theoretical": self._convert_to_python_type(theoretical_quantile)
                    })
                    pp_data.append({
                        "empirical": self._convert_to_python_type(p_empirical),
                        "theoretical": self._convert_to_python_type(theoretical_cdf)
                    })
                except Exception as e:
                    logger.warning(f"Error processing point i={i}: {str(e)}")
                    continue
            
            if len(qq_data) == 0 or len(pp_data) == 0:
                raise HTTPException(status_code=400, detail="Không thể tính toán QQ-PP data (tất cả điểm đều không hợp lệ)")
            
            return {"qq": qq_data, "pp": pp_data}
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Unexpected error in compute_qq_pp: {str(e)}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Lỗi server khi tính toán QQ-PP: {str(e)}")

    def get_frequency_analysis(self):
        df = self.data_service.data
        main_column = self.data_service.main_column
        
        if df is None:
            raise HTTPException(status_code=404, detail="Dữ liệu chưa được tải")
        
        agg_df = df.groupby('Year', as_index=False).agg({main_column: 'max'})
        
        agg_df["Thời gian"] = agg_df["Year"].astype(str) + "-" + (agg_df["Year"] + 1).astype(str)
        
        agg_df['Thứ hạng'] = agg_df[main_column].rank(ascending=False, method='min').astype(int)
        
        n = len(agg_df)
        agg_df["Tần suất P(%)"] = (agg_df['Thứ hạng'] / (n + 1)) * 100
        
        agg_df = agg_df.sort_values("Year").reset_index(drop=True)
        agg_df["Thứ tự"] = agg_df.index + 1
        
        agg_df = agg_df.rename(columns={main_column: "Chỉ số"})
        
        output_df = agg_df[["Thứ tự", "Thời gian", "Chỉ số", "Tần suất P(%)", "Thứ hạng"]]
        
        output_df.loc[:, "Tần suất P(%)"] = output_df["Tần suất P(%)"].round(2)
        output_df.loc[:, "Chỉ số"] = output_df["Chỉ số"].round(2)

        return output_df.to_dict(orient="records")

    def get_frequency_by_model(self, distribution_name: str, agg_func: str= 'max'):
        validate_agg_func(agg_func)
        if distribution_name not in distributions:
            raise HTTPException(status_code=400, detail=f"Mô hình {distribution_name} không được hỗ trợ.")
        
        df = self.data_service.data
        main_column = self.data_service.main_column
        
        if df is None:
            raise HTTPException(status_code=404, detail="Dữ liệu chưa được tải")
        
        Qmax = df.groupby('Year')[main_column].agg(agg_func).values
        
        if Qmax.size == 0:
            return {}
        
        dist = distributions[distribution_name]
        
        params = dist.fit(Qmax)
        
        fixed_p_percent = np.array([
            0.01, 0.10, 0.20, 0.33, 0.50, 1.00, 1.50, 2.00, 3.00, 5.00, 10.00,
            20.00, 25.00, 30.00, 40.00, 50.00, 60.00, 70.00, 75.00, 80.00,
            85.00, 90.00, 95.00, 97.00, 99.00, 99.90, 99.99
        ])
        p_values = fixed_p_percent / 100.0
        
        Q_theoretical = dist.ppf(1 - p_values, *params)
        
        T_theoretical = 100 / fixed_p_percent
        
        # QUAN TRỌNG: Clamp giá trị âm về 0 vì lượng mưa/lưu lượng không thể âm
        # Theo chuẩn phân tích tần suất, giá trị Q phải >= 0
        Q_theoretical_clamped = np.maximum(Q_theoretical, 0)
        
        # Đếm số giá trị bị clamp để thêm vào cảnh báo
        num_clamped = np.sum(Q_theoretical < 0)
        
        theoretical_curve = []
        for i, (p, q_orig, q_clamped, T) in enumerate(zip(fixed_p_percent, Q_theoretical, Q_theoretical_clamped, T_theoretical), start=1):
            point = {
                "Thứ tự": i,
                "Tần suất P(%)": f"{p:.2f}",
                "Lưu lượng dòng chảy Q m³/s": f"{q_clamped:.2f}",
                "Thời gian lặp lại (năm)": f"{T:.3f}"
            }
            # Thêm flag nếu giá trị đã bị clamp
            if q_orig < 0:
                point["clamped"] = True
                point["original_value"] = f"{q_orig:.2f}"
            theoretical_curve.append(point)
        
        Q_sorted_desc = sorted(Qmax, reverse=True)
        n = len(Q_sorted_desc)
        
        ranks = np.arange(1, n + 1)
        
        p_empirical = ranks / (n + 1)
        p_percent_empirical = p_empirical * 100
        
        T_empirical = (n + 1) / ranks
        
        empirical_points = [
            {
                "Thứ tự": i,
                "Tần suất P(%)": f"{p:.2f}",
                "Lưu lượng dòng chảy Q m³/s": f"{q:.2f}",
                "Thời gian lặp lại (năm)": f"{T:.3f}"
            }
            for i, (p, q, T) in enumerate(zip(p_percent_empirical, Q_sorted_desc, T_empirical), start=1)
        ]
        
        result = {
            "theoretical_curve": theoretical_curve,
            "empirical_points": empirical_points,
        }
        
        # Thêm cảnh báo nếu có giá trị bị clamp
        if num_clamped > 0:
            result["warning"] = f"Có {num_clamped} giá trị Q âm đã được chuyển về 0. Điều này xảy ra khi mô hình ngoại suy quá xa ở tần suất cao (P gần 100%)."
        
        return result
        qq_data = []
        pp_data = []
        for i in range(n):
            p_empirical = (i + 1) / (n + 1)
            theoretical_quantile = dist.ppf(p_empirical, *params)
            empirical_cdf = p_empirical
            theoretical_cdf = dist.cdf(sorted_Q[i], *params)
            qq_data.append({
                "p_empirical": p_empirical,
                "sample": sorted_Q[i],
                "theoretical": theoretical_quantile
            })
            pp_data.append({
                "empirical": empirical_cdf,
                "theoretical": theoretical_cdf
            })
        
        return {"qq": qq_data, "pp": pp_data}

    def get_frequency_analysis(self):
        df = self.data_service.data
        main_column = self.data_service.main_column
        
        if df is None:
            raise HTTPException(status_code=404, detail="Dữ liệu chưa được tải")
        
        agg_df = df.groupby('Year', as_index=False).agg({main_column: 'max'})
        
        agg_df["Thời gian"] = agg_df["Year"].astype(str) + "-" + (agg_df["Year"] + 1).astype(str)
        
        agg_df['Thứ hạng'] = agg_df[main_column].rank(ascending=False, method='min').astype(int)
        
        n = len(agg_df)
        agg_df["Tần suất P(%)"] = (agg_df['Thứ hạng'] / (n + 1)) * 100
        
        agg_df = agg_df.sort_values("Year").reset_index(drop=True)
        agg_df["Thứ tự"] = agg_df.index + 1
        
        agg_df = agg_df.rename(columns={main_column: "Chỉ số"})
        
        output_df = agg_df[["Thứ tự", "Thời gian", "Chỉ số", "Tần suất P(%)", "Thứ hạng"]]
        
        output_df.loc[:, "Tần suất P(%)"] = output_df["Tần suất P(%)"].round(2)
        output_df.loc[:, "Chỉ số"] = output_df["Chỉ số"].round(2)

        return output_df.to_dict(orient="records")

    def get_frequency_by_model(self, distribution_name: str, agg_func: str= 'max'):
        validate_agg_func(agg_func)
        if distribution_name not in distributions:
            raise HTTPException(status_code=400, detail=f"Mô hình {distribution_name} không được hỗ trợ.")
        
        df = self.data_service.data
        main_column = self.data_service.main_column
        
        if df is None:
            raise HTTPException(status_code=404, detail="Dữ liệu chưa được tải")
        
        Qmax = df.groupby('Year')[main_column].agg(agg_func).values
        
        if Qmax.size == 0:
            return {}
        
        dist = distributions[distribution_name]
        
        params = dist.fit(Qmax)
        
        fixed_p_percent = np.array([
            0.01, 0.10, 0.20, 0.33, 0.50, 1.00, 1.50, 2.00, 3.00, 5.00, 10.00,
            20.00, 25.00, 30.00, 40.00, 50.00, 60.00, 70.00, 75.00, 80.00,
            85.00, 90.00, 95.00, 97.00, 99.00, 99.90, 99.99
        ])
        p_values = fixed_p_percent / 100.0
        
        Q_theoretical = dist.ppf(1 - p_values, *params)
        
        T_theoretical = 100 / fixed_p_percent
        
        # QUAN TRỌNG: Clamp giá trị âm về 0 vì lượng mưa/lưu lượng không thể âm
        Q_theoretical_clamped = np.maximum(Q_theoretical, 0)
        
        # Đếm số giá trị bị clamp để thêm vào cảnh báo
        num_clamped = np.sum(Q_theoretical < 0)
        
        theoretical_curve = []
        for i, (p, q_orig, q_clamped, T) in enumerate(zip(fixed_p_percent, Q_theoretical, Q_theoretical_clamped, T_theoretical), start=1):
            point = {
                "Thứ tự": i,
                "Tần suất P(%)": f"{p:.2f}",
                "Lưu lượng dòng chảy Q m³/s": f"{q_clamped:.2f}",
                "Thời gian lặp lại (năm)": f"{T:.3f}"
            }
            # Thêm flag nếu giá trị đã bị clamp
            if q_orig < 0:
                point["clamped"] = True
                point["original_value"] = f"{q_orig:.2f}"
            theoretical_curve.append(point)
        
        Q_sorted_desc = sorted(Qmax, reverse=True)
        n = len(Q_sorted_desc)
        
        ranks = np.arange(1, n + 1)
        
        p_empirical = ranks / (n + 1)
        p_percent_empirical = p_empirical * 100
        
        T_empirical = (n + 1) / ranks
        
        empirical_points = [
            {
                "Thứ tự": i,
                "Tần suất P(%)": f"{p:.2f}",
                "Lưu lượng dòng chảy Q m³/s": f"{q:.2f}",
                "Thời gian lặp lại (năm)": f"{T:.3f}"
            }
            for i, (p, q, T) in enumerate(zip(p_percent_empirical, Q_sorted_desc, T_empirical), start=1)
        ]
        
        result = {
            "theoretical_curve": theoretical_curve,
            "empirical_points": empirical_points,
        }
        
        # Thêm cảnh báo nếu có giá trị bị clamp
        if num_clamped > 0:
            result["warning"] = f"Có {num_clamped} giá trị Q âm đã được chuyển về 0. Điều này xảy ra khi mô hình ngoại suy quá xa ở tần suất cao (P gần 100%)."
        
        return result