import numpy as np
import matplotlib.pyplot as plt
from scipy import stats
import pandas as pd
from matplotlib.ticker import FuncFormatter

def gumbel_frequency_analysis(data, return_periods=None, title="Phân tích tần suất Gumbel"):
    """
    Phân tích tần suất Gumbel và biểu diễn bằng semilogx
    
    Parameters:
    -----------
    data : array-like
        Dữ liệu chuỗi cực trị (lưu lượng đỉnh lũ, mưa lớn nhất, ...)
    return_periods : array-like, optional
        Các chu kỳ lặp cần tính toán, mặc định từ 1.01 đến 1000 năm
    title : str
        Tiêu đề biểu đồ
    """
    
    # Chuẩn bị dữ liệu
    data = np.array(data)
    n = len(data)
    
    # Sắp xếp dữ liệu giảm dần
    sorted_data = np.sort(data)[::-1]
    
    # Tính tần suất kinh nghiệm (Weibull plotting position)
    rank = np.arange(1, n + 1)
    exceedance_prob = rank / (n + 1)  # Xác suất vượt
    non_exceedance_prob = 1 - exceedance_prob  # Xác suất không vượt
    
    # Chu kỳ lặp
    if return_periods is None:
        return_periods = np.array([1.01, 1.1, 1.25, 1.5, 2, 5, 10, 20, 50, 100, 200, 500, 1000])
    
    # FIT PHÂN PHỐI GUMBEL
    # Phân phối Gumbel: f(x) = exp(-exp(-(x-μ)/β))
    # Phương pháp moments:
    mean_val = np.mean(data)
    std_val = np.std(data)
    
    # Tham số Gumbel
    beta = std_val * np.sqrt(6) / np.pi  # scale parameter
    mu = mean_val - 0.5772 * beta  # location parameter (0.5772 là hằng số Euler-Mascheroni)
    
    print("=" * 60)
    print("PHÂN TÍCH TẦN SUẤT GUMBEL")
    print("=" * 60)
    print(f"Số năm quan trắc: {n}")
    print(f"Giá trị lớn nhất: {max(data):.2f}")
    print(f"Giá trị nhỏ nhất: {min(data):.2f}")
    print(f"Giá trị trung bình: {mean_val:.2f}")
    print(f"Độ lệch chuẩn: {std_val:.2f}")
    print(f"Tham số Gumbel - μ (location): {mu:.4f}")
    print(f"Tham số Gumbel - β (scale): {beta:.4f}")
    print("-" * 60)
    
    # Tính giá trị lý thuyết Gumbel cho các chu kỳ lặp
    # Gumbel reduced variate: y = -ln(-ln(1 - 1/T))
    # với T là chu kỳ lặp
    exceedance_probs_theory = 1 / return_periods
    non_exceedance_probs_theory = 1 - exceedance_probs_theory
    
    # Gumbel reduced variate
    y_T = -np.log(-np.log(non_exceedance_probs_theory))
    
    # Giá trị tương ứng với chu kỳ lặp T
    x_T = mu + beta * y_T
    
    # Tạo figure với 2 subplot
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(16, 7))
    
    # BIỂU ĐỒ 1: SEMILOGX - Biểu đồ tần suất Gumbel
    ax1.semilogx(return_periods, x_T, 'r-', linewidth=2, 
                label='Đường tần suất Gumbel', zorder=3)
    
    # Vẽ các điểm quan trắc
    # Chu kỳ lặp từ xác suất không vượt
    T_observed = 1 / exceedance_prob
    
    # Chỉ vẽ các điểm có T >= 1.01
    mask = T_observed >= 1.01
    ax1.semilogx(T_observed[mask], sorted_data[mask], 'bo', 
                markersize=8, markerfacecolor='yellow',
                markeredgewidth=1.5, markeredgecolor='blue',
                label='Số liệu quan trắc', zorder=4)
    
    # Định dạng trục x (chu kỳ lặp)
    ax1.set_xlabel('Chu kỳ lặp T (năm)', fontsize=12, fontweight='bold')
    ax1.set_ylabel('Giá trị biến lượng (mm, m³/s,...)', fontsize=12, fontweight='bold')
    ax1.set_title(f'{title}\nĐường tần suất Gumbel', fontsize=14, fontweight='bold')
    
    # Thêm lưới
    ax1.grid(True, which='both', linestyle='--', alpha=0.3)
    ax1.grid(True, which='minor', linestyle=':', alpha=0.2)
    
    # Định dạng trục x
    def log_format(x, pos):
        if x < 1:
            return f'{x:.2f}'
        elif x < 10:
            return f'{x:.1f}'
        else:
            return f'{int(x)}'
    
    ax1.xaxis.set_major_formatter(FuncFormatter(log_format))
    
    # Thêm các đường chu kỳ lặp quan trọng
    important_T = [2, 5, 10, 20, 50, 100]
    for T in important_T:
        if T in return_periods:
            idx = np.where(return_periods == T)[0][0]
            ax1.axvline(x=T, color='gray', linestyle=':', alpha=0.5)
            ax1.text(T, x_T[idx]*0.95, f'T={T}', 
                    ha='center', va='top', fontsize=9, rotation=90)
    
    ax1.legend(loc='upper left', fontsize=11)
    
    # BIỂU ĐỒ 2: Biểu đồ Gumbel trên trục xác suất Gumbel
    # Chuyển đổi sang biến số rút gọn Gumbel
    y_observed = -np.log(-np.log(non_exceedance_prob))
    
    # Tính đường lý thuyết
    x_fit = np.linspace(min(y_observed) - 1, max(y_observed) + 1, 100)
    y_fit = mu + beta * x_fit
    
    ax2.plot(y_observed, sorted_data, 'bo', markersize=8, 
            markerfacecolor='yellow', markeredgewidth=1.5,
            markeredgecolor='blue', label='Số liệu quan trắc', zorder=4)
    ax2.plot(x_fit, y_fit, 'r-', linewidth=2, label='Đường hồi quy Gumbel', zorder=3)
    
    ax2.set_xlabel('Biến số rút gọn Gumbel, y = -ln(-ln(F))', fontsize=12, fontweight='bold')
    ax2.set_ylabel('Giá trị biến lượng', fontsize=12, fontweight='bold')
    ax2.set_title('Biểu đồ Gumbel (Gumbel Probability Paper)', fontsize=14, fontweight='bold')
    
    # Thêm các giá trị xác suất trên trục x
    prob_values = [0.01, 0.1, 0.2, 0.5, 0.8, 0.9, 0.95, 0.99, 0.999]
    y_ticks = -np.log(-np.log(np.array(prob_values)))
    ax2.set_xticks(y_ticks)
    ax2.set_xticklabels([f'{p*100:.1f}%' if p<0.99 else f'{p*100:.2f}%' for p in prob_values])
    ax2.tick_params(axis='x', rotation=45)
    
    ax2.grid(True, linestyle='--', alpha=0.3)
    ax2.legend(loc='upper left', fontsize=11)
    
    plt.tight_layout()
    
    # HIỂN THỊ KẾT QUẢ BẢNG
    print("BẢNG TẦN SUẤT LŨ THIẾT KẾ")
    print("-" * 60)
    print(f"{'Chu kỳ lặp T (năm)':<20} {'Xác suất (%)':<20} {'Giá trị thiết kế':<20}")
    print("-" * 60)
    
    results = []
    for i, T in enumerate(return_periods):
        prob_percent = (1/T) * 100
        if T in [2, 5, 10, 20, 50, 100, 200, 500, 1000]:
            print(f"{T:<20} {prob_percent:<20.4f} {x_T[i]:<20.4f}")
        results.append({
            'Chu_ky_lap_T': T,
            'Xac_suat_vuot_%': prob_percent,
            'Gia_tri_thiet_ke': x_T[i]
        })
    
    print("=" * 60)
    
    # KIỂM ĐỊNH PHÙ HỢP
    # Tính Kolmogorov-Smirnov test
    gumbel_dist = stats.gumbel_r(loc=mu, scale=beta)
    ks_stat, ks_pvalue = stats.kstest(data, gumbel_dist.cdf)
    
    print("\nKIỂM ĐỊNH PHÙ HỢP PHÂN PHỐI GUMBEL")
    print("-" * 40)
    print(f"Kolmogorov-Smirnov test:")
    print(f"  Thống kê KS: {ks_stat:.4f}")
    print(f"  P-value: {ks_pvalue:.4f}")
    
    if ks_pvalue > 0.05:
        print("  Kết luận: Phân phối Gumbel PHÙ HỢP với dữ liệu (p > 0.05)")
    else:
        print("  Kết luận: Phân phối Gumbel KHÔNG PHÙ HỢP với dữ liệu (p ≤ 0.05)")
    
    # Tính các chỉ tiêu thống kê
    print("\nCHỈ TIÊU THỐNG KÊ:")
    print("-" * 40)
    print(f"Hệ số biến động Cv: {std_val/mean_val:.4f}")
    print(f"Hệ số thiên lệch Cs: {stats.skew(data):.4f}")
    
    plt.show()
    
    return {
        'mu': mu,
        'beta': beta,
        'return_periods': return_periods,
        'design_values': x_T,
        'ks_test': (ks_stat, ks_pvalue),
        'results_df': pd.DataFrame(results)
    }

# VÍ DỤ SỬ DỤNG
if __name__ == "__main__":
    # TẠO DỮ LIỆU MẪU - Lưu lượng đỉnh lũ hàng năm (m³/s)
    np.random.seed(42)
    
    # Tạo dữ liệu từ phân phối Gumbel
    n_years = 40
    mu_true, beta_true = 1000, 200  # Tham số thực
    
    # Tạo dữ liệu Gumbel
    u = np.random.uniform(0, 1, n_years)
    sample_data = mu_true - beta_true * np.log(-np.log(u))
    
    # Thêm nhiễu nhỏ
    sample_data = sample_data + np.random.normal(0, 50, n_years)
    
    # Đảm bảo giá trị dương
    sample_data = np.abs(sample_data)
    
    print("DỮ LIỆU MẪU - Lưu lượng đỉnh lũ hàng năm (m³/s)")
    print(f"Số năm: {n_years}")
    print(f"5 giá trị đầu: {sample_data[:5]}")
    print()
    
    # THỰC HIỆN PHÂN TÍCH TẦN SUẤT GUMBEL
    results = gumbel_frequency_analysis(
        data=sample_data,
        return_periods=np.array([1.01, 1.1, 1.25, 1.5, 2, 5, 10, 20, 
                                50, 100, 200, 500, 1000]),
        title="PHÂN TÍCH TẦN SUẤT LŨ - LƯU VỰC SÔNG HỒNG"
    )
    
    # VẼ THÊM BIỂU ĐỒ XÁC SUẤT CHI TIẾT
    fig, ax = plt.subplots(figsize=(10, 8))
    
    # Tính xác suất không vượt lý thuyết
    T_detail = np.logspace(np.log10(1.01), np.log10(1000), 500)
    F_detail = 1 - 1/T_detail  # Xác suất không vượt
    y_detail = -np.log(-np.log(F_detail))
    x_detail = results['mu'] + results['beta'] * y_detail
    
    # Vẽ đường tần suất chi tiết
    ax.semilogx(T_detail, x_detail, 'b-', linewidth=2, 
               label='Đường tần suất Gumbel', alpha=0.7)
    
    # Vẽ vùng tin cậy 95% (phương pháp đơn giản)
    # Giả sử sai số chuẩn của phân vị
    n = len(sample_data)
    std_error = results['beta'] * np.sqrt((1 + 1.14*y_detail + 1.1*y_detail**2)/n)
    
    ax.fill_between(T_detail, 
                   x_detail - 1.96*std_error, 
                   x_detail + 1.96*std_error,
                   alpha=0.2, color='blue', 
                   label='Khoảng tin cậy 95%')
    
    # Vẽ điểm quan trắc
    T_obs = 1/(1 - stats.rankdata(sample_data)/(n+1))
    ax.semilogx(T_obs, np.sort(sample_data)[::-1], 'ro', 
               markersize=6, label='Số liệu quan trắc')
    
    ax.set_xlabel('Chu kỳ lặp T (năm)', fontsize=12, fontweight='bold')
    ax.set_ylabel('Lưu lượng đỉnh lũ (m³/s)', fontsize=12, fontweight='bold')
    ax.set_title('ĐƯỜNG TẦN SUẤT GUMBEL VỚI KHOẢNG TIN CẬY', 
                fontsize=14, fontweight='bold')
    ax.grid(True, which='both', linestyle='--', alpha=0.3)
    ax.legend(loc='upper left')
    
    # Thêm annotation cho các giá trị quan trọng
    important_periods = [10, 50, 100]
    for T in important_periods:
        idx = np.argmin(np.abs(T_detail - T))
        ax.annotate(f'T={T} năm\nQ={x_detail[idx]:.0f} m³/s',
                   xy=(T, x_detail[idx]),
                   xytext=(T*1.5, x_detail[idx]*0.9),
                   arrowprops=dict(arrowstyle='->', color='green'),
                   bbox=dict(boxstyle='round,pad=0.3', fc='yellow', alpha=0.7))
    
    plt.tight_layout()
    plt.show()
    
    # HIỂN THỊ BẢNG KẾT QUẢ ĐẦY ĐỦ
    print("\n" + "="*70)
    print("BẢNG TỔNG HỢP KẾT QUẢ PHÂN TÍCH TẦN SUẤT")
    print("="*70)
    print(results['results_df'].to_string(index=False))