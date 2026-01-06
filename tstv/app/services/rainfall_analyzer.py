"""
Rainfall Data Analyzer - Đánh giá chất lượng dữ liệu và đưa ra khuyến nghị
"""
import logging
from typing import Dict, Any, List, Tuple
import numpy as np
from collections import Counter

logger = logging.getLogger(__name__)

class RainfallDataAnalyzer:
    """
    Analyzer để đánh giá chất lượng dữ liệu rainfall và đưa ra khuyến nghị
    
    Nguyên tắc: Không bắt buộc user phải theo, chỉ đưa ra warnings và suggestions
    """
    
    # Thresholds (có thể config)
    MIN_RECOMMENDED_SAMPLES = 20  # Tối thiểu 20 samples cho frequency analysis
    ZERO_RATIO_WARNING = 0.5      # Cảnh báo nếu > 50% là zero
    DUPLICATE_RATIO_WARNING = 0.3  # Cảnh báo nếu > 30% là duplicate
    LOW_CONFIDENCE_THRESHOLD = 0.7 # Confidence < 0.7 → warning
    
    def __init__(self):
        pass
    
    def analyze_data_quality(
        self, 
        data: List[Dict[str, Any]], 
        metadata: Dict[str, Any],
        request_params: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Phân tích toàn diện chất lượng dữ liệu
        
        Args:
            data: List of {"Year": int, "Rainfall": float}
            metadata: Metadata từ API (confidence, quality, etc.)
            request_params: Parameters user đã chọn (days, data_field, min_threshold)
        
        Returns:
            Dict với:
            - quality_score: 0-100
            - issues: List các vấn đề phát hiện
            - warnings: List các cảnh báo
            - suggestions: List các khuyến nghị
            - is_suitable_for_analysis: bool
        """
        values = [d["Rainfall"] for d in data]
        n_samples = len(values)
        
        issues = []
        warnings = []
        suggestions = []
        quality_score = 100.0
        
        # 1. Kiểm tra số lượng samples
        if n_samples < self.MIN_RECOMMENDED_SAMPLES:
            severity = "critical" if n_samples < 10 else "warning"
            issues.append({
                "type": "insufficient_samples",
                "severity": severity,
                "message": f"Chỉ có {n_samples} điểm dữ liệu (khuyến nghị >= {self.MIN_RECOMMENDED_SAMPLES})",
                "impact": "Phân tích tần suất có thể không chính xác với ít data"
            })
            quality_score -= 20 if severity == "critical" else 10
            
            # Suggest tăng days hoặc giảm threshold
            if request_params.get("min_threshold", 0) > 0:
                suggestions.append({
                    "type": "reduce_threshold",
                    "message": f"Giảm min_threshold từ {request_params['min_threshold']} xuống để có thêm data",
                    "suggested_value": max(0, request_params['min_threshold'] / 2)
                })
            
            suggested_days = int(request_params.get("days", 30) * 2)
            suggestions.append({
                "type": "increase_days",
                "message": f"Tăng số ngày từ {request_params.get('days', 30)} lên {suggested_days} để có thêm data",
                "suggested_value": suggested_days
            })
        
        # 2. Kiểm tra tỷ lệ zero values (chỉ áp dụng nếu min_threshold = 0)
        if request_params.get("min_threshold", 0) == 0:
            zero_count = sum(1 for v in values if v == 0)
            zero_ratio = zero_count / n_samples if n_samples > 0 else 0
            
            if zero_ratio > self.ZERO_RATIO_WARNING:
                issues.append({
                    "type": "high_zero_ratio",
                    "severity": "warning",
                    "message": f"{zero_ratio*100:.1f}% dữ liệu là 0 ({zero_count}/{n_samples})",
                    "impact": "Distribution fitting sẽ không chính xác với nhiều zero values"
                })
                quality_score -= 15
                
                suggestions.append({
                    "type": "set_threshold",
                    "message": "Đặt min_threshold > 0 để loại bỏ ngày không mưa",
                    "suggested_value": 0.1
                })
                
                # Suggest dùng data_field khác
                if request_params.get("data_field") == "rainfall":
                    suggestions.append({
                        "type": "change_data_field",
                        "message": "Dùng data_field='max' hoặc 'mean' thay vì 'rainfall' để giảm số zero",
                        "suggested_value": "max"
                    })
        
        # 3. Kiểm tra duplicate values
        value_counts = Counter(values)
        duplicate_ratio = sum(1 for count in value_counts.values() if count > 1) / len(value_counts) if value_counts else 0
        
        if duplicate_ratio > self.DUPLICATE_RATIO_WARNING:
            most_common = value_counts.most_common(3)
            issues.append({
                "type": "high_duplicate_ratio",
                "severity": "info",
                "message": f"{duplicate_ratio*100:.1f}% giá trị bị trùng lặp",
                "details": f"Giá trị phổ biến nhất: {most_common}",
                "impact": "Có thể ảnh hưởng đến distribution fitting"
            })
            quality_score -= 5
            
            # Suggest tăng days để có thêm diverse data
            if request_params.get("days", 30) < 90:
                suggestions.append({
                    "type": "increase_days_for_diversity",
                    "message": f"Tăng số ngày lên 90-180 để có dữ liệu đa dạng hơn",
                    "suggested_value": 90
                })
        
        # 4. Kiểm tra confidence từ API
        avg_confidence = metadata.get("avgConfidence")
        if avg_confidence is not None and avg_confidence < self.LOW_CONFIDENCE_THRESHOLD:
            issues.append({
                "type": "low_confidence",
                "severity": "warning",
                "message": f"Độ tin cậy trung bình thấp: {avg_confidence:.2f}",
                "impact": "Dữ liệu nội suy có thể không chính xác"
            })
            quality_score -= 10
            
            suggestions.append({
                "type": "increase_k",
                "message": f"Tăng số trạm (k) từ {request_params.get('k', 8)} để cải thiện confidence",
                "suggested_value": min(20, request_params.get('k', 8) + 5)
            })
        
        # 5. Kiểm tra data quality từ API
        api_quality = metadata.get("quality", "").lower()
        if api_quality in ["poor", "bad"]:
            issues.append({
                "type": "poor_api_quality",
                "severity": "warning",
                "message": f"Chất lượng dữ liệu API: {api_quality}",
                "impact": "Kết quả phân tích có thể không đáng tin cậy"
            })
            quality_score -= 15
        
        # 6. Kiểm tra missing days
        missing_days = metadata.get("missingDays", 0)
        total_days = metadata.get("totalDays", 0)
        if missing_days > 0 and total_days > 0:
            missing_ratio = missing_days / total_days
            if missing_ratio > 0.2:  # > 20% missing
                issues.append({
                    "type": "high_missing_ratio",
                    "severity": "info",
                    "message": f"Thiếu {missing_days}/{total_days} ngày ({missing_ratio*100:.1f}%)",
                    "impact": "Có thể ảnh hưởng đến tính liên tục của dữ liệu"
                })
                quality_score -= 5
        
        # 7. Statistical checks
        if n_samples >= 5:  # Cần ít nhất 5 samples
            stat_issues = self._check_statistical_properties(values)
            issues.extend(stat_issues["issues"])
            warnings.extend(stat_issues["warnings"])
            suggestions.extend(stat_issues["suggestions"])
            quality_score -= stat_issues["penalty"]
        
        # Tính toán overall assessment
        quality_score = max(0, min(100, quality_score))
        
        is_suitable_for_analysis = (
            quality_score >= 50 and 
            n_samples >= 10 and
            not any(issue["severity"] == "critical" for issue in issues)
        )
        
        # Generate summary message
        if quality_score >= 80:
            summary = "Dữ liệu chất lượng tốt, phù hợp cho phân tích tần suất"
        elif quality_score >= 60:
            summary = "Dữ liệu chấp nhận được, có thể phân tích nhưng cần thận trọng"
        elif quality_score >= 40:
            summary = "Dữ liệu chất lượng trung bình, khuyến nghị cải thiện trước khi phân tích"
        else:
            summary = "Dữ liệu chất lượng kém, không khuyến nghị cho phân tích tần suất"
        
        return {
            "quality_score": round(quality_score, 1),
            "summary": summary,
            "is_suitable_for_analysis": is_suitable_for_analysis,
            "n_samples": n_samples,
            "issues": issues,
            "warnings": warnings,
            "suggestions": suggestions,
            "statistics": self._compute_basic_stats(values)
        }
    
    def _check_statistical_properties(self, values: List[float]) -> Dict[str, Any]:
        """Kiểm tra các tính chất thống kê"""
        issues = []
        warnings = []
        suggestions = []
        penalty = 0
        
        values_array = np.array(values)
        
        # 1. Kiểm tra variance (quá thấp = data không diverse)
        std = np.std(values_array)
        mean = np.mean(values_array)
        
        if std == 0:
            issues.append({
                "type": "no_variance",
                "severity": "critical",
                "message": "Tất cả giá trị giống nhau (std = 0)",
                "impact": "Không thể fit distribution"
            })
            penalty += 30
        elif mean > 0 and std / mean < 0.1:  # Coefficient of variation < 0.1
            warnings.append({
                "type": "low_variance",
                "message": f"Độ biến thiên thấp (CV = {std/mean:.3f})",
                "impact": "Dữ liệu ít diversity"
            })
            suggestions.append({
                "type": "increase_days_for_variance",
                "message": "Tăng số ngày để có dữ liệu đa dạng hơn",
                "suggested_value": None
            })
            penalty += 5
        
        # 2. Kiểm tra outliers (có thể ảnh hưởng fitting)
        if len(values_array) >= 10:
            q1 = np.percentile(values_array, 25)
            q3 = np.percentile(values_array, 75)
            iqr = q3 - q1
            
            if iqr > 0:
                outlier_count = np.sum((values_array < q1 - 1.5*iqr) | (values_array > q3 + 1.5*iqr))
                outlier_ratio = outlier_count / len(values_array)
                
                if outlier_ratio > 0.1:  # > 10% outliers
                    warnings.append({
                        "type": "high_outliers",
                        "message": f"{outlier_count} outliers phát hiện ({outlier_ratio*100:.1f}%)",
                        "impact": "Có thể ảnh hưởng đến distribution fitting"
                    })
                    penalty += 3
        
        # 3. Kiểm tra skewness (độ lệch)
        if len(values_array) >= 10:
            from scipy import stats
            skewness = stats.skew(values_array)
            
            if abs(skewness) > 2:
                warnings.append({
                    "type": "high_skewness",
                    "message": f"Dữ liệu lệch mạnh (skewness = {skewness:.2f})",
                    "impact": "Một số distribution (Gumbel, Normal) có thể không phù hợp"
                })
                suggestions.append({
                    "type": "consider_skewed_distributions",
                    "message": "Nên thử các distribution cho dữ liệu lệch (Lognormal, Gamma, GEV)",
                    "suggested_value": None
                })
        
        return {
            "issues": issues,
            "warnings": warnings,
            "suggestions": suggestions,
            "penalty": penalty
        }
    
    def _compute_basic_stats(self, values: List[float]) -> Dict[str, float]:
        """Tính các thống kê cơ bản"""
        if not values:
            return {}
        
        values_array = np.array(values)
        
        return {
            "min": float(np.min(values_array)),
            "max": float(np.max(values_array)),
            "mean": float(np.mean(values_array)),
            "median": float(np.median(values_array)),
            "std": float(np.std(values_array)),
            "q25": float(np.percentile(values_array, 25)),
            "q75": float(np.percentile(values_array, 75)),
            "cv": float(np.std(values_array) / np.mean(values_array)) if np.mean(values_array) > 0 else 0
        }
    
    def suggest_optimal_parameters(
        self, 
        initial_data: List[Dict[str, Any]], 
        initial_metadata: Dict[str, Any],
        current_params: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Đề xuất parameters tối ưu dựa trên kết quả phân tích ban đầu
        
        Returns:
            Dict với suggested parameters và lý do
        """
        values = [d["Rainfall"] for d in initial_data]
        n_samples = len(values)
        zero_count = sum(1 for v in values if v == 0)
        zero_ratio = zero_count / n_samples if n_samples > 0 else 0
        
        suggestions = {}
        
        # 1. Suggest days
        if n_samples < self.MIN_RECOMMENDED_SAMPLES:
            # Tính toán days cần thiết
            current_days = current_params.get("days", 30)
            target_samples = self.MIN_RECOMMENDED_SAMPLES
            suggested_days = int(current_days * target_samples / max(1, n_samples))
            suggested_days = min(365, max(30, suggested_days))
            
            suggestions["days"] = {
                "current": current_days,
                "suggested": suggested_days,
                "reason": f"Tăng từ {current_days} lên {suggested_days} để có >= {target_samples} samples"
            }
        
        # 2. Suggest data_field
        current_field = current_params.get("data_field", "rainfall")
        if current_field == "rainfall" and zero_ratio > self.ZERO_RATIO_WARNING:
            suggestions["data_field"] = {
                "current": current_field,
                "suggested": "max",
                "reason": f"'{current_field}' có {zero_ratio*100:.1f}% zero values. 'max' thường có ít zero hơn"
            }
        
        # 3. Suggest min_threshold
        current_threshold = current_params.get("min_threshold", 0)
        if current_threshold == 0 and zero_ratio > self.ZERO_RATIO_WARNING:
            # Tìm threshold tối ưu để loại bỏ zero nhưng giữ đủ data
            non_zero_values = sorted([v for v in values if v > 0])
            if non_zero_values:
                # Suggest threshold = 10th percentile of non-zero values
                suggested_threshold = np.percentile(non_zero_values, 10)
                suggestions["min_threshold"] = {
                    "current": current_threshold,
                    "suggested": round(suggested_threshold, 2),
                    "reason": f"Loại bỏ {zero_count} ngày không mưa, giữ lại data có ý nghĩa"
                }
        
        # 4. Suggest k (số trạm)
        avg_confidence = initial_metadata.get("avgConfidence")
        current_k = current_params.get("k", 8)
        if avg_confidence is not None and avg_confidence < self.LOW_CONFIDENCE_THRESHOLD:
            suggested_k = min(20, current_k + 5)
            suggestions["k"] = {
                "current": current_k,
                "suggested": suggested_k,
                "reason": f"Confidence thấp ({avg_confidence:.2f}). Tăng k để cải thiện"
            }
        
        return {
            "has_suggestions": len(suggestions) > 0,
            "suggestions": suggestions,
            "optimal_config": {
                "days": suggestions.get("days", {}).get("suggested", current_params.get("days", 30)),
                "data_field": suggestions.get("data_field", {}).get("suggested", current_params.get("data_field", "rainfall")),
                "min_threshold": suggestions.get("min_threshold", {}).get("suggested", current_params.get("min_threshold", 0)),
                "k": suggestions.get("k", {}).get("suggested", current_params.get("k", 8)),
                "power": current_params.get("power", 2.0)  # Giữ nguyên
            }
        }

