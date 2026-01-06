// ChartSelector.jsx
import React, { useContext, useState, useEffect } from 'react';
import HighchartsFrequencyChart from './chartRenderHighcharts';
import ChartLoadingOverlay from './ChartLoadingOverlay';
import { ModelContext } from '../context/selectedModelContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner } from '@fortawesome/free-solid-svg-icons';

const ChartSelector = ({ fetch, dataUpdated }) => {
    const { selectedModel, selectedValue, isTransitioning } = useContext(ModelContext);
    const [showLoading, setShowLoading] = useState(false);
    const [prevEndpoint, setPrevEndpoint] = useState(null);

    // Xác định endpoint dựa trên lựa chọn của người dùng
    let endpoint;
    switch (selectedModel) {
        case 'gumbel':
            endpoint = `analysis/frequency_curve_gumbel?agg_func=${selectedValue}`;
            break;
        case 'lognorm':
            endpoint = `analysis/frequency_curve_lognorm?agg_func=${selectedValue}`;
            break;
        case 'gamma':
            endpoint = `analysis/frequency_curve_gamma?agg_func=${selectedValue}`;
            break;
        case 'logistic':
            endpoint = `analysis/frequency_curve_logistic?agg_func=${selectedValue}`;
            break;
        case 'expon':
            endpoint = `analysis/frequency_curve_exponential?agg_func=${selectedValue}`;
            break;
        case 'genextreme':
            endpoint = `analysis/frequency_curve_genextreme?agg_func=${selectedValue}`;
            break;
        case 'genpareto':
            endpoint = `analysis/frequency_curve_gpd?agg_func=${selectedValue}`;
            break;
        case 'frechet':
            endpoint = `analysis/frequency_curve_frechet?agg_func=${selectedValue}`;
            break;
        case 'pearson3':
            endpoint = `analysis/frequency_curve_pearson3?agg_func=${selectedValue}`;
            break;
        default:
            endpoint = 'null';
    }

    // Detect endpoint change and show loading with debounce
    useEffect(() => {
        if (endpoint !== 'null' && endpoint !== prevEndpoint && prevEndpoint !== null) {
            setShowLoading(true);
        }
        setPrevEndpoint(endpoint);
    }, [endpoint, prevEndpoint]);

    // Hide loading when transition completes
    useEffect(() => {
        if (!isTransitioning && showLoading) {
            const timer = setTimeout(() => {
                setShowLoading(false);
            }, 400); // Match fade animation duration
            return () => clearTimeout(timer);
        }
    }, [isTransitioning, showLoading]);

    if (selectedModel === 'null' || selectedValue === 'null') {
        return (
            <div className="text-center py-5" style={{ marginTop: '100px', minHeight: '400px' }}>
                <FontAwesomeIcon icon={faSpinner} className="loading-spinner me-3" spin />
                <p className="mt-3">Vui lòng chọn mô hình phân phối...</p>
            </div>
        );
    }

    return (
        <div className="mt-4 container-chart1">
                <div style={{ position: 'relative', minHeight: '500px' }}>
                {fetch ? (
                        <div style={{
                            position: 'relative',
                            minHeight: '500px',
                            transition: 'opacity 0.3s ease-in-out',
                            opacity: isTransitioning ? 0.6 : 1
                        }}>
                            <ChartLoadingOverlay
                                isLoading={showLoading || isTransitioning}
                                message={isTransitioning ? "Đang chuyển đổi mô hình..." : "Đang tải biểu đồ..."}
                            />
                            <div style={{
                                transition: 'opacity 0.3s ease-in-out',
                                opacity: (showLoading || isTransitioning) ? 0.3 : 1
                            }}>
                                    <HighchartsFrequencyChart endpoint={endpoint} dataUpdated={dataUpdated} />
                            </div>
                        </div>
                    ) : (
                        <div style={{
                            textAlign: 'center',
                            marginTop: '250px',
                            fontWeight: 'bold',
                        minHeight: '400px',
                        color: '#6c757d'
                        }}>
                            Cung cấp dữ liệu để xem kết quả . . .
                        </div>
                    )}
            </div>
        </div>
    );
};

export default ChartSelector;
