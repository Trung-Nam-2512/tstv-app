"""
Chart Service - Render frequency analysis charts using matplotlib
Tham khảo code từ vebieudo_example.py để đảm bảo chất lượng và độ mượt
"""
import matplotlib
matplotlib.use('Agg')  # Non-interactive backend - QUAN TRỌNG
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter
import numpy as np
import io
import base64
import logging
from typing import Dict, Any, Optional, Tuple
from ..services.analysis_service import AnalysisService

logger = logging.getLogger(__name__)


class ChartService:
    """Service để render frequency analysis charts từ backend"""
    
    def __init__(self, analysis_service: AnalysisService):
        self.analysis_service = analysis_service
    
    def render_frequency_curve_chart(
        self,
        distribution_name: str,
        agg_func: str = 'max',
        method: str = 'auto',
        dpi: int = 150,
        figsize: Tuple[float, float] = (12, 8),
        title: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Render frequency curve chart và trả về base64 encoded image.
        
        Args:
            distribution_name: Tên distribution (gumbel, lognorm, gamma, ...)
            agg_func: Aggregation function (max, min, mean, sum)
            method: Fitting method (auto, mom, mle)
            dpi: Resolution (100-300)
            figsize: Figure size (width, height)
            title: Custom title (optional)
        
        Returns:
            Dict với keys: image (base64), format, dpi, width, height
        """
        try:
            # 1. Lấy data từ analysis_service
            result = self.analysis_service.compute_frequency_curve(
                distribution_name, agg_func, method
            )
            
            if not result or not result.get('theoretical_curve'):
                raise ValueError("No data available for chart rendering")
            
            # 2. Extract data
            theoretical = result.get('theoretical_curve', [])
            empirical = result.get('empirical_points', [])
            statistics = result.get('statistics', {})
            
            # 3. Prepare data for plotting
            # Theoretical curve: P(%) và Q
            p_theo = []
            q_theo = []
            for pt in theoretical:
                try:
                    p_val = float(pt.get('P_percent', 0))
                    q_val = float(pt.get('Q', 0))
                    if p_val > 0 and q_val > 0 and np.isfinite(p_val) and np.isfinite(q_val):
                        p_theo.append(p_val)
                        q_theo.append(q_val)
                except (ValueError, TypeError):
                    continue
            
            # Empirical points
            p_emp = []
            q_emp = []
            for pt in empirical:
                try:
                    p_val = float(pt.get('P_percent', 0))
                    q_val = float(pt.get('Q', 0))
                    if p_val > 0 and q_val > 0 and np.isfinite(p_val) and np.isfinite(q_val):
                        p_emp.append(p_val)
                        q_emp.append(q_val)
                except (ValueError, TypeError):
                    continue
            
            if not p_theo or not q_theo:
                raise ValueError("No valid theoretical curve data")
            
            # 4. Convert P(%) to Return Period T = 100/P
            T_theo = [100 / p for p in p_theo]
            T_emp = [100 / p for p in p_emp] if p_emp else []
            
            # 5. Create figure - THAM KHẢO vebieudo_example.py
            fig, ax = plt.subplots(figsize=figsize, dpi=dpi)
            
            # 6. Plot theoretical curve - semilogx như code mẫu
            ax.semilogx(
                T_theo, q_theo,
                'r-',  # Red solid line
                linewidth=2,
                label=f'Phân bố {distribution_name.upper()}',
                zorder=3
            )
            
            # 7. Plot empirical points - như code mẫu
            if T_emp and q_emp:
                ax.semilogx(
                    T_emp, q_emp,
                    'ro',  # Red circles
                    markersize=6,
                    markerfacecolor='red',
                    markeredgewidth=1.5,
                    markeredgecolor='darkred',
                    label='Số liệu thực đo',
                    zorder=4
                )
            
            # 8. Format axes - THAM KHẢO vebieudo_example.py
            ax.set_xlabel('Chu kỳ lặp T (năm)', fontsize=12, fontweight='bold')
            
            # Get unit from data service
            main_column = self.analysis_service.data_service.main_column
            unit = 'mm' if 'rainfall' in main_column.lower() else 'm³/s'
            ax.set_ylabel(f'Giá trị ({unit})', fontsize=12, fontweight='bold')
            
            # Title
            if title:
                ax.set_title(title, fontsize=14, fontweight='bold')
            else:
                # Build title with statistics if available
                title_parts = [f'ĐƯỜNG TẦN SUẤT {distribution_name.upper()}']
                if statistics:
                    mean = statistics.get('mean', 0)
                    cv = statistics.get('cv', 0)
                    cs = statistics.get('cs', 0)
                    title_parts.append(f'TB={mean:.2f}, Cv={cv:.2f}, Cs={cs:.2f}')
                ax.set_title(' | '.join(title_parts), fontsize=14, fontweight='bold')
            
            # 9. Grid - như code mẫu
            ax.grid(True, which='both', linestyle='--', alpha=0.3)
            ax.grid(True, which='minor', linestyle=':', alpha=0.2)
            
            # 10. Legend
            ax.legend(loc='upper left', fontsize=11)
            
            # 11. Format x-axis - như code mẫu
            def log_format(x, pos):
                if x < 1:
                    return f'{x:.2f}'
                elif x < 10:
                    return f'{x:.1f}'
                else:
                    return f'{int(x)}'
            
            ax.xaxis.set_major_formatter(FuncFormatter(log_format))
            
            # 12. Add important return periods - như code mẫu
            important_T = [2, 5, 10, 20, 50, 100]
            for T in important_T:
                if min(T_theo) <= T <= max(T_theo):
                    # Find closest point
                    idx = np.argmin(np.abs(np.array(T_theo) - T))
                    ax.axvline(x=T, color='gray', linestyle=':', alpha=0.5, linewidth=1)
                    # Optional: Add text annotation
                    # ax.text(T, q_theo[idx]*0.95, f'T={T}', ha='center', va='top', fontsize=9, rotation=90)
            
            # 13. Tight layout
            plt.tight_layout()
            
            # 14. Convert to base64
            img_buffer = io.BytesIO()
            fig.savefig(
                img_buffer,
                format='png',
                dpi=dpi,
                bbox_inches='tight',
                facecolor='white',
                edgecolor='none'
            )
            img_buffer.seek(0)
            
            # 15. Encode to base64
            img_base64 = base64.b64encode(img_buffer.getvalue()).decode('utf-8')
            
            # 16. Get image dimensions
            width, height = fig.get_size_inches() * fig.dpi
            
            # 17. Close figure - QUAN TRỌNG để giải phóng memory
            plt.close(fig)
            img_buffer.close()
            
            logger.info(f"Chart rendered successfully: {distribution_name}, size={len(img_base64)} bytes")
            
            return {
                "image": f"data:image/png;base64,{img_base64}",
                "format": "png",
                "dpi": dpi,
                "width": int(width),
                "height": int(height),
                "distribution": distribution_name,
                "statistics": statistics
            }
            
        except Exception as e:
            logger.error(f"Error rendering chart: {str(e)}", exc_info=True)
            # Close any open figures
            plt.close('all')
            raise ValueError(f"Failed to render chart: {str(e)}")
    
    def render_frequency_curve_chart_with_ci(
        self,
        distribution_name: str,
        agg_func: str = 'max',
        method: str = 'auto',
        dpi: int = 150,
        figsize: Tuple[float, float] = (12, 8),
        title: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Render frequency curve chart với confidence intervals.
        Tương tự render_frequency_curve_chart nhưng thêm CI bands.
        """
        try:
            result = self.analysis_service.compute_frequency_curve(
                distribution_name, agg_func, method
            )
            
            if not result or not result.get('theoretical_curve'):
                raise ValueError("No data available for chart rendering")
            
            # Extract data
            theoretical = result.get('theoretical_curve', [])
            empirical = result.get('empirical_points', [])
            confidence_intervals = result.get('confidence_intervals', {})
            statistics = result.get('statistics', {})
            
            # Prepare data
            p_theo = []
            q_theo = []
            for pt in theoretical:
                try:
                    p_val = float(pt.get('P_percent', 0))
                    q_val = float(pt.get('Q', 0))
                    if p_val > 0 and q_val > 0 and np.isfinite(p_val) and np.isfinite(q_val):
                        p_theo.append(p_val)
                        q_theo.append(q_val)
                except (ValueError, TypeError):
                    continue
            
            p_emp = []
            q_emp = []
            for pt in empirical:
                try:
                    p_val = float(pt.get('P_percent', 0))
                    q_val = float(pt.get('Q', 0))
                    if p_val > 0 and q_val > 0 and np.isfinite(p_val) and np.isfinite(q_val):
                        p_emp.append(p_val)
                        q_emp.append(q_val)
                except (ValueError, TypeError):
                    continue
            
            if not p_theo or not q_theo:
                raise ValueError("No valid theoretical curve data")
            
            # Convert to Return Period
            T_theo = [100 / p for p in p_theo]
            T_emp = [100 / p for p in p_emp] if p_emp else []
            
            # Create figure
            fig, ax = plt.subplots(figsize=figsize, dpi=dpi)
            
            # Plot CI if available
            if confidence_intervals:
                lower_ci = confidence_intervals.get('lower', [])
                upper_ci = confidence_intervals.get('upper', [])
                
                if lower_ci and upper_ci:
                    # Match CI points with theoretical curve by P_percent
                    ci_dict = {}
                    for pt in lower_ci:
                        try:
                            p = float(pt.get('P_percent', 0))
                            q = float(pt.get('Q', 0))
                            if p > 0 and np.isfinite(p) and np.isfinite(q):
                                if p not in ci_dict:
                                    ci_dict[p] = {'lower': q}
                                else:
                                    ci_dict[p]['lower'] = q
                        except (ValueError, TypeError):
                            continue
                    
                    for pt in upper_ci:
                        try:
                            p = float(pt.get('P_percent', 0))
                            q = float(pt.get('Q', 0))
                            if p > 0 and np.isfinite(p) and np.isfinite(q):
                                if p in ci_dict:
                                    ci_dict[p]['upper'] = q
                        except (ValueError, TypeError):
                            continue
                    
                    # Extract CI data matching theoretical curve
                    T_ci = []
                    lower_ci_vals = []
                    upper_ci_vals = []
                    for p in p_theo:
                        if p in ci_dict and 'lower' in ci_dict[p] and 'upper' in ci_dict[p]:
                            lower = ci_dict[p]['lower']
                            upper = ci_dict[p]['upper']
                            if lower < upper and np.isfinite(lower) and np.isfinite(upper):
                                T_ci.append(100 / p)
                                lower_ci_vals.append(lower)
                                upper_ci_vals.append(upper)
                    
                    if T_ci:
                        # Fill between for CI band
                        ax.fill_between(
                            T_ci, lower_ci_vals, upper_ci_vals,
                            alpha=0.2, color='blue',
                            label='Khoảng tin cậy 95%',
                            zorder=1
                        )
            
            # Plot theoretical curve
            ax.semilogx(
                T_theo, q_theo,
                'r-',
                linewidth=2,
                label=f'Phân bố {distribution_name.upper()}',
                zorder=3
            )
            
            # Plot empirical points
            if T_emp and q_emp:
                ax.semilogx(
                    T_emp, q_emp,
                    'ro',
                    markersize=6,
                    markerfacecolor='red',
                    markeredgewidth=1.5,
                    markeredgecolor='darkred',
                    label='Số liệu thực đo',
                    zorder=4
                )
            
            # Format axes
            ax.set_xlabel('Chu kỳ lặp T (năm)', fontsize=12, fontweight='bold')
            main_column = self.analysis_service.data_service.main_column
            unit = 'mm' if 'rainfall' in main_column.lower() else 'm³/s'
            ax.set_ylabel(f'Giá trị ({unit})', fontsize=12, fontweight='bold')
            
            if title:
                ax.set_title(title, fontsize=14, fontweight='bold')
            else:
                title_parts = [f'ĐƯỜNG TẦN SUẤT {distribution_name.upper()}']
                if statistics:
                    mean = statistics.get('mean', 0)
                    cv = statistics.get('cv', 0)
                    cs = statistics.get('cs', 0)
                    title_parts.append(f'TB={mean:.2f}, Cv={cv:.2f}, Cs={cs:.2f}')
                ax.set_title(' | '.join(title_parts), fontsize=14, fontweight='bold')
            
            ax.grid(True, which='both', linestyle='--', alpha=0.3)
            ax.grid(True, which='minor', linestyle=':', alpha=0.2)
            ax.legend(loc='upper left', fontsize=11)
            
            def log_format(x, pos):
                if x < 1:
                    return f'{x:.2f}'
                elif x < 10:
                    return f'{x:.1f}'
                else:
                    return f'{int(x)}'
            ax.xaxis.set_major_formatter(FuncFormatter(log_format))
            
            plt.tight_layout()
            
            # Convert to base64
            img_buffer = io.BytesIO()
            fig.savefig(
                img_buffer,
                format='png',
                dpi=dpi,
                bbox_inches='tight',
                facecolor='white',
                edgecolor='none'
            )
            img_buffer.seek(0)
            
            img_base64 = base64.b64encode(img_buffer.getvalue()).decode('utf-8')
            width, height = fig.get_size_inches() * fig.dpi
            
            plt.close(fig)
            img_buffer.close()
            
            logger.info(f"Chart with CI rendered successfully: {distribution_name}")
            
            return {
                "image": f"data:image/png;base64,{img_base64}",
                "format": "png",
                "dpi": dpi,
                "width": int(width),
                "height": int(height),
                "distribution": distribution_name,
                "statistics": statistics
            }
            
        except Exception as e:
            logger.error(f"Error rendering chart with CI: {str(e)}", exc_info=True)
            plt.close('all')
            raise ValueError(f"Failed to render chart: {str(e)}")

