/**
 * Backend Rendered Chart Component
 * Hiển thị frequency curve chart được render từ backend (Python/matplotlib)
 * Tham khảo code từ vebieudo_example.py để đảm bảo chất lượng và độ mượt
 */
import React, { useState, useEffect } from 'react';
import Config from '../config/config';

const BackendRenderedChart = ({ endpoint, distributionName, aggFunc = 'max', method = 'auto', withCI = false }) => {
    const [chartData, setChartData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchChart = async () => {
            if (!endpoint || !distributionName) {
                return;
            }

            setLoading(true);
            setError(null);

            try {
                // Build URL với query parameters
                const params = new URLSearchParams({
                    agg_func: aggFunc,
                    method: method,
                    dpi: '150', // Default DPI
                    ...(withCI && { with_ci: 'true' })
                });

                const url = `${endpoint}/analysis/frequency_curve_chart/${distributionName}?${params.toString()}`;

                const response = await fetch(url);
                
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({ detail: response.statusText }));
                    throw new Error(errorData.detail || `HTTP ${response.status}`);
                }

                const data = await response.json();

                setChartData(data);
            } catch (err) {
                console.error('[BackendChart] Error fetching chart:', err);
                setError(err.message || 'Failed to load chart');
            } finally {
                setLoading(false);
            }
        };

        fetchChart();
    }, [endpoint, distributionName, aggFunc, method, withCI]);

    if (loading) {
        return (
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                minHeight: '400px',
                fontSize: '16px',
                color: '#666'
            }}>
                <div>
                    <div style={{ marginBottom: '10px' }}>Đang tải biểu đồ từ backend...</div>
                    <div style={{ fontSize: '12px', color: '#999' }}>
                        Rendering với matplotlib (Python)
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                minHeight: '400px',
                padding: '20px',
                backgroundColor: '#fee',
                border: '1px solid #fcc',
                borderRadius: '4px',
                color: '#c33'
            }}>
                <div>
                    <div style={{ fontWeight: 'bold', marginBottom: '10px' }}>Lỗi khi tải biểu đồ</div>
                    <div style={{ fontSize: '14px' }}>{error}</div>
                </div>
            </div>
        );
    }

    if (!chartData || !chartData.image) {
        return (
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                minHeight: '400px',
                fontSize: '14px',
                color: '#999'
            }}>
                Không có dữ liệu để hiển thị
            </div>
        );
    }

    // Extract statistics for display
    const stats = chartData.statistics || {};
    const statsText = stats.mean !== undefined 
        ? `TB=${stats.mean.toFixed(2)}, Cv=${stats.cv?.toFixed(2) || 'N/A'}, Cs=${stats.cs?.toFixed(2) || 'N/A'}`
        : '';

    return (
        <div style={{
            width: '100%',
            textAlign: 'center',
            padding: '20px',
            backgroundColor: '#fff'
        }}>
            {/* Chart Image */}
            <div style={{
                marginBottom: '10px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                overflow: 'hidden',
                backgroundColor: '#fff',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}>
                <img
                    src={chartData.image}
                    alt={`Frequency Curve - ${distributionName}`}
                    style={{
                        maxWidth: '100%',
                        height: 'auto',
                        display: 'block',
                        margin: '0 auto'
                    }}
                    onError={(e) => {
                        console.error('[BackendChart] Image load error');
                        e.target.style.display = 'none';
                    }}
                />
            </div>

            {/* Chart Info */}
            <div style={{
                fontSize: '12px',
                color: '#666',
                marginTop: '10px',
                padding: '8px',
                backgroundColor: '#f9f9f9',
                borderRadius: '4px'
            }}>
                <div style={{ marginBottom: '4px' }}>
                    <strong>Phân bố:</strong> {distributionName.toUpperCase()} {statsText && `| ${statsText}`}
                </div>
                <div>
                    <strong>Render từ:</strong> Backend (Python/matplotlib) | 
                    <strong> DPI:</strong> {chartData.dpi} | 
                    <strong> Kích thước:</strong> {chartData.width} × {chartData.height}px
                </div>
            </div>
        </div>
    );
};

export default BackendRenderedChart;

