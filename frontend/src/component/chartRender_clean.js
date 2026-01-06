import React, { useState, useEffect, useMemo, memo } from 'react';
import Plot from 'react-plotly.js';
import { useFileInfo } from '../context/fileInfoContext';
import { useUnit } from '../context/unitContext';
import { useAnalysis } from '../context/analysisContext';
import Config from '../config/config';
import * as d3 from 'd3';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner, faExclamationTriangle } from '@fortawesome/free-solid-svg-icons';
import { Alert } from 'react-bootstrap';

// Hàm chuyển đổi xác suất vượt (theo phần trăm) sang reduced variate
const toReducedVariate = (pPercent) => {
    const np = 1 - pPercent / 100; // xác suất không vượt
    return -Math.log(-Math.log(np));
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
    const analysisContext = useAnalysis(); // Get entire context to avoid dependency issues
    const headerTitle =
        fileInfo?.dataType && fileInfo.dataType !== 'Unknown'
            ? fileInfo.dataType
            : nameColumn || 'Unknown';
    const headerUnit =
        fileInfo?.unit && fileInfo.unit !== 'Unknown'
            ? fileInfo.unit
            : unit || 'Unknown';
    // Giá trị mặc định cho màn hình lớn
    const defaultWidth = 600;
    const defaultHeight = 550;

    const [chartSize, setChartSize] = useState({
        width: window.innerWidth > 768 ? defaultWidth : null,
        height: window.innerWidth > 768 ? defaultHeight : null,
        autosize: window.innerWidth <= 768
    });

    // Extract distribution name from endpoint (needed for config)
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

    const distributionName = getDistributionName(endpoint);

    // Memoize config at top level (before any early returns)
    const config = useMemo(() => ({
        responsive: true,
        displayModeBar: true,
        modeBarButtonsToRemove: ['lasso2d', 'select2d', 'autoScale2d'],
        displaylogo: false,
        staticPlot: false,
        doubleClick: 'reset',
        scrollZoom: false,
        // Disable animations for better performance
        plotGlPixelRatio: 1,
        toImageButtonOptions: {
            format: 'png',
            filename: `frequency-curve-${distributionName.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}`,
            height: 800,
            width: 1000,
            scale: 4
        },
        modeBarButtonsToAdd: [
            {
                name: 'Export PDF',
                icon: {
                    width: 857.1,
                    height: 1000,
                    path: 'm214-7h429v214h-429v-214z m500 0h72v500q0 8-6 21t-11 20l-157 156q-5 6-19 12t-22 5v-232q0-22-15-38t-38-16h-322q-22 0-37 16t-16 38v232h-72v-714h72v232q0 22 16 38t37 16h465q22 0 38-16t15-38v-232z',
                    transform: 'matrix(1 0 0 -1 0 850)'
                },
                click: function (gd) {
                    window.Plotly.downloadImage(gd, {
                        format: 'svg',
                        filename: `frequency-curve-${distributionName.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}`,
                        height: 800,
                        width: 1000
                    });
                }
            }
        ]
    }), [distributionName]);

    useEffect(() => {
        const handleResize = () => {
            setChartSize({
                width: window.innerWidth > 768 ? defaultWidth : null,
                height: window.innerWidth > 768 ? defaultHeight : null,
                autosize: window.innerWidth <= 768
            });
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Reset fade when endpoint changes
    useEffect(() => {
        if (endpoint) {
            setFadeIn(false);
        }
    }, [endpoint]);

    useEffect(() => {
        if (!endpoint || dataUpdated === null) return;

        const controller = new AbortController();
        const signal = controller.signal;
        let fadeTimer = null;
        let animationFrame = null;

        const fetchData = async () => {
            try {
                // Extract distribution name từ endpoint
                const distributionMatch = endpoint.match(/frequency_curve_(\w+)/);
                let endpointName = distributionMatch ? distributionMatch[1] : null;

                // Map endpoint name → backend distribution name (for cache lookup)
                // Backend uses: gumbel, lognorm, gamma, logistic, expon, genextreme, genpareto, frechet, pearson3
                const endpointToBackendMap = {
                    'exponential': 'expon',
                    'gpd': 'genpareto'
                };
                const distributionName = endpointToBackendMap[endpointName] || endpointName;

                // Extract agg_func from endpoint
                const aggFuncMatch = endpoint.match(/agg_func=(\w+)/);
                const aggFunc = aggFuncMatch ? aggFuncMatch[1] : 'max';

                // STEP 1: Check cache first (silent - no logs for performance)
                if (distributionName && analysisContext.isCacheValid()) {
                    // Check if agg_func matches cache metadata
                    const cacheMetadata = analysisContext.cacheMetadata;
                    if (cacheMetadata.agg_func === aggFunc) {
                        const cachedData = analysisContext.getCachedResult(distributionName);

                        if (cachedData) {
                            // Cache hit - instant load
                            setChartData(cachedData);
                            setIsLoading(false);

                            // Trigger fade in after a tiny delay to ensure DOM update
                            animationFrame = requestAnimationFrame(() => {
                                setFadeIn(true);
                            });
                            return;
                        }
                    }
                }

                // STEP 2: No cache → Fetch from API (show loading)
                setIsLoading(true);

                const response = await fetch(`${Config.BASE_URL}/${endpoint}`, { signal });
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

                const data = await response.json();

                // Only update if not aborted
                if (!signal.aborted) {
                    setChartData(data);
                    setIsLoading(false);

                    // Fade in new chart
                    animationFrame = requestAnimationFrame(() => {
                        setFadeIn(true);
                    });
                }

            } catch (error) {
                if (error.name !== 'AbortError' && !signal.aborted) {
                    console.error('Error fetching data:', error);
                    setIsLoading(false);
                }
            }
        };

        fetchData();

        return () => {
            controller.abort();
            if (fadeTimer) clearTimeout(fadeTimer);
            if (animationFrame) cancelAnimationFrame(animationFrame);
        };
    }, [endpoint, dataUpdated]); // Removed analysisContext - only use methods, not as dependency

    if (isLoading || !chartData || !chartData.theoretical_curve || !chartData.empirical_points) {
        return (
            <div className="text-center py-5">
                <FontAwesomeIcon icon={faSpinner} className="loading-spinner me-3" />
                <p className="mt-3">
                    {isLoading ? 'Đang tải biểu đồ...' : 'Không có dữ liệu'}
                </p>
            </div>
        );
    }

    // Hiển thị quality warnings nếu có
    const hasWarnings = chartData.quality_warnings && chartData.quality_warnings.length > 0;
    const hasCriticalWarning = chartData.quality_warnings?.some(w => w.includes('NGHIÊM TRỌNG'));



    const originalTicks = [0.01, 0.1, 1, 10, 50, 90, 99];

    const tickPositions = originalTicks.map(x => toReducedVariate(x));

    // Tính phạm vi trục x từ dữ liệu
    const minX = d3.min(chartData.theoretical_curve, d => d.P_percent);
    const maxX = d3.max(chartData.theoretical_curve, d => d.P_percent);
    const xRange = [
        toReducedVariate(minX),
        toReducedVariate(maxX)
    ];

    // Parse và validate data - CHỈ dùng giá trị >= 0 (loại bỏ giá trị âm)
    const parsePoint = (pt, index) => {
        // Đảm bảo parse đúng cả số và string
        let x = pt.P_percent;
        let y = pt.Q;

        // Parse x (P_percent)
        if (typeof x !== 'number') {
            x = parseFloat(String(x).replace(',', '.'));
        }
        if (isNaN(x)) {
            console.warn(`Invalid P_percent at index ${index}:`, pt);
            return null;
        }

        // Parse y (Q)
        if (typeof y !== 'number') {
            y = parseFloat(String(y).replace(',', '.'));
        }
        if (isNaN(y) || y < 0) {
            console.warn(`Invalid Q at index ${index}:`, pt);
            return null;
        }

        return { x, y };
    };

    // Parse raw data từ backend
    const rawEmpiricalPoints = chartData.empirical_points || [];
    const rawTheoreticalPoints = chartData.theoretical_curve || [];

    // Removed excessive logging for performance

    // Sample theoretical points for better performance (keep every Nth point for smoother curve)
    const theoreticalPoints = rawTheoreticalPoints
        .map((pt, idx) => parsePoint(pt, idx))
        .filter(p => p !== null && p.y >= 0);

    // Empirical points - keep all (usually < 100 points)
    const empiricalPoints = rawEmpiricalPoints
        .map((pt, idx) => parsePoint(pt, idx))
        .filter(p => p !== null && p.y >= 0);

    if (empiricalPoints.length === 0) {
        return (
            <div className="text-center py-5">
                <p className="mt-3">Không có dữ liệu điểm kinh nghiệm hợp lệ</p>
            </div>
        );
    }

    // Tính range Y dựa trên TẤT CẢ dữ liệu (empirical, theoretical, CI)
    const empiricalYValues = empiricalPoints.map(p => p.y);
    const theoreticalYValues = theoreticalPoints.map(p => p.y);

    // Lấy CI values nếu có
    let ciYValues = [];
    if (chartData.confidence_intervals) {
        const lowerCI = chartData.confidence_intervals.lower || [];
        const upperCI = chartData.confidence_intervals.upper || [];
        ciYValues = [
            ...lowerCI.map(pt => parseFloat(pt.Q)).filter(v => !isNaN(v) && v >= 0),
            ...upperCI.map(pt => parseFloat(pt.Q)).filter(v => !isNaN(v) && v >= 0)
        ];
    }

    // Tổng hợp tất cả Y values
    const allYValues = [...empiricalYValues, ...theoreticalYValues, ...ciYValues];
    const maxY = Math.max(...allYValues);
    const minY = Math.min(...allYValues);
    const dataRange = maxY - minY;

    // Range Y: từ 0 đến maxY với padding hợp lý (20-25%)
    const finalMinY = 0; // Luôn bắt đầu từ 0 cho lượng mưa
    const padding = dataRange > 0 ? Math.max(dataRange * 0.25, maxY * 0.1) : maxY * 0.15;
    const finalMaxY = Math.ceil(maxY + padding);

    // Đảm bảo range không quá lớn (nếu data range nhỏ)
    const reasonableMaxY = dataRange > 0 && dataRange < maxY * 0.5
        ? Math.ceil(maxY * 1.2)
        : finalMaxY;

    const theoreticalData = {
        x: theoreticalPoints.map(p => p.x),
        y: theoreticalPoints.map(p => p.y),
        type: 'scatter',
        mode: 'lines',
        name: `Phân bố ${distributionName}`,
        line: {
            color: '#d62728', // Đỏ đậm (chuẩn matplotlib)
            width: 2.5,
            shape: 'spline',
            smoothing: 0.3
        },
        hovertemplate: 'P: %{x:.2f}%<br>Q: %{y:.2f} ' + headerUnit + '<extra></extra>'
    };

    // Confidence intervals (nếu có) - chuẩn HEC-SSP
    const plotData = [theoreticalData];

    if (chartData.confidence_intervals) {
        const lowerCI = chartData.confidence_intervals.lower || [];
        const upperCI = chartData.confidence_intervals.upper || [];

        if (lowerCI.length > 0 && upperCI.length > 0) {
            // Parse CI data
            const lowerPoints = lowerCI.map(pt => ({
                x: parseFloat(pt.P_percent),
                y: parseFloat(pt.Q)
            })).filter(p => !isNaN(p.x) && !isNaN(p.y) && p.y >= 0);

            const upperPoints = upperCI.map(pt => ({
                x: parseFloat(pt.P_percent),
                y: parseFloat(pt.Q)
            })).filter(p => !isNaN(p.x) && !isNaN(p.y) && p.y >= 0);

            if (lowerPoints.length > 0 && upperPoints.length > 0) {
                // Lower CI
                plotData.push({
                    x: lowerPoints.map(p => p.x),
                    y: lowerPoints.map(p => p.y),
                    type: 'scatter',
                    mode: 'lines',
                    name: 'CI 95% (Lower)',
                    line: { color: 'rgba(214, 39, 40, 0.4)', width: 1.2, dash: 'dash' },
                    showlegend: false
                });

                // Upper CI
                plotData.push({
                    x: upperPoints.map(p => p.x),
                    y: upperPoints.map(p => p.y),
                    type: 'scatter',
                    mode: 'lines',
                    name: 'CI 95% (Upper)',
                    line: { color: 'rgba(214, 39, 40, 0.4)', width: 1.2, dash: 'dash' },
                    showlegend: false
                });

                // Fill between (tạo vùng CI)
                plotData.push({
                    x: [...lowerPoints.map(p => p.x), ...upperPoints.map(p => p.x).reverse()],
                    y: [...lowerPoints.map(p => p.y), ...upperPoints.map(p => p.y).reverse()],
                    type: 'scatter',
                    fill: 'toself',
                    fillcolor: 'rgba(214, 39, 40, 0.08)',
                    mode: 'none',
                    name: 'Khoảng tin cậy 95%',
                    showlegend: true,
                    hoverinfo: 'skip'
                });
            }
        }
    }

    // Sort empirical points theo P_percent để đảm bảo đúng thứ tự
    // Lưu ý: Backend trả về Q_sorted giảm dần [max, ..., min] với P tăng dần [2.04%, ..., 97.96%]
    // Nên khi sort theo P, Q sẽ tự động giảm dần (đúng với frequency curve)
    const sortedEmpiricalPoints = [...empiricalPoints].sort((a, b) => a.x - b.x);

    // Validate: Đảm bảo Q giảm dần khi P tăng dần (đúng với frequency analysis)
    const isDecreasing = sortedEmpiricalPoints.every((p, idx) =>
        idx === 0 || p.y <= sortedEmpiricalPoints[idx - 1].y
    );

    if (!isDecreasing) {
        console.warn('Warning: Q values không giảm dần khi P tăng dần. Có thể backend mapping sai.');
    }

    const empiricalData = {
        x: sortedEmpiricalPoints.map(p => p.x),
        y: sortedEmpiricalPoints.map(p => p.y),
        type: 'scatter',
        mode: 'markers',
        name: 'Thực nghiệm',
        marker: {
            color: '#2ca02c', // Xanh lá (chuẩn matplotlib)
            size: 8,
            symbol: 'circle',
            line: { color: '#fff', width: 1.5 },
            opacity: 1
        },
        hovertemplate: 'P: %{x:.2f}%<br>Q: %{y:.2f} ' + headerUnit + '<extra></extra>'
    };

    // Removed excessive debug logging for performance

    // Chuẩn FFC 2008 & HEC-SSP: Trục X log scale với tickvals chi tiết
    const majorTicks = [0.01, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 98, 99, 99.5, 99.9];
    const majorTickText = majorTicks.map(v => {
        if (v >= 1) return v.toFixed(0);
        if (v >= 0.1) return v.toFixed(1);
        return v.toString();
    });

    // Minor ticks cho log scale (1-9 trong mỗi decade)

    // Return period tương ứng với P% (T = 100 / P)
    const returnPeriods = majorTicks.map(p => (100 / p).toFixed(p < 1 ? 0 : 1));

    // Memoize layout để tránh re-render không cần thiết
    const layout = useMemo(() => ({
        // title: { text: 'Đường Tần Suất (Gumbel Probability Plot)', font: { size: 16, color: 'black' } },
        width: chartSize.autosize ? null : chartSize.width,
        height: chartSize.autosize ? null : chartSize.height,
        autosize: chartSize.autosize, // Chỉ auto khi màn hình nhỏ

        // Trục X chính: Xác suất vượt P% (log scale - chuẩn FFC 2008)
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

        // Trục X phụ: Return Period (T năm)
        xaxis2: {
            type: 'log',
            tickvals: majorTicks,
            ticktext: returnPeriods.map((t, i) => {
                // Format: Hiển thị T cho các P quan trọng
                const p = majorTicks[i];
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
            }),
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

        // Trục Y: Lượng mưa/Lưu lượng (tự động fit data)
        yaxis: {
            title: {
                text: `${headerTitle} (${headerUnit})`,
                font: { size: 14, family: 'Arial, sans-serif', color: '#1a1a1a', weight: 'bold' },
                standoff: 10
            },
            range: [finalMinY, reasonableMaxY],
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
            // Auto ticks với format đẹp hơn
            tickmode: 'linear',
            dtick: reasonableMaxY <= 100 ? 10 : reasonableMaxY <= 200 ? 20 : reasonableMaxY <= 500 ? 50 : 100,
            tickformat: '.0f'
        },
        // Margin: Tăng top để có chỗ cho trục Return Period
        margin: { l: 80, r: 60, t: 80, b: 75 },

        hovermode: 'closest',

        // Legend: Hiển thị bên trong biểu đồ (chuẩn FFC 2008)
        showlegend: true,
        legend: {
            x: 0.98,
            y: 0.98,
            xanchor: 'right',
            yanchor: 'top',
            bgcolor: 'rgba(255, 255, 255, 0.95)',
            bordercolor: '#d9d9d9',
            borderwidth: 1.5,
            font: { size: 12, family: 'Arial, sans-serif', color: '#333' },
            itemclick: 'toggleothers',
            itemdoubleclick: 'toggle'
        },

        // Plot background: Trắng sạch (chuẩn FFC 2008)
        plot_bgcolor: '#ffffff',
        paper_bgcolor: '#fafafa',

        // Annotation: Hiển thị thông tin phân phối (simplified for performance)
        annotations: chartData.statistics ? [{
            text: `<b>${getDistributionName(endpoint)}</b><br>` +
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

        // Shapes: Simplified for performance
        shapes: []
    }), [chartSize, headerTitle, headerUnit, endpoint, chartData.statistics, reasonableMaxY, finalMinY, majorTicks, majorTickText, returnPeriods]);





    // Final validation trước khi render
    if (empiricalData.x.length !== empiricalData.y.length) {
        console.error('ERROR: x and y lengths mismatch!', {
            xLength: empiricalData.x.length,
            yLength: empiricalData.y.length
        });
        return (
            <div className="text-center py-5">
                <p className="mt-3 text-danger">Lỗi: Số lượng x và y không khớp</p>
            </div>
        );
    }

    // Removed excessive logging for performance

    // Tìm Q values tại các P% quan trọng (P THẤP = sự kiện HIẾM) - Chuẩn phân tích tần suất
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

    // Key markers (simplified - no text labels for performance)
    const keyPoints = [];
    if (Q_001pct) keyPoints.push({ x: 0.01, y: Q_001pct, name: 'P=0.01%', color: '#8b0000' });  // Cực hiếm - đỏ đậm
    if (Q_01pct) keyPoints.push({ x: 0.1, y: Q_01pct, name: 'P=0.1%', color: '#ff0000' });        // Rất hiếm - đỏ
    if (Q_1pct) keyPoints.push({ x: 1, y: Q_1pct, name: 'P=1%', color: '#ff6600' });              // Hiếm, quan trọng - cam

    if (keyPoints.length > 0) {
        plotData.push({
            x: keyPoints.map(p => p.x),
            y: keyPoints.map(p => p.y),
            type: 'scatter',
            mode: 'markers',
            name: 'Key P%',
            marker: {
                color: keyPoints.map(p => p.color),
                size: 8,
                symbol: 'circle',
                line: { color: '#fff', width: 1.5 }
            },
            showlegend: false,
            hovertemplate: '%{text}<extra></extra>',
            text: keyPoints.map((p, i) =>
                `${p.name}<br>Q=${p.y.toFixed(2)} ${headerUnit}`
            )
        });
    }

    // Thêm empirical data vào cuối để nó hiển thị trên cùng
    plotData.push(empiricalData);

    return (
        <div>
            {/* Hiển thị quality warnings */}
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
                    willChange: 'opacity',
                    minHeight: '400px' // Prevent layout shift
                }}
            >
                {fadeIn && (
                    <Plot
                        key={endpoint} // Force remount when endpoint changes
                        data={plotData}
                        layout={layout}
                        config={config}
                        style={{ width: '100%', height: '100%' }}
                        useResizeHandler={false}
                        divId={`frequency-chart-${endpoint}`}
                    />
                )}
            </div>
        </div>
    );
}

// Memoize component with optimized comparison
export default memo(PlotlyFrequencyChart, (prevProps, nextProps) => {
    // Return true to SKIP re-render (props are equal)
    // Return false to RE-RENDER (props changed)
    const endpointSame = prevProps.endpoint === nextProps.endpoint;
    const dataUpdatedSame = prevProps.dataUpdated === nextProps.dataUpdated;

    // Skip re-render if both are the same
    return endpointSame && dataUpdatedSame;
});
