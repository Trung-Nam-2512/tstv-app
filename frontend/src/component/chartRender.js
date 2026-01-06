import React, { useState, useEffect, useMemo, memo } from 'react';
import Plot from 'react-plotly.js';
import { useFileInfo } from '../context/fileInfoContext';
import { useUnit } from '../context/unitContext';
import { useAnalysis } from '../context/analysisContext';
import Config from '../config/config';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner, faExclamationTriangle } from '@fortawesome/free-solid-svg-icons';
import { Alert } from 'react-bootstrap';

// Hàm lấy tên phân phối từ endpoint
const getDistributionName = (endpoint) => {
    if (!endpoint) return 'Unknown';
    const nameMap = {
        'gumbel': 'Gumbel',
        'lognorm': 'Lognormal',
        'gamma': 'Gamma',
        'logistic': 'Logistic',
        'exponential': 'Exponential',
        'expon': 'Exponential',
        'genextreme': 'Generalized Extreme Value',
        'genpareto': 'Generalized Pareto',
        'gpd': 'Generalized Pareto',
        'frechet': 'Frechet',
        'pearson3': 'Pearson3'
    };
    for (const [key, value] of Object.entries(nameMap)) {
        if (endpoint.includes(key)) return value;
    }
    return 'Unknown';
};

// Hàm lấy màu sắc theo distribution (chuẩn FFC 2008)
const getDistributionColor = (distributionName) => {
    const colorMap = {
        'Gumbel': '#00aa00',      // Xanh lá
        'Gamma': '#0066ff',       // Xanh dương
        'Lognormal': '#d62728',   // Đỏ
        'Logistic': '#d62728',    // Đỏ
        'Exponential': '#d62728', // Đỏ
        'Generalized Extreme Value': '#d62728',
        'Generalized Pareto': '#d62728',
        'Frechet': '#d62728',
        'Pearson3': '#d62728'
    };
    return colorMap[distributionName] || '#d62728';
};

const PlotlyFrequencyChart = ({ endpoint, dataUpdated }) => {
    const [chartData, setChartData] = useState({
        theoretical_curve: [],
        empirical_points: []
    });
    const [isLoading, setIsLoading] = useState(true);
    const [fadeIn, setFadeIn] = useState(false);

    const { fileInfo } = useFileInfo();
    const { nameColumn, unit } = useUnit();
    const analysisContext = useAnalysis();

    const headerTitle = fileInfo?.dataType && fileInfo.dataType !== 'Unknown'
        ? fileInfo.dataType
        : nameColumn || 'Unknown';
    const headerUnit = fileInfo?.unit && fileInfo.unit !== 'Unknown'
        ? fileInfo.unit
        : unit || 'Unknown';

    const distributionName = useMemo(() => getDistributionName(endpoint), [endpoint]);
    const distributionColor = useMemo(() => getDistributionColor(distributionName), [distributionName]);

    // Fetch data
    useEffect(() => {
        if (!endpoint || dataUpdated === null) return;

        const controller = new AbortController();
        const signal = controller.signal;

        const fetchData = async () => {
            try {
                // Extract distribution name và agg_func
                const distributionMatch = endpoint.match(/frequency_curve_(\w+)/);
                let endpointName = distributionMatch ? distributionMatch[1] : null;
                const endpointToBackendMap = {
                    'exponential': 'expon',
                    'gpd': 'genpareto'
                };
                const distributionName = endpointToBackendMap[endpointName] || endpointName;
                const aggFuncMatch = endpoint.match(/agg_func=(\w+)/);
                const aggFunc = aggFuncMatch ? aggFuncMatch[1] : 'max';

                // Check cache
                if (distributionName && analysisContext.isCacheValid()) {
                    const cacheMetadata = analysisContext.cacheMetadata;
                    if (cacheMetadata && cacheMetadata.agg_func === aggFunc) {
                        const cachedData = analysisContext.getCachedResult(distributionName);
                        if (cachedData) {
                            setChartData(cachedData);
                            setIsLoading(false);
                            requestAnimationFrame(() => setFadeIn(true));
                            return;
                        }
                    }
                }

                // Fetch from API
                setIsLoading(true);
                const response = await fetch(`${Config.BASE_URL}/${endpoint}`, { signal });
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

                const data = await response.json();
                if (!signal.aborted) {
                    setChartData(data);
                    setIsLoading(false);
                    requestAnimationFrame(() => setFadeIn(true));
                }
            } catch (error) {
                if (error.name !== 'AbortError' && !signal.aborted) {
                    console.error('Error fetching data:', error);
                    setIsLoading(false);
                }
            }
        };

        fetchData();
        return () => controller.abort();
    }, [endpoint, dataUpdated, analysisContext]);

    // Early return
    if (isLoading || !chartData || !chartData.theoretical_curve || !chartData.empirical_points) {
        return (
            <div className="text-center py-5">
                <FontAwesomeIcon icon={faSpinner} className="loading-spinner me-3" />
                <p className="mt-3">{isLoading ? 'Đang tải biểu đồ...' : 'Không có dữ liệu'}</p>
            </div>
        );
    }

    // Parse data - FIX: Phải parse đúng cả P_percent và Q
    const parsePoint = (pt, index) => {
        // Parse P_percent
        let x = pt.P_percent;
        if (typeof x !== 'number') {
            x = parseFloat(String(x).replace(',', '.'));
        }
        if (isNaN(x)) {
            console.warn(`Invalid P_percent at index ${index}:`, pt);
            return null;
        }

        // Parse Q - Backend trả về {"P_percent": ..., "Q": ...}
        let y = pt.Q;
        if (y === undefined || y === null) {
            console.warn(`Missing Q at index ${index}:`, pt);
            return null;
        }
        if (typeof y !== 'number') {
            y = parseFloat(String(y).replace(',', '.'));
        }
        if (isNaN(y)) {
            console.warn(`Invalid Q (NaN) at index ${index}:`, pt);
            return null;
        }
        // KHÔNG filter y < 0 - có thể có giá trị âm hợp lệ
        // if (y < 0) return null;

        return { x, y };
    };

    // Parse và sort theoretical curve - DEBUG: Log để kiểm tra
    const rawTheoretical = chartData.theoretical_curve || [];

    const theoreticalPoints = rawTheoretical
        .map((pt, idx) => parsePoint(pt, idx))
        .filter(p => p !== null)
        .sort((a, b) => a.x - b.x);

    // Parse empirical points
    const rawEmpirical = chartData.empirical_points || [];
    const empiricalPoints = rawEmpirical
        .map(parsePoint)
        .filter(p => p !== null)
        .sort((a, b) => a.x - b.x);


    if (theoreticalPoints.length === 0 || empiricalPoints.length === 0) {
        console.error('ERROR: No valid points!', {
            theoretical: theoreticalPoints.length,
            empirical: empiricalPoints.length,
            rawTheoretical: rawTheoretical.length,
            rawEmpirical: rawEmpirical.length
        });
        return (
            <div className="text-center py-5">
                <p className="mt-3">Không có dữ liệu hợp lệ</p>
            </div>
        );
    }

    // Tính Y range - FIX: Phải dùng TẤT CẢ giá trị Y từ theoretical và empirical
    const theoreticalYValues = theoreticalPoints.map(p => p.y);
    const empiricalYValues = empiricalPoints.map(p => p.y);
    const ciYValues = [
        ...(chartData.confidence_intervals?.lower || []).map(pt => {
            const q = pt.Q !== undefined ? pt.Q : pt.Q_values;
            return typeof q === 'number' ? q : parseFloat(String(q).replace(',', '.'));
        }).filter(v => !isNaN(v) && v >= 0),
        ...(chartData.confidence_intervals?.upper || []).map(pt => {
            const q = pt.Q !== undefined ? pt.Q : pt.Q_values;
            return typeof q === 'number' ? q : parseFloat(String(q).replace(',', '.'));
        }).filter(v => !isNaN(v) && v >= 0)
    ];

    const allYValues = [...theoreticalYValues, ...empiricalYValues, ...ciYValues];

    if (allYValues.length === 0) {
        console.error('ERROR: No Y values found!');
        return (
            <div className="text-center py-5">
                <p className="mt-3">Lỗi: Không tìm thấy giá trị Y</p>
            </div>
        );
    }

    const maxY = Math.max(...allYValues);
    const minY = 0;
    // FIX: Đảm bảo yMax không bị giới hạn sai
    const yMax = Math.max(Math.ceil(maxY * 1.15), maxY * 1.1); // Ít nhất phải lớn hơn maxY


    // Major ticks cho log scale
    const majorTicks = [0.01, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 98, 99, 99.5, 99.9];
    const majorTickText = majorTicks.map(v => v >= 1 ? v.toFixed(0) : v >= 0.1 ? v.toFixed(1) : v.toString());
    const returnPeriods = majorTicks.map(p => {
        if (p === 50) return '2';
        if (p === 20) return '5';
        if (p === 10) return '10';
        if (p === 5) return '20';
        if (p === 2) return '50';
        if (p === 1) return '100';
        if (p === 0.5) return '200';
        if (p === 0.2) return '500';
        if (p === 0.1) return '1000';
        if (p === 0.01) return '10000';
        return '';
    });

    // Tìm Q tại các P% quan trọng (P THẤP = sự kiện HIẾM) - Chuẩn phân tích tần suất
    // P% là xác suất VƯỢT: P THẤP = sự kiện HIẾM = T CAO = quan trọng
    // Chỉ highlight 3 P quan trọng nhất: 0.01% (T=10000), 0.1% (T=1000), 1% (T=100)
    const findQatP = (pPercent) => {
        // Tolerance lớn hơn cho P rất thấp (0.01%, 0.1%) vì spacing rộng hơn
        const tolerance = pPercent < 0.1 ? 0.1 : pPercent < 1 ? 0.5 : 0.5;
        const point = theoreticalPoints.find(p => Math.abs(p.x - pPercent) < tolerance);
        return point ? point.y : null;
    };

    const Q_001pct = findQatP(0.01);
    const Q_01pct = findQatP(0.1);
    const Q_1pct = findQatP(1);

    // Build plot data - ĐƠN GIẢN, KHÔNG CHẮP VÁ
    const plotData = [];

    // 1. Theoretical curve - KHÔNG CHẮP VÁ: Dùng TRỰC TIẾP tất cả điểm từ backend
    // Backend đã trả về 2500 điểm, KHÔNG được filter hay sample
    const theoreticalX = theoreticalPoints.map(p => p.x);
    const theoreticalY = theoreticalPoints.map(p => p.y);


    if (theoreticalX.length !== theoreticalY.length) {
        console.error('ERROR: X and Y length mismatch!', {
            xLength: theoreticalX.length,
            yLength: theoreticalY.length
        });
    }

    // FFC 2008: Phân tích từ hình ảnh thực tế cho thấy đường cong MƯỢT HOÀN TOÀN
    // Vấn đề: Plotly spline có thể không hoạt động tốt với log scale ở vùng P thấp
    // Giải pháp: Dùng LINEAR với RẤT NHIỀU điểm (~8000 điểm) - với số điểm này, 
    // linear sẽ tự động tạo đường cong mượt như FFC 2008
    // FFC 2008 thực sự dùng linear interpolation với rất nhiều điểm, không phải spline
    plotData.push({
        x: theoreticalX, // Dùng TẤT CẢ điểm từ backend (~8000 điểm)
        y: theoreticalY, // Dùng TẤT CẢ điểm từ backend (~8000 điểm)
        type: 'scatter',
        mode: 'lines',
        name: chartData.statistics
            ? `Phân bố ${distributionName} | TB=${chartData.statistics.mean.toFixed(2)}, Cv=${chartData.statistics.cv.toFixed(2)}, Cs=${chartData.statistics.cs.toFixed(2)}`
            : `Phân bố ${distributionName}`,
        line: {
            color: distributionColor,
            width: 2,
            shape: 'linear', // LINEAR - với 8000 điểm sẽ mượt như FFC 2008
            smoothing: 0 // Không smoothing với linear
        },
        hovertemplate: 'P: %{x:.2f}%<br>Q: %{y:.2f} ' + headerUnit + '<extra></extra>',
        connectgaps: false
    });

    // 2. Confidence intervals (nếu có)
    if (chartData.confidence_intervals) {
        const lowerCI = (chartData.confidence_intervals.lower || [])
            .map(pt => ({ x: parseFloat(pt.P_percent), y: parseFloat(pt.Q) }))
            .filter(p => !isNaN(p.x) && !isNaN(p.y) && p.y >= 0)
            .sort((a, b) => a.x - b.x);

        const upperCI = (chartData.confidence_intervals.upper || [])
            .map(pt => ({ x: parseFloat(pt.P_percent), y: parseFloat(pt.Q) }))
            .filter(p => !isNaN(p.x) && !isNaN(p.y) && p.y >= 0)
            .sort((a, b) => a.x - b.x);

        if (lowerCI.length > 0 && upperCI.length > 0) {
            // Lower CI line - LINEAR như FFC 2008
            plotData.push({
                x: lowerCI.map(p => p.x),
                y: lowerCI.map(p => p.y),
                type: 'scatter',
                mode: 'lines',
                name: 'CI 95% (Lower)',
                line: {
                    color: 'rgba(214, 39, 40, 0.4)',
                    width: 1.2,
                    dash: 'dash',
                    shape: 'linear' // LINEAR với nhiều điểm
                },
                showlegend: false
            });

            // Upper CI line - LINEAR như FFC 2008
            plotData.push({
                x: upperCI.map(p => p.x),
                y: upperCI.map(p => p.y),
                type: 'scatter',
                mode: 'lines',
                name: 'CI 95% (Upper)',
                line: {
                    color: 'rgba(214, 39, 40, 0.4)',
                    width: 1.2,
                    dash: 'dash',
                    shape: 'linear' // LINEAR với nhiều điểm
                },
                showlegend: false
            });

            // CI fill - LINEAR như FFC 2008
            plotData.push({
                x: [...lowerCI.map(p => p.x), ...upperCI.map(p => p.x).reverse()],
                y: [...lowerCI.map(p => p.y), ...upperCI.map(p => p.y).reverse()],
                type: 'scatter',
                fill: 'toself',
                fillcolor: 'rgba(255, 192, 203, 0.3)', // Màu hồng nhạt như FFC 2008
                mode: 'lines',
                name: 'Khoảng tin cậy 95%',
                line: { width: 0, shape: 'linear' },
                showlegend: true,
                hoverinfo: 'skip'
            });
        }
    }

    // 3. Key markers tại các P quan trọng (P THẤP = sự kiện HIẾM) - Chuẩn phân tích tần suất
    // Chỉ highlight 3 P quan trọng nhất: 0.01% (T=10000), 0.1% (T=1000), 1% (T=100)
    const keyPoints = [];
    if (Q_001pct) keyPoints.push({ x: 0.01, y: Q_001pct, name: 'P=0.01% (T=10000 năm)', color: '#8b0000' });  // Cực hiếm - đỏ đậm
    if (Q_01pct) keyPoints.push({ x: 0.1, y: Q_01pct, name: 'P=0.1% (T=1000 năm)', color: '#ff0000' });        // Rất hiếm - đỏ
    if (Q_1pct) keyPoints.push({ x: 1, y: Q_1pct, name: 'P=1% (T=100 năm)', color: '#ff6600' });                // Hiếm, quan trọng - cam

    if (keyPoints.length > 0) {
        plotData.push({
            x: keyPoints.map(p => p.x),
            y: keyPoints.map(p => p.y),
            type: 'scatter',
            mode: 'markers+text',
            name: 'Key P%',
            marker: {
                color: keyPoints.map(p => p.color),
                size: 12,
                symbol: 'circle',
                line: { color: '#fff', width: 2 }
            },
            text: keyPoints.map(p => p.name),
            textposition: 'top center',
            textfont: { size: 10, color: '#333' },
            showlegend: false,
            hovertemplate: '%{text}<br>Q=%{y:.2f} ' + headerUnit + '<extra></extra>'
        });
    }

    // 4. Empirical points - CUỐI CÙNG để hiển thị trên cùng
    plotData.push({
        x: empiricalPoints.map(p => p.x),
        y: empiricalPoints.map(p => p.y),
        type: 'scatter',
        mode: 'markers',
        name: chartData.statistics
            ? `Số liệu thực đo | TB=${chartData.statistics.mean.toFixed(2)}, Cv=${chartData.statistics.cv.toFixed(2)}, Cs=${chartData.statistics.cs.toFixed(2)}`
            : 'Số liệu thực đo',
        marker: {
            color: '#ff0000', // Màu đỏ như FFC 2008
            size: 8,
            symbol: 'diamond', // Diamond shape như FFC 2008
            line: { color: '#fff', width: 0.5 },
            opacity: 1
        },
        hovertemplate: 'P: %{x:.2f}%<br>Q: %{y:.2f} ' + headerUnit + '<extra></extra>'
    });

    // Layout - ĐƠN GIẢN, RÕ RÀNG
    const layout = {
        width: window.innerWidth > 768 ? 600 : null,
        height: window.innerWidth > 768 ? 550 : null,
        autosize: window.innerWidth <= 768,

        xaxis: {
            type: 'log',
            tickvals: majorTicks,
            ticktext: majorTickText,
            title: {
                text: 'Tần suất vượt, P (%)',
                font: { size: 14, family: 'Arial, sans-serif', color: '#1a1a1a', weight: 'bold' },
                standoff: 15
            },
            tickfont: { size: 11, family: 'Arial, sans-serif', color: '#333' },
            showgrid: true,
            gridcolor: '#c0c0c0',
            gridwidth: 1.2,
            zeroline: false,
            showline: true,
            linecolor: '#1a1a1a',
            linewidth: 2,
            range: [Math.log10(0.01), Math.log10(99.9)]
        },

        xaxis2: {
            type: 'log',
            tickvals: majorTicks,
            ticktext: returnPeriods,
            title: {
                text: 'Chu kỳ lặp lại, T (năm)',
                font: { size: 14, family: 'Arial, sans-serif', color: '#1a1a1a', weight: 'bold' },
                standoff: 5
            },
            tickfont: { size: 11, family: 'Arial, sans-serif', color: '#333' },
            overlaying: 'x',
            side: 'top',
            showgrid: false,
            showline: true,
            linecolor: '#1a1a1a',
            linewidth: 2,
            range: [Math.log10(0.01), Math.log10(99.9)]
        },

        yaxis: {
            title: {
                text: `${headerTitle} (${headerUnit})`,
                font: { size: 14, family: 'Arial, sans-serif', color: '#1a1a1a', weight: 'bold' },
                standoff: 10
            },
            range: [minY, yMax], // FIX: Dùng yMax đã tính, KHÔNG hardcode
            tickfont: { size: 11, family: 'Arial, sans-serif', color: '#333' },
            showgrid: true,
            gridcolor: '#e0e0e0',
            gridwidth: 1,
            zeroline: true,
            zerolinecolor: '#999',
            zerolinewidth: 1.5,
            showline: true,
            linecolor: '#1a1a1a',
            linewidth: 2,
            tickmode: 'linear',
            dtick: yMax <= 100 ? 10 : yMax <= 200 ? 20 : yMax <= 500 ? 50 : 100,
            tickformat: '.0f'
        },

        margin: { l: 80, r: 60, t: 80, b: 75 },
        hovermode: 'closest',

        showlegend: true,
        legend: {
            x: 0.98,
            y: 0.98,
            xanchor: 'right',
            yanchor: 'top',
            bgcolor: 'rgba(255, 255, 255, 0.95)',
            bordercolor: '#d9d9d9',
            borderwidth: 1.5,
            font: { size: 11, family: 'Arial, sans-serif', color: '#333' },
            itemclick: 'toggleothers',
            itemdoubleclick: 'toggle',
            // Custom legend text với tham số thống kê
            traceorder: 'normal'
        },

        plot_bgcolor: '#ffffff',
        paper_bgcolor: '#fafafa',

        annotations: chartData.statistics ? [{
            text: `<b>${distributionName}</b><br>` +
                `n=${chartData.statistics.n} | TB=${chartData.statistics.mean.toFixed(1)} ${headerUnit}<br>` +
                `Cv=${chartData.statistics.cv.toFixed(2)} | Cs=${chartData.statistics.cs.toFixed(2)}`,
            xref: 'paper',
            yref: 'paper',
            x: 0.02,
            y: 0.98,
            xanchor: 'left',
            yanchor: 'top',
            showarrow: false,
            bgcolor: 'rgba(255, 255, 255, 0.9)',
            bordercolor: '#999',
            borderwidth: 1,
            borderpad: 6,
            font: { size: 10, family: 'Arial, sans-serif' },
            align: 'left'
        }] : [],

        shapes: [
            {
                type: 'line',
                xref: 'x',
                yref: 'paper',
                x0: 1,
                x1: 1,
                y0: 0,
                y1: 1,
                line: { color: '#0066ff', width: 1.5, dash: 'dot' }
            },
            {
                type: 'line',
                xref: 'x',
                yref: 'paper',
                x0: 10,
                x1: 10,
                y0: 0,
                y1: 1,
                line: { color: '#00aa00', width: 1.5, dash: 'dot' }
            },
            {
                type: 'line',
                xref: 'x',
                yref: 'paper',
                x0: 50,
                x1: 50,
                y0: 0,
                y1: 1,
                line: { color: '#ff0000', width: 1.5, dash: 'dot' }
            }
        ]
    };

    const config = {
        responsive: true,
        displayModeBar: true,
        modeBarButtonsToRemove: ['lasso2d', 'select2d', 'autoScale2d'],
        displaylogo: false,
        doubleClick: 'reset',
        // FIX: Tăng resolution để render mượt hơn với 2500 điểm
        plotGlPixelRatio: 2, // Tăng resolution
        staticPlot: false,
        toImageButtonOptions: {
            format: 'png',
            filename: `frequency-curve-${distributionName.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}`,
            height: 800,
            width: 1000,
            scale: 4
        }
    };

    const hasWarnings = chartData.quality_warnings && chartData.quality_warnings.length > 0;
    const hasCriticalWarning = chartData.quality_warnings?.some(w => w.includes('NGHIÊM TRỌNG'));

    return (
        <div>
            {hasWarnings && (
                <Alert variant={hasCriticalWarning ? "danger" : "warning"} className="mb-3">
                    <Alert.Heading>
                        <FontAwesomeIcon icon={faExclamationTriangle} className="me-2" />
                        {hasCriticalWarning ? "Cảnh báo nghiêm trọng về chất lượng phân tích" : "Lưu ý về chất lượng dữ liệu"}
                    </Alert.Heading>
                    <ul className="mb-0">
                        {chartData.quality_warnings.map((warning, idx) => (
                            <li key={idx} style={{ fontSize: '0.9em' }}>{warning}</li>
                        ))}
                    </ul>
                </Alert>
            )}

            <div
                style={{
                    opacity: fadeIn ? 1 : 0,
                    transition: fadeIn ? 'opacity 0.3s ease-in-out' : 'none',
                    minHeight: '400px'
                }}
            >
                {fadeIn && (
                    <Plot
                        key={endpoint}
                        data={plotData}
                        layout={layout}
                        config={config}
                        style={{ width: '100%', height: '100%' }}
                        useResizeHandler={false}
                    />
                )}
            </div>
        </div>
    );
};

export default memo(PlotlyFrequencyChart, (prevProps, nextProps) => {
    return prevProps.endpoint === nextProps.endpoint &&
        prevProps.dataUpdated === nextProps.dataUpdated;
});
