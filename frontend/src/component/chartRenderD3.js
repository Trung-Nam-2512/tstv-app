import React, { useState, useEffect, useRef, memo } from 'react';
import * as d3 from 'd3';
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

// Custom scale: Mixed scale (log 0.01-10% + linear 20-99.99%)
// FFC 2008 sử dụng log scale cho P từ 0.01% đến 10%, linear scale cho P từ 20% đến 99.99%
// QUAN TRỌNG: Phải đảm bảo transition mượt mà giữa 10% và 20% để tránh gãy khúc
// Giải pháp: Dùng một scale function với smooth interpolation để tránh discontinuity về derivative
const createMixedScale = (domain, range) => {
    const [minX, maxX] = domain;
    const [minR, maxR] = range;

    // Thresholds theo FFC 2008
    const logEnd = 10;      // Kết thúc log scale tại 10%
    const linearStart = 20;  // Bắt đầu linear scale tại 20%

    // Tính toán vị trí transition - Log scale chiếm ~40% không gian
    const logRange = (maxR - minR) * 0.4;
    const transitionPos = minR + logRange;

    // Tạo log scale cho vùng 0.01-10%
    const logScale = d3.scaleLog()
        .domain([minX, logEnd])
        .range([minR, transitionPos]);

    // Tạo linear scale cho vùng 20-99.99%
    // Điều chỉnh để đảm bảo continuity tại điểm nối
    const logEndPos = logScale(logEnd);
    const linearScale = d3.scaleLinear()
        .domain([linearStart, maxX])
        .range([logEndPos, maxR]);

    const linearStartPos = linearScale(linearStart);

    // Smooth transition function (sigmoid-like) để tránh gãy khúc
    // Dùng smoothstep function thay vì linear interpolation
    const smoothstep = (t) => {
        return t * t * (3 - 2 * t); // Smoothstep function
    };

    // Scale function với smooth transition
    const scale = (x) => {
        if (x <= logEnd) {
            return logScale(x);
        } else if (x >= linearStart) {
            return linearScale(x);
        } else {
            // Smooth interpolation trong vùng transition (10% - 20%)
            // Dùng smoothstep để tạo transition mượt hơn
            const t = (x - logEnd) / (linearStart - logEnd);
            const smoothT = smoothstep(t); // Apply smoothstep để mượt hơn
            return logEndPos + smoothT * (linearStartPos - logEndPos);
        }
    };

    // Invert function - cần tính ngược lại smoothstep
    scale.invert = (y) => {
        if (y <= logEndPos) {
            return logScale.invert(y);
        } else if (y >= linearStartPos) {
            return linearScale.invert(y);
        } else {
            // Inverse smoothstep (approximate)
            const t = (y - logEndPos) / (linearStartPos - logEndPos);
            // Inverse smoothstep: solve t = smoothstep(s) for s
            // Approximate solution
            let s = t;
            if (t > 0 && t < 1) {
                // Newton's method approximation for inverse smoothstep
                for (let i = 0; i < 5; i++) {
                    const f = s * s * (3 - 2 * s) - t;
                    const df = 6 * s * (1 - s);
                    s = s - f / df;
                    s = Math.max(0, Math.min(1, s)); // Clamp
                }
            }
            return logEnd + s * (linearStart - logEnd);
        }
    };

    // D3 axis compatibility
    scale.domain = () => domain;
    scale.range = () => range;
    scale.ticks = (count) => {
        const logTicks = logScale.ticks(count / 2);
        const linearTicks = linearScale.ticks(count / 2);
        return [...logTicks.filter(t => t <= logEnd), ...linearTicks.filter(t => t >= linearStart)];
    };
    scale.tickFormat = () => (d) => {
        if (d >= 1) return d.toFixed(0);
        if (d >= 0.1) return d.toFixed(1);
        return d.toString();
    };

    return scale;
};

const D3FrequencyChart = ({ endpoint, dataUpdated }) => {
    const svgRef = useRef(null);
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

    // Render chart với D3
    useEffect(() => {
        if (isLoading || !chartData || !chartData.theoretical_curve || !chartData.empirical_points) return;
        if (!svgRef.current) return;

        // Parse data
        const parsePoint = (pt) => {
            const x = typeof pt.P_percent === 'number' ? pt.P_percent : parseFloat(String(pt.P_percent).replace(',', '.'));
            const y = typeof pt.Q === 'number' ? pt.Q : parseFloat(String(pt.Q).replace(',', '.'));
            if (isNaN(x) || isNaN(y)) return null;
            return { x, y };
        };

        const theoreticalPoints = (chartData.theoretical_curve || [])
            .map(parsePoint)
            .filter(p => p !== null)
            .sort((a, b) => a.x - b.x);

        const empiricalPoints = (chartData.empirical_points || [])
            .map(parsePoint)
            .filter(p => p !== null)
            .sort((a, b) => a.x - b.x);

        if (theoreticalPoints.length === 0 || empiricalPoints.length === 0) return;

        // Kiểm tra xem có gap nào không trong vùng transition
        const transitionPoints = theoreticalPoints.filter(p => p.x >= 10 && p.x <= 20);
        if (transitionPoints.length > 0) {
            for (let i = 1; i < transitionPoints.length; i++) {
                const gap = transitionPoints[i].x - transitionPoints[i - 1].x;
                if (gap > 0.5) {
                    console.warn(`Large gap detected at ${transitionPoints[i - 1].x} -> ${transitionPoints[i].x}: ${gap}`);
                }
            }
        }

        // Tính Y range - Cho phép giá trị âm như FFC 2008
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
        const minY = Math.min(0, Math.min(...allYValues) * 1.1); // Cho phép giá trị âm
        const yMax = Math.ceil(maxY * 1.15);

        // Tính major ticks cho Y (mỗi 500 hoặc tương tự)
        const yRange = yMax - minY;
        const yTickInterval = yRange <= 1000 ? 100 : yRange <= 5000 ? 500 : 1000;
        const yTicks = [];
        for (let y = Math.ceil(minY / yTickInterval) * yTickInterval; y <= yMax; y += yTickInterval) {
            yTicks.push(y);
        }

        // Dimensions
        const margin = { top: 100, right: 120, bottom: 80, left: 90 };
        const width = window.innerWidth > 768 ? 800 : window.innerWidth - 40;
        const height = window.innerWidth > 768 ? 600 : 450;
        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;

        // Clear previous
        d3.select(svgRef.current).selectAll("*").remove();

        const svg = d3.select(svgRef.current)
            .attr("width", width)
            .attr("height", height)
            .style("background", "#ffffff");

        const g = svg.append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);

        // TITLE CHÍNH - Giống FFC 2008
        const stationName = fileInfo?.fileName?.replace(/\.[^/.]+$/, "") || "DỮ LIỆU";
        const titleText = `ĐƯỜNG TẦN SUẤT ${headerTitle.toUpperCase()}`;
        svg.append("text")
            .attr("x", width / 2)
            .attr("y", 35)
            .attr("text-anchor", "middle")
            .attr("fill", "#1a1a1a")
            .style("font-size", "18px")
            .style("font-weight", "bold")
            .style("font-family", "Arial, sans-serif")
            .text(titleText);

        // Mixed scale cho X axis
        const xScale = createMixedScale([0.01, 99.99], [0, innerWidth]);

        // Linear scale cho Y
        const yScale = d3.scaleLinear()
            .domain([minY, yMax])
            .range([innerHeight, 0]);

        // Dense grid - Giống FFC 2008
        // Grid cho X axis (log scale 0.01-10%, linear 20-99.99%)
        const xGridTicks = [
            // Log scale ticks
            0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10,
            // Linear scale ticks
            20, 30, 40, 50, 60, 70, 80, 90, 95, 98, 99, 99.5, 99.9, 99.99
        ];

        g.append("g")
            .attr("class", "grid")
            .attr("transform", `translate(0,${innerHeight})`)
            .selectAll("line")
            .data(xGridTicks)
            .enter()
            .append("line")
            .attr("x1", d => xScale(d))
            .attr("x2", d => xScale(d))
            .attr("y1", 0)
            .attr("y2", -innerHeight)
            .attr("stroke", "#c0c0c0")
            .attr("stroke-width", 0.8)
            .attr("opacity", 0.6);

        // Grid cho Y axis
        g.append("g")
            .attr("class", "grid")
            .selectAll("line")
            .data(yTicks)
            .enter()
            .append("line")
            .attr("x1", 0)
            .attr("x2", innerWidth)
            .attr("y1", d => yScale(d))
            .attr("y2", d => yScale(d))
            .attr("stroke", "#c0c0c0")
            .attr("stroke-width", 0.8)
            .attr("opacity", 0.6);

        // X Axis - Bottom (Frequency P%) - Custom rendering cho mixed scale
        const xAxisTicks = [0.01, 0.1, 1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 99, 99.9, 99.99];
        const xAxisG = g.append("g")
            .attr("class", "x-axis")
            .attr("transform", `translate(0,${innerHeight})`);

        // Axis line
        xAxisG.append("line")
            .attr("x1", 0)
            .attr("x2", innerWidth)
            .attr("y1", 0)
            .attr("y2", 0)
            .attr("stroke", "#1a1a1a")
            .attr("stroke-width", 2);

        // Ticks và labels
        xAxisG.selectAll(".tick")
            .data(xAxisTicks)
            .enter()
            .append("g")
            .attr("class", "tick")
            .attr("transform", d => `translate(${xScale(d)},0)`)
            .each(function (d) {
                d3.select(this).append("line")
                    .attr("y2", 6)
                    .attr("stroke", "#1a1a1a")
                    .attr("stroke-width", 1.5);

                d3.select(this).append("text")
                    .attr("y", 20)
                    .attr("dy", "0.71em")
                    .attr("text-anchor", "middle")
                    .style("font-size", "11px")
                    .style("fill", "#333")
                    .text(() => {
                        if (d >= 1) return d.toFixed(0);
                        if (d >= 0.1) return d.toFixed(1);
                        return d.toString();
                    });
            });

        // Axis label
        xAxisG.append("text")
            .attr("x", innerWidth / 2)
            .attr("y", 50)
            .attr("fill", "#1a1a1a")
            .style("font-size", "14px")
            .style("font-weight", "bold")
            .text("Tần suất, P(%)");

        // X Axis - Top (Return Period T) - Custom rendering
        const returnPeriodMap = {
            0.01: '10000', 0.1: '1000', 1: '100', 10: '10', 20: '5', 50: '2'
        };
        const returnPeriodTicks = [0.01, 0.1, 1, 10, 20, 50];
        const xAxis2G = g.append("g")
            .attr("class", "x-axis-top");

        // Axis line
        xAxis2G.append("line")
            .attr("x1", 0)
            .attr("x2", innerWidth)
            .attr("y1", 0)
            .attr("y2", 0)
            .attr("stroke", "#1a1a1a")
            .attr("stroke-width", 2);

        // Ticks và labels
        xAxis2G.selectAll(".tick")
            .data(returnPeriodTicks)
            .enter()
            .append("g")
            .attr("class", "tick")
            .attr("transform", d => `translate(${xScale(d)},0)`)
            .each(function (d) {
                d3.select(this).append("line")
                    .attr("y2", -6)
                    .attr("stroke", "#1a1a1a")
                    .attr("stroke-width", 1.5);

                d3.select(this).append("text")
                    .attr("y", -10)
                    .attr("dy", "0.71em")
                    .attr("text-anchor", "middle")
                    .style("font-size", "11px")
                    .style("fill", "#333")
                    .text(() => returnPeriodMap[d] || '');
            });

        // Axis label
        xAxis2G.append("text")
            .attr("x", innerWidth / 2)
            .attr("y", -30)
            .attr("fill", "#1a1a1a")
            .style("font-size", "14px")
            .style("font-weight", "bold")
            .text("Chu kỳ lặp lại, T (năm)");

        // Y Axis
        const yAxis = d3.axisLeft(yScale)
            .tickValues(yTicks)
            .tickFormat(d => d.toFixed(0));

        const yAxisG = g.append("g")
            .call(yAxis);

        yAxisG.selectAll("text")
            .style("font-size", "11px")
            .style("fill", "#333");

        yAxisG.selectAll("line, path")
            .attr("stroke", "#1a1a1a")
            .attr("stroke-width", 2);

        yAxisG.append("text")
            .attr("transform", "rotate(-90)")
            .attr("y", -60)
            .attr("x", -innerHeight / 2)
            .attr("fill", "#1a1a1a")
            .style("font-size", "14px")
            .style("font-weight", "bold")
            .text(`${headerTitle}, Q(${headerUnit})`);

        // Line generator - LINEAR interpolation như FFC 2008
        // FFC 2008 dùng LINEAR với RẤT NHIỀU điểm (2500 điểm) để tạo đường cong mượt
        // Với mixed scale, linear interpolation là tốt nhất để tránh gãy khúc
        const line = d3.line()
            .x(d => xScale(d.x))
            .y(d => yScale(d.y))
            .curve(d3.curveLinear); // LINEAR - chuẩn FFC 2008 cho mixed scale

        // Draw confidence intervals nếu có
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
                // CI fill area - LINEAR interpolation
                const area = d3.area()
                    .x(d => xScale(d.x))
                    .y0(d => yScale(d.y0))
                    .y1(d => yScale(d.y1))
                    .curve(d3.curveLinear); // LINEAR cho mixed scale

                const ciData = lowerCI.map((d, i) => ({
                    x: d.x,
                    y0: d.y,
                    y1: upperCI[i]?.y || d.y
                }));

                g.append("path")
                    .datum(ciData)
                    .attr("fill", "rgba(255, 192, 203, 0.3)") // Màu hồng nhạt như FFC 2008
                    .attr("d", area);

                // CI lines - LINEAR interpolation
                const ciLine = d3.line()
                    .x(d => xScale(d.x))
                    .y(d => yScale(d.y))
                    .curve(d3.curveLinear); // LINEAR cho mixed scale

                g.append("path")
                    .datum(lowerCI)
                    .attr("fill", "none")
                    .attr("stroke", "rgba(214, 39, 40, 0.4)")
                    .attr("stroke-width", 1.2)
                    .attr("stroke-dasharray", "5,5")
                    .attr("d", ciLine);

                g.append("path")
                    .datum(upperCI)
                    .attr("fill", "none")
                    .attr("stroke", "rgba(214, 39, 40, 0.4)")
                    .attr("stroke-width", 1.2)
                    .attr("stroke-dasharray", "5,5")
                    .attr("d", ciLine);
            }
        }

        // Draw theoretical curve - Màu theo distribution
        // QUAN TRỌNG: Đảm bảo dữ liệu mượt trong vùng transition
        // Với 2500 điểm từ backend, không cần filter nhưng đảm bảo sort đúng
        g.append("path")
            .datum(theoreticalPoints)
            .attr("fill", "none")
            .attr("stroke", distributionColor)
            .attr("stroke-width", 2)
            .attr("d", line)
            .attr("class", "theoretical-curve");

        // Draw empirical points - DIAMOND màu ĐỎ như FFC 2008
        const diamondPath = d3.symbol().type(d3.symbolDiamond).size(40);

        g.selectAll(".empirical-point")
            .data(empiricalPoints)
            .enter()
            .append("path")
            .attr("class", "empirical-point")
            .attr("d", diamondPath)
            .attr("transform", d => `translate(${xScale(d.x)},${yScale(d.y)})`)
            .attr("fill", "#ff0000") // Màu đỏ như FFC 2008
            .attr("stroke", "#fff")
            .attr("stroke-width", 0.5);

        // LEGEND - Góc phải trên với tham số thống kê
        const legendX = innerWidth - 10;
        const legendY = 10;
        const legendItemHeight = 20;
        const legendSpacing = 5;

        const legendItems = [];

        // Observed data
        if (chartData.statistics) {
            legendItems.push({
                label: 'Số liệu thực đo',
                marker: 'diamond',
                color: '#ff0000',
                stats: chartData.statistics
            });
        }

        // Theoretical distribution
        if (chartData.statistics) {
            legendItems.push({
                label: `Phân bố ${distributionName}`,
                marker: 'line',
                color: distributionColor,
                stats: chartData.statistics
            });
        }

        const legendGroup = g.append("g")
            .attr("class", "legend")
            .attr("transform", `translate(${legendX},${legendY})`);

        // Legend background
        const legendWidth = 280;
        const legendHeight = legendItems.length * legendItemHeight + 10;
        legendGroup.append("rect")
            .attr("x", -legendWidth)
            .attr("y", -5)
            .attr("width", legendWidth)
            .attr("height", legendHeight)
            .attr("fill", "rgba(255, 255, 255, 0.95)")
            .attr("stroke", "#d9d9d9")
            .attr("stroke-width", 1.5);

        legendItems.forEach((item, i) => {
            const itemY = i * (legendItemHeight + legendSpacing);

            // Marker
            if (item.marker === 'diamond') {
                const diamond = d3.symbol().type(d3.symbolDiamond).size(60);
                legendGroup.append("path")
                    .attr("d", diamond)
                    .attr("transform", `translate(${-legendWidth + 15},${itemY})`)
                    .attr("fill", item.color)
                    .attr("stroke", "#fff")
                    .attr("stroke-width", 0.5);
            } else if (item.marker === 'line') {
                legendGroup.append("line")
                    .attr("x1", -legendWidth + 5)
                    .attr("x2", -legendWidth + 25)
                    .attr("y1", itemY)
                    .attr("y2", itemY)
                    .attr("stroke", item.color)
                    .attr("stroke-width", 2);
            }

            // Label với tham số thống kê (format như FFC 2008)
            const stats = item.stats;
            let labelText;
            if (stats) {
                // Format: "Tên | TB=xxx.xx, Cv=x.xx, Cs=x.xx"
                labelText = `${item.label} | TB=${stats.mean.toFixed(2)}, Cv=${stats.cv.toFixed(2)}, Cs=${stats.cs.toFixed(2)}`;
            } else {
                labelText = item.label;
            }

            legendGroup.append("text")
                .attr("x", -legendWidth + 30)
                .attr("y", itemY + 5)
                .attr("fill", "#333")
                .style("font-size", "11px")
                .style("font-family", "Arial, sans-serif")
                .text(labelText);
        });

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
                <svg ref={svgRef} style={{ width: '100%', height: '100%' }}></svg>
            </div>
        </div>
    );
};

export default memo(D3FrequencyChart);
