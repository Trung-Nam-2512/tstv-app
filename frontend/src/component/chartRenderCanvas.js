import React, { useState, useEffect, useRef, memo } from 'react';
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

// Custom log scale cho X axis (0.01% - 99.99%)
const createLogScale = (domain, range) => {
    const [minX, maxX] = domain;
    const [minR, maxR] = range;

    const logMin = Math.log10(minX);
    const logMax = Math.log10(maxX);
    const logRange = logMax - logMin;

    return (x) => {
        const logX = Math.log10(x);
        const t = (logX - logMin) / logRange;
        return minR + t * (maxR - minR);
    };
};

// Smooth interpolation function - Catmull-Rom spline
const catmullRomSpline = (points, t) => {
    const n = points.length - 1;
    if (n < 1) return points[0];

    const i = Math.floor(t * n);
    const localT = (t * n) - i;
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[Math.min(n, i + 1)];
    const p3 = points[Math.min(n, i + 2)];

    const t2 = localT * localT;
    const t3 = t2 * localT;

    return {
        x: 0.5 * (
            (2 * p1.x) +
            (-p0.x + p2.x) * localT +
            (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
            (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
        ),
        y: 0.5 * (
            (2 * p1.y) +
            (-p0.y + p2.y) * localT +
            (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
            (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
        )
    };
};

const CanvasFrequencyChart = ({ endpoint, dataUpdated }) => {
    const canvasRef = useRef(null);
    const isRenderingRef = useRef(false); // Prevent duplicate rendering
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

    const distributionName = getDistributionName(endpoint);
    const distributionColor = getDistributionColor(distributionName);

    // Fetch data
    useEffect(() => {
        if (!endpoint || dataUpdated === null) return;

        const controller = new AbortController();
        const signal = controller.signal;

        const fetchData = async () => {
            try {
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

    // Render chart với Canvas
    useEffect(() => {
        if (isLoading || !chartData || !chartData.theoretical_curve || !chartData.empirical_points) return;
        if (!canvasRef.current) return;

        // Prevent duplicate rendering - use a more robust approach
        const renderKey = `${distributionName}-${chartData.theoretical_curve?.length || 0}-${Date.now()}`;
        if (isRenderingRef.current === renderKey) {
            return;
        }
        isRenderingRef.current = renderKey;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        // QUAN TRỌNG: Clear canvas và reset TẤT CẢ context properties ngay từ đầu
        // Điều này đảm bảo không có state nào từ lần render trước còn sót lại
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Reset TẤT CẢ context properties về mặc định
        ctx.setLineDash([]); // QUAN TRỌNG: Reset về solid line ngay từ đầu
        ctx.globalAlpha = 1;
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#000000';
        ctx.fillStyle = '#000000';
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'miter';
        ctx.miterLimit = 10;

        // Dimensions
        const margin = { top: 100, right: 120, bottom: 80, left: 90 };
        const width = window.innerWidth > 768 ? 800 : window.innerWidth - 40;
        const height = window.innerWidth > 768 ? 600 : 450;
        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;

        canvas.width = width;
        canvas.height = height;
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';

        // Clear canvas
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);

        // Parse data
        const parsePoint = (pt) => {
            const x = typeof pt.P_percent === 'number' ? pt.P_percent : parseFloat(String(pt.P_percent).replace(',', '.'));
            const y = typeof pt.Q === 'number' ? pt.Q : parseFloat(String(pt.Q).replace(',', '.'));
            // Filter NaN, Infinity và giá trị không hợp lệ
            if (isNaN(x) || isNaN(y) || !isFinite(x) || !isFinite(y) || y <= 0) return null;
            return { x, y };
        };

        const theoreticalPoints = (chartData.theoretical_curve || [])
            .map(parsePoint)
            .filter(p => p !== null && isFinite(p.x) && isFinite(p.y) && p.y > 0)
            .sort((a, b) => a.x - b.x);

        // Kiểm tra có gap không
        if (theoreticalPoints.length > 0) {
            const gaps = [];
            for (let i = 1; i < theoreticalPoints.length; i++) {
                const gap = theoreticalPoints[i].x - theoreticalPoints[i - 1].x;
                if (gap > 1) { // Gap lớn hơn 1%
                    gaps.push({ from: theoreticalPoints[i - 1].x, to: theoreticalPoints[i].x, gap });
                }
            }
            if (gaps.length > 0) {
                console.warn(`[Canvas] Found ${gaps.length} gaps in theoretical curve:`, gaps.slice(0, 5));
            }
        }

        // Safety check: Giới hạn số điểm để tránh lỗi "Invalid array length"
        // JavaScript có giới hạn array length khoảng 2^32-1, nhưng với ~8000 điểm vẫn OK
        // Nếu có quá nhiều điểm, có thể do backend trả về dữ liệu không hợp lệ
        const MAX_POINTS = 50000; // Giới hạn an toàn
        if (theoreticalPoints.length > MAX_POINTS) {
            console.warn(`Warning: Too many theoretical points (${theoreticalPoints.length}), limiting to ${MAX_POINTS}`);
            // Giữ lại các điểm quan trọng nhất (sampling)
            const step = Math.ceil(theoreticalPoints.length / MAX_POINTS);
            const filtered = [];
            for (let i = 0; i < theoreticalPoints.length; i += step) {
                filtered.push(theoreticalPoints[i]);
            }
            // Đảm bảo có điểm cuối cùng
            if (filtered.length === 0 || filtered[filtered.length - 1] !== theoreticalPoints[theoreticalPoints.length - 1]) {
                filtered.push(theoreticalPoints[theoreticalPoints.length - 1]);
            }
            theoreticalPoints.length = 0;
            theoreticalPoints.push(...filtered);
        }

        const empiricalPoints = (chartData.empirical_points || [])
            .map(parsePoint)
            .filter(p => p !== null)
            .sort((a, b) => a.x - b.x);

        if (theoreticalPoints.length === 0 || empiricalPoints.length === 0) return;

        // Tính Y range
        const allYValues = [
            ...theoreticalPoints.map(p => p.y),
            ...empiricalPoints.map(p => p.y),
            ...(chartData.confidence_intervals?.lower || []).map(pt => {
                const q = typeof pt.Q === 'number' ? pt.Q : parseFloat(String(pt.Q).replace(',', '.'));
                return isNaN(q) ? null : q;
            }).filter(v => v !== null),
            ...(chartData.confidence_intervals?.upper || []).map(pt => {
                const q = typeof pt.Q === 'number' ? pt.Q : parseFloat(String(pt.Q).replace(',', '.'));
                return isNaN(q) ? null : q;
            }).filter(v => v !== null)
        ];

        const maxY = Math.max(...allYValues);
        const minY = Math.min(0, Math.min(...allYValues) * 1.1);
        const yMax = Math.ceil(maxY * 1.15);

        // Scales
        const xScale = createLogScale([0.01, 99.99], [0, innerWidth]);
        const yScale = (y) => innerHeight - ((y - minY) / (yMax - minY)) * innerHeight;

        // Translate to margin
        ctx.save();
        ctx.translate(margin.left, margin.top);

        // Draw grid
        ctx.strokeStyle = '#c0c0c0';
        ctx.lineWidth = 0.8;
        ctx.globalAlpha = 0.6;

        // X grid
        const xGridTicks = [0.01, 0.1, 1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 99, 99.9, 99.99];
        xGridTicks.forEach(p => {
            const x = xScale(p);
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, innerHeight);
            ctx.stroke();
        });

        // Y grid
        const yRange = yMax - minY;
        const yTickInterval = yRange <= 1000 ? 100 : yRange <= 5000 ? 500 : 1000;
        const yTicks = [];
        const maxTicks = 1000; // Giới hạn số ticks để tránh lỗi "Invalid array length"
        let tickCount = 0;
        for (let y = Math.ceil(minY / yTickInterval) * yTickInterval; y <= yMax && tickCount < maxTicks; y += yTickInterval) {
            yTicks.push(y);
            tickCount++;
        }
        yTicks.forEach(y => {
            const yPos = yScale(y);
            ctx.beginPath();
            ctx.moveTo(0, yPos);
            ctx.lineTo(innerWidth, yPos);
            ctx.stroke();
        });

        ctx.globalAlpha = 1;

        // DEBUG: Kiểm tra lineDash trước khi vẽ theoretical curve
        const getLineDash = () => {
            // Canvas API không có getter cho lineDash, nhưng ta có thể kiểm tra bằng cách khác
            return 'checking...';
        };


        // Draw confidence intervals TRƯỚC theoretical curve
        if (chartData.confidence_intervals) {
            const lowerCI = (chartData.confidence_intervals.lower || [])
                .map(pt => ({ x: parseFloat(pt.P_percent), y: parseFloat(pt.Q) }))
                .filter(p => !isNaN(p.x) && !isNaN(p.y))
                .sort((a, b) => a.x - b.x);

            const upperCI = (chartData.confidence_intervals.upper || [])
                .map(pt => ({ x: parseFloat(pt.P_percent), y: parseFloat(pt.Q) }))
                .filter(p => !isNaN(p.x) && !isNaN(p.y))
                .sort((a, b) => a.x - b.x);

            if (lowerCI.length > 0 && upperCI.length > 0) {
                // CI fill - dùng save/restore để không ảnh hưởng đến các phần khác
                ctx.save();
                ctx.fillStyle = 'rgba(255, 192, 203, 0.3)';
                ctx.beginPath();
                ctx.moveTo(xScale(lowerCI[0].x), yScale(lowerCI[0].y));
                lowerCI.forEach(p => {
                    ctx.lineTo(xScale(p.x), yScale(p.y));
                });
                upperCI.reverse().forEach(p => {
                    ctx.lineTo(xScale(p.x), yScale(p.y));
                });
                ctx.closePath();
                ctx.fill();
                ctx.restore();

                // CI lines - DASHED - dùng save/restore để không ảnh hưởng đến theoretical curve
                ctx.save();
                ctx.strokeStyle = 'rgba(214, 39, 40, 0.4)';
                ctx.lineWidth = 1.2;
                ctx.setLineDash([5, 5]); // DASHED cho CI

                ctx.beginPath();
                ctx.moveTo(xScale(lowerCI[0].x), yScale(lowerCI[0].y));
                lowerCI.forEach(p => {
                    ctx.lineTo(xScale(p.x), yScale(p.y));
                });
                ctx.stroke();

                ctx.beginPath();
                ctx.moveTo(xScale(upperCI[upperCI.length - 1].x), yScale(upperCI[upperCI.length - 1].y));
                upperCI.reverse().forEach(p => {
                    ctx.lineTo(xScale(p.x), yScale(p.y));
                });
                ctx.stroke();

                ctx.restore(); // Restore - điều này sẽ tự động reset setLineDash về []

                // QUAN TRỌNG: Reset lại ngay sau restore để đảm bảo 100%
                ctx.setLineDash([]);
            }
        }

        // Draw theoretical curve - SOLID LINE như FFC 2008
        // Vẽ SAU CI để đảm bảo hiển thị trên cùng và không bị ảnh hưởng

        // QUAN TRỌNG: KHÔNG dùng save/restore - reset trực tiếp để đảm bảo không bị ảnh hưởng
        // Reset TẤT CẢ properties về mặc định - đặc biệt là setLineDash
        // QUAN TRỌNG: Reset setLineDash TRƯỚC KHI set các properties khác
        ctx.setLineDash([]); // QUAN TRỌNG: Reset về solid line
        ctx.setLineDash([]); // Reset lại lần nữa để chắc chắn
        ctx.globalAlpha = 1;
        ctx.strokeStyle = distributionColor;
        ctx.fillStyle = distributionColor;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.miterLimit = 10;

        try {
            ctx.beginPath();
            if (theoreticalPoints.length > 0) {
                const firstPoint = theoreticalPoints[0];
                ctx.moveTo(xScale(firstPoint.x), yScale(firstPoint.y));

                for (let i = 1; i < theoreticalPoints.length; i++) {
                    const p = theoreticalPoints[i];
                    ctx.lineTo(xScale(p.x), yScale(p.y));
                }
            } else {
                console.warn(`[DEBUG ${distributionName}] Theoretical: No points to draw!`);
            }

            // QUAN TRỌNG: Reset lại NGAY TRƯỚC KHI stroke() - đảm bảo 100%
            ctx.setLineDash([]); // Reset về solid line - QUAN TRỌNG!

            ctx.stroke();
        } catch (error) {
            console.error(`[DEBUG ${distributionName}] ERROR drawing theoretical curve:`, error);
            console.error(`[DEBUG ${distributionName}] Error stack:`, error.stack);
            // Vẫn reset lineDash để không ảnh hưởng đến các phần khác
            ctx.setLineDash([]);
        }

        // Draw empirical points - Diamond màu đỏ
        ctx.fillStyle = '#ff0000';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 0.5;

        empiricalPoints.forEach(p => {
            const x = xScale(p.x);
            const y = yScale(p.y);
            const size = 4;

            ctx.beginPath();
            ctx.moveTo(x, y - size);
            ctx.lineTo(x + size, y);
            ctx.lineTo(x, y + size);
            ctx.lineTo(x - size, y);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        });

        // Draw axes
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = 2;

        // X axis
        ctx.beginPath();
        ctx.moveTo(0, innerHeight);
        ctx.lineTo(innerWidth, innerHeight);
        ctx.stroke();

        // Y axis
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, innerHeight);
        ctx.stroke();

        // X axis ticks và labels
        ctx.fillStyle = '#333';
        ctx.font = '11px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        xGridTicks.forEach(p => {
            const x = xScale(p);
            ctx.beginPath();
            ctx.moveTo(x, innerHeight);
            ctx.lineTo(x, innerHeight + 6);
            ctx.stroke();

            let label = '';
            if (p >= 1) label = p.toFixed(0);
            else if (p >= 0.1) label = p.toFixed(1);
            else label = p.toString();

            ctx.fillText(label, x, innerHeight + 10);
        });

        // X axis label
        ctx.font = 'bold 14px Arial';
        ctx.fillText('Tần suất, P(%)', innerWidth / 2, innerHeight + 35);

        // Y axis ticks và labels
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.font = '11px Arial';

        yTicks.forEach(y => {
            const yPos = yScale(y);
            ctx.beginPath();
            ctx.moveTo(0, yPos);
            ctx.lineTo(-6, yPos);
            ctx.stroke();
            ctx.fillText(y.toFixed(0), -10, yPos);
        });

        // Y axis label
        ctx.save();
        ctx.translate(-60, innerHeight / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${headerTitle}, Q(${headerUnit})`, 0, 0);
        ctx.restore();

        // Title
        ctx.restore();
        ctx.fillStyle = '#1a1a1a';
        ctx.font = 'bold 18px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const stationName = fileInfo?.fileName?.replace(/\.[^/.]+$/, "") || "DỮ LIỆU";
        const titleText = `ĐƯỜNG TẦN SUẤT ${headerTitle.toUpperCase()}`;
        ctx.fillText(titleText, width / 2, 15);

        // Legend
        ctx.save();
        ctx.translate(width - margin.right, margin.top);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.strokeStyle = '#d9d9d9';
        ctx.lineWidth = 1.5;
        ctx.fillRect(-280, -5, 280, 60);
        ctx.strokeRect(-280, -5, 280, 60);

        ctx.font = '11px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        // Observed data
        ctx.fillStyle = '#ff0000';
        const diamondSize = 5;
        ctx.beginPath();
        ctx.moveTo(-270, 5);
        ctx.lineTo(-270 + diamondSize, 5 + diamondSize);
        ctx.lineTo(-270, 5 + diamondSize * 2);
        ctx.lineTo(-270 - diamondSize, 5 + diamondSize);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 0.5;
        ctx.stroke();

        ctx.fillStyle = '#333';
        ctx.fillText(
            chartData.statistics
                ? `Số liệu thực đo | TB=${chartData.statistics.mean.toFixed(2)}, Cv=${chartData.statistics.cv.toFixed(2)}, Cs=${chartData.statistics.cs.toFixed(2)}`
                : 'Số liệu thực đo',
            -260, 10
        );

        // Theoretical distribution
        ctx.strokeStyle = distributionColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-270, 30);
        ctx.lineTo(-250, 30);
        ctx.stroke();

        ctx.fillStyle = '#333';
        ctx.fillText(
            chartData.statistics
                ? `Phân bố ${distributionName} | TB=${chartData.statistics.mean.toFixed(2)}, Cv=${chartData.statistics.cv.toFixed(2)}, Cs=${chartData.statistics.cs.toFixed(2)}`
                : `Phân bố ${distributionName}`,
            -245, 30
        );

        ctx.restore();

        // Reset rendering flag
        setTimeout(() => {
            isRenderingRef.current = false;
        }, 50);

    }, [chartData, isLoading, headerTitle, headerUnit, distributionName, distributionColor, fileInfo]);

    if (isLoading || !chartData || !chartData.theoretical_curve || !chartData.empirical_points) {
        return (
            <div className="text-center py-5">
                <FontAwesomeIcon icon={faSpinner} className="loading-spinner me-3" />
                <p className="mt-3">{isLoading ? 'Đang tải biểu đồ...' : 'Không có dữ liệu'}</p>
            </div>
        );
    }

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
                <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }}></canvas>
            </div>
        </div>
    );
};

export default memo(CanvasFrequencyChart);

