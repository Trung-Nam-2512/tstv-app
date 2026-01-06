import React, { useState, useEffect, useMemo, memo, useContext, useRef } from 'react';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';
// Import highcharts-more để hỗ trợ arearange type cho CI area
// Cách đúng: import trực tiếp, nó sẽ tự động extend Highcharts
import 'highcharts/highcharts-more';
import { useFileInfo } from '../context/fileInfoContext';
import { useUnit } from '../context/unitContext';
import { useAnalysis } from '../context/analysisContext';
import { ChartSettingsContext } from '../context/chartSettingsContext';
import Config from '../config/config';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner, faExclamationTriangle, faCog } from '@fortawesome/free-solid-svg-icons';
import { Alert, Button } from 'react-bootstrap';
import FrequencyCurveConfigModal from './FrequencyCurveConfigModal';

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

const HighchartsFrequencyChart = ({ endpoint, dataUpdated }) => {
    // Use ref to track if we've already loaded data for this endpoint
    const loadedEndpointRef = useRef(null);
    const loadedMethodRef = useRef(null);
    const loadedAnalysisIdRef = useRef(null); // Track analysisId để detect source change

    /**
     * Initialize chartData from sessionStorage if available (to persist across tab switches)
     * QUAN TRỌNG: Giờ include analysisId trong cache key để phân biệt các phiên phân tích khác nhau
     */
    const getCachedChartData = (endpoint, method, analysisIdFromContext) => {
        if (!endpoint) return null;
        try {
            // Include analysisId trong cache key để đảm bảo mỗi phiên phân tích có cache riêng
            const cacheKey = `chart_data_${endpoint}_${method || 'auto'}_${analysisIdFromContext || 'unknown'}`;
            const cached = sessionStorage.getItem(cacheKey);
            if (cached) {
                const parsed = JSON.parse(cached);
                // Check if cache is still valid (1 hour)
                const CACHE_DURATION = 60 * 60 * 1000;
                if (Date.now() - parsed.timestamp < CACHE_DURATION) {
                    // Verify analysisId matches
                    if (parsed.analysisId && analysisIdFromContext && parsed.analysisId === analysisIdFromContext) {
                        return parsed.data;
                    }
                    // If no analysisId validation needed (backward compatibility)
                    if (!analysisIdFromContext) {
                        return parsed.data;
                    }
                }
            }
        } catch (e) {
            // Ignore cache errors
        }
        return null;
    };

    const saveChartDataToCache = (endpoint, method, data, analysisIdFromContext) => {
        try {
            const cacheKey = `chart_data_${endpoint}_${method || 'auto'}_${analysisIdFromContext || 'unknown'}`;
            const cacheData = {
                data: data,
                timestamp: Date.now(),
                analysisId: analysisIdFromContext
            };
            sessionStorage.setItem(cacheKey, JSON.stringify(cacheData));
        } catch (e) {
            // Ignore cache save errors
        }
    };

    const [chartData, setChartData] = useState({
        theoretical_curve: [],
        empirical_points: []
    });
    const [isLoading, setIsLoading] = useState(true);
    const [fadeIn, setFadeIn] = useState(false);
    const [showConfigModal, setShowConfigModal] = useState(false);
    const [windowWidth, setWindowWidth] = useState(window.innerWidth);

    const { fileInfo } = useFileInfo();
    const { nameColumn, unit } = useUnit();
    const analysisContext = useAnalysis();
    const chartSettings = useContext(ChartSettingsContext);

    const headerTitle = fileInfo?.dataType && fileInfo.dataType !== 'Unknown'
        ? fileInfo.dataType
        : nameColumn || 'Unknown';
    const headerUnit = fileInfo?.unit && fileInfo.unit !== 'Unknown'
        ? fileInfo.unit
        : unit || 'Unknown';

    const distributionName = useMemo(() => getDistributionName(endpoint), [endpoint]);

    // Get settings với fallback
    const settings = chartSettings?.settings || {
        method: 'auto',
        lineStyle: 'solid',
        lineWidth: 2
    };

    // Fetch data - Only fetch when endpoint or method actually changes
    // QUAN TRỌNG: Giờ còn detect khi analysisId thay đổi (user chuyển nguồn dữ liệu)
    useEffect(() => {
        if (!endpoint || dataUpdated === null) return;

        const distributionMatch = endpoint.match(/frequency_curve_(\w+)/);
        let endpointName = distributionMatch ? distributionMatch[1] : null;
        const endpointToBackendMap = {
            'exponential': 'expon',
            'gpd': 'genpareto'
        };
        const currentDistributionName = endpointToBackendMap[endpointName] || endpointName;
        const aggFuncMatch = endpoint.match(/agg_func=(\w+)/);
        const aggFunc = aggFuncMatch ? aggFuncMatch[1] : 'max';
        const methodParam = settings.method || 'auto';

        // QUAN TRỌNG: Include analysisId trong endpointKey để detect source change
        const currentAnalysisId = analysisContext.analysisId;
        const endpointKey = `${endpoint}_${methodParam}_${currentAnalysisId}`;

        // Detect nếu analysisId đã thay đổi (user chuyển nguồn dữ liệu)
        const analysisIdChanged = loadedAnalysisIdRef.current &&
            loadedAnalysisIdRef.current !== currentAnalysisId;

        if (analysisIdChanged) {
            console.log(`[Chart] AnalysisId changed from ${loadedAnalysisIdRef.current} to ${currentAnalysisId}, forcing refresh`);
            // Reset loaded refs để force refetch
            loadedEndpointRef.current = null;
            loadedMethodRef.current = null;
        }

        // STEP 0: Check sessionStorage cache first (persists across tab switches)
        // QUAN TRỌNG: Giờ include analysisId trong cache key
        const cachedChartData = getCachedChartData(endpoint, methodParam, currentAnalysisId);
        if (cachedChartData &&
            cachedChartData.theoretical_curve &&
            cachedChartData.theoretical_curve.length > 0 &&
            !analysisIdChanged) {
            // Restore from sessionStorage cache immediately
            setChartData(cachedChartData);
            setIsLoading(false);
            setFadeIn(true);
            loadedEndpointRef.current = endpointKey;
            loadedMethodRef.current = methodParam;
            loadedAnalysisIdRef.current = currentAnalysisId;
            return; // Skip all other checks and fetch if cached
        }

        // STEP 1: Check if we've already loaded this exact endpoint + method + analysisId combination (in-memory)
        if (loadedEndpointRef.current === endpointKey &&
            loadedMethodRef.current === methodParam &&
            loadedAnalysisIdRef.current === currentAnalysisId &&
            chartData.theoretical_curve && chartData.theoretical_curve.length > 0) {
            // Already loaded in memory, just ensure fadeIn is true
            setIsLoading(false);
            setFadeIn(true);
            // Also save to sessionStorage for next time
            saveChartDataToCache(endpoint, methodParam, chartData, currentAnalysisId);
            return;
        }

        // STEP 2: Check AnalysisContext cache với source validation
        // QUAN TRỌNG: Giờ gọi getCachedResult với agg_func option để validate
        if (currentDistributionName && analysisContext.isCacheValid({ agg_func: aggFunc })) {
            const cacheMetadata = analysisContext.cacheMetadata;
            // Double-check analysisId match
            if (cacheMetadata && cacheMetadata.analysisId === currentAnalysisId) {
                const cachedData = analysisContext.getCachedResult(currentDistributionName, { agg_func: aggFunc });
                if (cachedData && (!cachedData._method || cachedData._method === methodParam)) {
                    console.log(`[Chart] Using AnalysisContext cache for ${currentDistributionName} (analysisId: ${currentAnalysisId})`);
                    setChartData(cachedData);
                    setIsLoading(false);
                    loadedEndpointRef.current = endpointKey;
                    loadedMethodRef.current = methodParam;
                    loadedAnalysisIdRef.current = currentAnalysisId;
                    // Save to sessionStorage for persistence
                    saveChartDataToCache(endpoint, methodParam, cachedData, currentAnalysisId);
                    requestAnimationFrame(() => setFadeIn(true));
                    return;
                }
            }
        }

        // STEP 3: Fetch from API only if not in any cache
        const controller = new AbortController();
        const signal = controller.signal;

        const fetchData = async () => {
            setIsLoading(true);
            console.log(`[Chart] Fetching ${currentDistributionName} from API (analysisId: ${currentAnalysisId})`);
            try {
                const endpointWithMethod = `${endpoint}&method=${methodParam}`;
                const response = await fetch(`${Config.BASE_URL}/${endpointWithMethod}`, { signal });
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

                const data = await response.json();
                if (!signal.aborted) {
                    // Mark data with method used
                    data._method = methodParam;
                    setChartData(data);
                    setIsLoading(false);
                    loadedEndpointRef.current = endpointKey;
                    loadedMethodRef.current = methodParam;
                    loadedAnalysisIdRef.current = currentAnalysisId;
                    // Save to sessionStorage for persistence across tab switches
                    saveChartDataToCache(endpoint, methodParam, data, currentAnalysisId);
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
    }, [endpoint, settings.method, analysisContext.analysisId]); // Thêm analysisId vào dependencies để detect source change

    // Track window resize for responsive layout
    useEffect(() => {
        const handleResize = () => {
            setWindowWidth(window.innerWidth);
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // MIXED SCALE TRANSFORMATION - Chuẩn FFC 2008
    // Logarithmic: 0.01% → 10%
    // Linear: 20% → 99.99%
    // Transition: 10% → 20% (smooth interpolation)
    // QUAN TRỌNG: P=10% phải nằm TRONG transition zone, không phải ở ranh giới
    // Điều này đảm bảo không có discontinuity tại P=10%
    const logEnd = 10;
    const linearStart = 20;
    const transitionStart = 5;   // Bắt đầu transition sớm hơn (trước P=10%)
    const transitionEnd = 25;    // Kết thúc transition muộn hơn (sau P=20%)
    const minP = 0.01;
    const maxP = 99.99;

    // Transform P(%) sang mixed scale position (0-1 range)
    // QUAN TRỌNG: Đảm bảo C1 continuity (smooth derivative) tại các điểm nối
    const transformMixedScale = (p) => {
        const pClamped = Math.max(minP, Math.min(maxP, p));
        const transitionStartPos = 0.3;
        const transitionEndPos = 0.6;

        if (pClamped <= transitionStart) {
            // Logarithmic scale: 0.01% → 5%
            const logMin = Math.log10(minP);
            const logMax = Math.log10(transitionStart);
            const logP = Math.log10(pClamped);
            const t = (logP - logMin) / (logMax - logMin);
            return t * transitionStartPos; // 0 → transitionStartPos
        } else if (pClamped >= transitionEnd) {
            // Linear scale: 25% → 99.99%
            const t = (pClamped - transitionEnd) / (maxP - transitionEnd);
            return transitionEndPos + t * (1.0 - transitionEndPos); // transitionEndPos → 1.0
        } else {
            // Transition zone: 5% → 25%
            // QUAN TRỌNG: Đảm bảo C1 continuity bằng cách match derivatives tại endpoints
            const t = (pClamped - transitionStart) / (transitionEnd - transitionStart);

            // Tính derivatives tại endpoints:
            // Tại P=5% (t=0): derivative của log scale = (transitionStartPos / (transitionStart * Math.LN10)) / (logMax - logMin)
            // Tại P=25% (t=1): derivative của linear scale = (1.0 - transitionEndPos) / (maxP - transitionEnd)
            const logMin = Math.log10(minP);
            const logMax = Math.log10(transitionStart);
            const logDerivative = transitionStartPos / ((transitionStart * Math.LN10) * (logMax - logMin));
            const linearDerivative = (1.0 - transitionEndPos) / (maxP - transitionEnd);

            // Normalize derivatives cho transition zone
            const transitionRange = transitionEnd - transitionStart;
            const m0 = logDerivative * transitionRange / (transitionEndPos - transitionStartPos);
            const m1 = linearDerivative * transitionRange / (transitionEndPos - transitionStartPos);

            // Cubic Hermite interpolation: h(t) = (2t^3 - 3t^2 + 1)*p0 + (t^3 - 2t^2 + t)*m0 + (-2t^3 + 3t^2)*p1 + (t^3 - t^2)*m1
            // Với p0=0, p1=1, m0 và m1 đã tính ở trên
            const t2 = t * t;
            const t3 = t2 * t;
            const h = (2 * t3 - 3 * t2 + 1) * 0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * 1 + (t3 - t2) * m1;

            return transitionStartPos + h * (transitionEndPos - transitionStartPos);
        }
    };

    // Inverse transform: từ mixed scale position (0-1) về P(%)
    // QUAN TRỌNG: Phải khớp với transformMixedScale (cubic Hermite interpolation)
    const inverseMixedScale = (x) => {
        const xClamped = Math.max(0, Math.min(1, x));
        const transitionStartPos = 0.3;
        const transitionEndPos = 0.6;

        if (xClamped <= transitionStartPos) {
            // Logarithmic scale: 0 → transitionStartPos
            const t = xClamped / transitionStartPos;
            const logMin = Math.log10(minP);
            const logMax = Math.log10(transitionStart);
            const logP = logMin + t * (logMax - logMin);
            return Math.pow(10, logP);
        } else if (xClamped >= transitionEndPos) {
            // Linear scale: transitionEndPos → 1.0
            const t = (xClamped - transitionEndPos) / (1.0 - transitionEndPos);
            return transitionEnd + t * (maxP - transitionEnd);
        } else {
            // Transition zone: transitionStartPos → transitionEndPos
            // Inverse cubic Hermite (Newton's method) - PHẢI KHỚP với transformMixedScale
            const t = (xClamped - transitionStartPos) / (transitionEndPos - transitionStartPos);

            // Tính derivatives tại endpoints (giống transformMixedScale)
            const logMin = Math.log10(minP);
            const logMax = Math.log10(transitionStart);
            const logDerivative = transitionStartPos / ((transitionStart * Math.LN10) * (logMax - logMin));
            const linearDerivative = (1.0 - transitionEndPos) / (maxP - transitionEnd);
            const transitionRange = transitionEnd - transitionStart;
            const m0 = logDerivative * transitionRange / (transitionEndPos - transitionStartPos);
            const m1 = linearDerivative * transitionRange / (transitionEndPos - transitionStartPos);

            // Newton's method để inverse cubic Hermite: h(s) = t
            // Cubic Hermite: h(s) = (s^3 - 2s^2 + s)*m0 + (-2s^3 + 3s^2) + (s^3 - s^2)*m1
            // Với p0=0, p1=1 (giống transformMixedScale)
            let s = t;
            if (t > 0 && t < 1) {
                for (let i = 0; i < 15; i++) {
                    const s2 = s * s;
                    const s3 = s2 * s;
                    // h(s) = (s^3 - 2s^2 + s)*m0 + (-2s^3 + 3s^2) + (s^3 - s^2)*m1
                    const h = (s3 - 2 * s2 + s) * m0 + (-2 * s3 + 3 * s2) + (s3 - s2) * m1;
                    // dh/ds = (3s^2 - 4s + 1)*m0 + (-6s^2 + 6s) + (3s^2 - 2s)*m1
                    const dh = (3 * s2 - 4 * s + 1) * m0 + (-6 * s2 + 6 * s) + (3 * s2 - 2 * s) * m1;
                    // f(s) = h(s) - t
                    const f = h - t;
                    if (Math.abs(dh) > 1e-10) {
                        s = s - f / dh;
                        s = Math.max(0, Math.min(1, s));
                    } else {
                        break;
                    }
                }
            }
            return transitionStart + s * (transitionEnd - transitionStart);
        }
    };

    // DEPRECATED: Giữ lại logTransform để backup nếu cần
    const logTransform = (p) => {
        const pClamped = Math.max(0.01, Math.min(99.99, p));
        return Math.log10(pClamped);
    };

    // BACKEND RENDER APPROACH: Dùng T (Return Period) = 100/P với logarithmic axis
    // QUAN TRỌNG: P% là xác suất VƯỢT (exceedance probability) - xác suất sự kiện HIẾM xảy ra
    // - P% THẤP (0.01%, 1%) = sự kiện HIẾM = T CAO (10000, 100 năm) = BÊN PHẢI
    // - P% CAO (50%, 99%) = sự kiện THƯỜNG XUYÊN = T THẤP (2, 1.01 năm) = BÊN TRÁI
    // - T = 100/P (công thức chuẩn)
    // Giống như backend: ax.semilogx(T_theo, q_theo) - đơn giản và mượt

    const parsePoint = (pt) => {
        if (!pt) return null;
        const pPercent = typeof pt.P_percent === 'number' ? pt.P_percent : parseFloat(String(pt.P_percent).replace(',', '.'));
        const y = typeof pt.Q === 'number' ? pt.Q : parseFloat(String(pt.Q).replace(',', '.'));
        if (isNaN(pPercent) || isNaN(y)) return null;

        // P% là xác suất VƯỢT → T = 100/P
        const pClamped = Math.max(0.01, Math.min(99.99, pPercent));
        const T = 100 / pClamped; // T = 100/P (công thức chuẩn)

        return { x: T, y: y, pOriginal: pPercent, pClamped: pClamped, t: T }; // x = T (Return Period), pOriginal = P gốc chưa clamp
    };

    // Highcharts options - MIXED SCALE theo chuẩn FFC 2008
    // Chuẩn quốc tế: Mixed scale (logarithmic 0.01-10% + linear 20-99.99%)
    // Data được transform sang mixed scale (0-1 range) để dùng linear axis với full control
    const options = useMemo(() => {
        // Early check
        if (!chartData || !chartData.theoretical_curve || !chartData.empirical_points) {
            return null;
        }

        // Dùng P(%) trực tiếp, KHÔNG transform
        // Highcharts logarithmic axis sẽ tự xử lý tốt hơn
        const theoreticalPoints = (chartData.theoretical_curve || [])
            .map(pt => parsePoint(pt))
            .filter(p => p !== null)
            .sort((a, b) => a.x - b.x); // Sort theo P gốc

        const empiricalPoints = (chartData.empirical_points || [])
            .map(pt => parsePoint(pt))
            .filter(p => p !== null)
            .sort((a, b) => a.x - b.x); // Sort theo P gốc

        if (theoreticalPoints.length === 0 || empiricalPoints.length === 0) {
            return null;
        }

        // Tính Y range
        // Filter out invalid values (NaN, Infinity, or extremely large values)
        const validYValues = [
            ...theoreticalPoints.map(p => p.y),
            ...empiricalPoints.map(p => p.y)
        ].filter(y => {
            // Filter out NaN, Infinity, and extremely large values
            // Giới hạn: < 1e8 (100 triệu) - hợp lý hơn cho dữ liệu thực tế
            // Các giá trị lớn hơn thường là do GEV với shape parameter âm hoặc SUM aggregation
            return isFinite(y) && Math.abs(y) < 1e8 && y > -1e8;
        });

        if (validYValues.length === 0) {
            console.error('No valid Y values found for chart');
            return null;
        }

        const maxY = Math.max(...validYValues);
        const minY = Math.min(...validYValues, 0); // Cho phép giá trị âm như FFC 2008
        const yMax = Math.ceil(maxY * 1.15);
        const yMin = minY < 0 ? Math.floor(minY * 1.1) : 0; // Cho phép giá trị âm

        // Additional safety check: ensure yMax and yMin are reasonable
        let finalYMax = yMax;
        let finalYMin = yMin;
        if (!isFinite(yMax) || !isFinite(yMin) || yMax <= yMin) {
            console.error(`Invalid Y-axis range: min=${yMin}, max=${yMax}`);
            // Fallback to a reasonable range
            const fallbackMax = Math.max(...validYValues.filter(y => isFinite(y)));
            const fallbackMin = Math.min(...validYValues.filter(y => isFinite(y)), 0);
            finalYMax = fallbackMax * 1.2;
            finalYMin = fallbackMin;
        }

        const series = [];

        // 1. Confidence intervals (nếu có) - Convert sang T (Return Period) như backend
        if (chartData.confidence_intervals) {

            // Parse CI data - Backend đã xử lý swap và validate
            // QUAN TRỌNG: Match lower và upper theo P_percent TRƯỚC KHI sort
            // Để đảm bảo cùng P_percent có cùng index sau sort
            const lowerMap = new Map();
            (chartData.confidence_intervals.lower || []).forEach(pt => {
                const p = parseFloat(pt.P_percent);
                const q = parseFloat(pt.Q);
                if (!isNaN(p) && !isNaN(q) && isFinite(q)) {
                    lowerMap.set(p, q);
                }
            });

            const upperMap = new Map();
            (chartData.confidence_intervals.upper || []).forEach(pt => {
                const p = parseFloat(pt.P_percent);
                const q = parseFloat(pt.Q);
                if (!isNaN(p) && !isNaN(q) && isFinite(q)) {
                    upperMap.set(p, q);
                }
            });

            // Tìm các P_percent chung (có cả lower và upper)
            const commonP = Array.from(new Set([...lowerMap.keys(), ...upperMap.keys()]))
                .filter(p => lowerMap.has(p) && upperMap.has(p))
                .sort((a, b) => a - b); // Sort theo P_percent (tăng dần = T giảm dần)

            // Tạo arrays đã match và sort theo T (Return Period) TĂNG DẦN
            // CRITICAL: Sort theo T tăng dần để match với logarithmic axis
            // T = 100 / P → P tăng → T giảm
            // QUAN TRỌNG: Dùng P gốc (không clamp) để tính T chính xác
            // Clamp chỉ dùng để giới hạn hiển thị, không dùng để tính T
            const lowerCI = commonP
                .map(p => {
                    const T = 100 / p; // Dùng P gốc, không clamp
                    const lowerQ = lowerMap.get(p);
                    const upperQ = upperMap.get(p);
                    // Safety: chỉ thêm nếu lower < upper
                    if (lowerQ < upperQ && isFinite(T) && T > 0 && isFinite(lowerQ) && isFinite(upperQ)) {
                        return [T, lowerQ, p]; // [T, Q, P_original]
                    }
                    return null;
                })
                .filter(x => x !== null)
                .sort((a, b) => a[0] - b[0]); // Sort theo T tăng dần

            const upperCI = commonP
                .map(p => {
                    const T = 100 / p; // Dùng P gốc, không clamp
                    const lowerQ = lowerMap.get(p);
                    const upperQ = upperMap.get(p);
                    // Safety: chỉ thêm nếu lower < upper
                    if (lowerQ < upperQ && isFinite(T) && T > 0 && isFinite(lowerQ) && isFinite(upperQ)) {
                        return [T, upperQ, p]; // [T, Q, P_original]
                    }
                    return null;
                })
                .filter(x => x !== null)
                .sort((a, b) => a[0] - b[0]); // Sort theo T tăng dần


            // Render CI - Backend đã sort và fill gaps
            if (lowerCI.length >= 2 && upperCI.length >= 2) {
                // CRITICAL FIX: Không sample nữa - để Highcharts tự xử lý với nhiều điểm
                // Highcharts có turboThreshold để optimize rendering
                // Sampling có thể gây zig-zag nếu bỏ sót các điểm quan trọng

                // Filter null/NaN/invalid values trước khi vẽ
                const validLowerCI = lowerCI
                    .filter(p => isFinite(p[0]) && isFinite(p[1]) && p[0] > 0 && p[1] >= 0)
                    .map(p => [p[0], p[1]]); // [T, Q]

                const validUpperCI = upperCI
                    .filter(p => isFinite(p[0]) && isFinite(p[1]) && p[0] > 0 && p[1] >= 0)
                    .map(p => [p[0], p[1]]); // [T, Q]

                // CRITICAL FIX: Match lower và upper theo P_percent (index), không phải T
                // Vì đã sort theo T tăng dần, lowerCI và upperCI có cùng index = cùng P_percent
                // Chỉ cần đảm bảo length bằng nhau và match theo index
                const finalLowerCI = [];
                const finalUpperCI = [];

                // Match theo index (cùng P_percent vì đã sort cùng cách)
                const minLength = Math.min(validLowerCI.length, validUpperCI.length);

                for (let i = 0; i < minLength; i++) {
                    const lowerPoint = validLowerCI[i];
                    const upperPoint = validUpperCI[i];

                    // Kiểm tra cùng T (cùng P_percent)
                    if (lowerPoint[0] === upperPoint[0] && lowerPoint[2] === upperPoint[2]) {
                        const lower = lowerPoint[1];
                        const upper = upperPoint[1];

                        // Safety: đảm bảo lower < upper
                        if (lower < upper && lower >= 0 && isFinite(lower) && isFinite(upper)) {
                            finalLowerCI.push([lowerPoint[0], lower]); // [T, Q]
                            finalUpperCI.push([upperPoint[0], upper]); // [T, Q]
                        }
                    }
                }

                if (finalLowerCI.length >= 2 && finalUpperCI.length >= 2) {
                    // Vẽ CI lines - đã sort theo T tăng dần, đã filter invalid
                    series.push({
                        name: 'CI 95% (Lower)',
                        type: 'line',
                        data: finalLowerCI, // [T, Q] - đã sort theo T tăng dần
                        color: 'rgba(214, 39, 40, 0.6)',
                        lineWidth: 1.5,
                        dashStyle: 'Dash',
                        marker: { enabled: false },
                        enableMouseTracking: true,
                        zIndex: 2,
                        showInLegend: true,
                        connectNulls: true, // CRITICAL: Connect nulls để tránh zig-zag
                        turboThreshold: 0, // Không giới hạn số điểm
                        linecap: 'round',
                        linejoin: 'round'
                    });

                    series.push({
                        name: 'CI 95% (Upper)',
                        type: 'line',
                        data: finalUpperCI, // [T, Q] - đã sort theo T tăng dần
                        color: 'rgba(214, 39, 40, 0.6)',
                        lineWidth: 1.5,
                        dashStyle: 'Dash',
                        marker: { enabled: false },
                        enableMouseTracking: true,
                        zIndex: 2,
                        showInLegend: true,
                        connectNulls: true, // CRITICAL: Connect nulls để tránh zig-zag
                        turboThreshold: 0, // Không giới hạn số điểm
                        linecap: 'round',
                        linejoin: 'round'
                    });
                }
            }
        }

        // 2. Theoretical curve - GIỐNG BACKEND: Dùng T (Return Period) trực tiếp
        // Backend: ax.semilogx(T_theo, q_theo) với T = 100/P
        // Frontend: Dùng T với logarithmic axis - y chang backend
        let theoreticalData = theoreticalPoints.map(p => [p.x, p.y]); // [T, y] - T = Return Period

        // Sort theo T (Return Period) - tăng dần
        theoreticalData.sort((a, b) => a[0] - b[0]);

        // Lấy màu theo distribution
        const getDistributionColor = (name) => {
            if (name === 'Gumbel') return '#00aa00';      // Xanh lá
            if (name === 'Gamma') return '#0066ff';       // Xanh dương
            return '#d62728'; // Đỏ
        };

        // Map line style từ settings
        const dashStyleMap = {
            'solid': 'Solid',
            'dashed': 'Dash',
            'dotted': 'Dot'
        };
        const dashStyle = dashStyleMap[settings.lineStyle] || 'Solid';

        // THAM KHẢO CODE PYTHON MẪU: semilogx dùng line (không phải spline)
        // Matplotlib semilogx với linewidth=2 tự động làm mượt với nhiều điểm
        // Backend đã tạo 3000 điểm → line plot sẽ mượt hoàn toàn
        // Highcharts line với nhiều điểm sẽ mượt như matplotlib semilogx

        // Hàm format tham số phân bố
        const formatDistributionParams = (parameters) => {
            if (!parameters) return '';
            const parts = [];
            if (parameters.loc !== null && parameters.loc !== undefined) {
                parts.push(`Location=${parameters.loc.toFixed(2)}`);
            }
            if (parameters.scale !== null && parameters.scale !== undefined) {
                parts.push(`Scale=${parameters.scale.toFixed(2)}`);
            }
            if (parameters.shape !== null && parameters.shape !== undefined) {
                if (Array.isArray(parameters.shape)) {
                    if (parameters.shape.length > 0) {
                        const shapeStr = parameters.shape.map(s => s.toFixed(2)).join(', ');
                        parts.push(`Shape=[${shapeStr}]`);
                    }
                } else {
                    parts.push(`Shape=${parameters.shape.toFixed(2)}`);
                }
            }
            return parts.length > 0 ? parts.join(', ') : '';
        };

        series.push({
            name: (() => {
                // Phân bố: hiển thị tham số phân bố (location, scale, shape)
                if (chartData.parameters) {
                    const paramsStr = formatDistributionParams(chartData.parameters);
                    return paramsStr ? `Phân bố ${distributionName} | ${paramsStr}` : `Phân bố ${distributionName}`;
                }
                return `Phân bố ${distributionName}`;
            })(),
            type: 'line', // LINE như code Python mẫu (semilogx) - mượt với nhiều điểm
            data: theoreticalData, // Backend đã tạo 3000 điểm → mượt hoàn toàn
            color: getDistributionColor(distributionName),
            lineWidth: settings.lineWidth || 2,
            dashStyle: dashStyle,
            marker: { enabled: false },
            zIndex: 3,
            linecap: 'round',
            linejoin: 'round',
            connectNulls: false,
            turboThreshold: 0, // Không giới hạn số điểm
            states: {
                hover: {
                    lineWidth: settings.lineWidth ? settings.lineWidth + 1 : 3
                }
            }
        });

        // 3. Key markers tại các P quan trọng (P THẤP = sự kiện HIẾM) - Chuẩn phân tích tần suất
        // P% là xác suất VƯỢT (exceedance probability): P THẤP = sự kiện HIẾM = T CAO = quan trọng
        // Chỉ highlight 3 P quan trọng nhất: 0.01% (T=10000), 0.1% (T=1000), 1% (T=100)
        const findQatP = (pPercent) => {
            // Convert P sang T
            const T = 100 / pPercent;
            // Tìm điểm gần nhất trên theoretical curve (theo T)
            // Tolerance lớn hơn cho P rất thấp (0.01%, 0.1%) vì spacing rộng hơn
            const tolerance = pPercent < 0.1 ? 1.0 : pPercent < 1 ? 0.5 : 0.1;
            const point = theoreticalPoints.find(p => Math.abs(p.x - T) < tolerance);
            return point ? { q: point.y } : null;
        };

        const keyPoints = [
            { p: 0.01, result: findQatP(0.01), color: '#8b0000', label: 'P=0.01% (T=10000 năm)' },  // Cực hiếm - đỏ đậm
            { p: 0.1, result: findQatP(0.1), color: '#ff0000', label: 'P=0.1% (T=1000 năm)' },     // Rất hiếm - đỏ
            { p: 1, result: findQatP(1), color: '#ff6600', label: 'P=1% (T=100 năm)' }              // Hiếm, quan trọng - cam
        ].filter(kp => kp.result !== null).map(kp => ({
            p: kp.p,
            q: kp.result.q,
            // Dùng T (Return Period) trực tiếp
            x: 100 / kp.p, // T = 100/P
            color: kp.color,
            label: kp.label
        }));

        if (keyPoints.length > 0) {
            series.push({
                name: 'Key Points',
                type: 'scatter',
                data: keyPoints.map(kp => ({
                    x: kp.x, // T (Return Period) - giống backend
                    y: kp.q,
                    color: kp.color,
                    marker: { radius: 6, lineWidth: 2, lineColor: '#fff' }
                })),
                enableMouseTracking: false,
                showInLegend: false, // Ẩn trong legend vì chỉ là markers hỗ trợ
                zIndex: 5
            });

            // Add vertical lines - Dùng T (Return Period) trực tiếp
            keyPoints.forEach(kp => {
                // Dùng T (Return Period) trực tiếp - giống backend
                series.push({
                    type: 'line',
                    data: [[kp.x, finalYMin], [kp.x, finalYMax]], // T (Return Period)
                    color: kp.color,
                    lineWidth: 1.5,
                    dashStyle: 'Dot',
                    marker: { enabled: false },
                    enableMouseTracking: false,
                    showInLegend: false, // QUAN TRỌNG: Ẩn trong legend
                    zIndex: 4
                });
            });
        }

        // 4. Empirical points - Dùng T (Return Period) trực tiếp (giống backend)
        const empiricalData = empiricalPoints.map(p => [p.x, p.y]); // [T, y] - p.x đã là T (Return Period)

        series.push({
            name: chartData.statistics
                ? `Số liệu thực đo | TB=${chartData.statistics.mean.toFixed(2)}, Cv=${chartData.statistics.cv.toFixed(2)}, Cs=${chartData.statistics.cs.toFixed(2)}`
                : 'Số liệu thực đo', // Số liệu thực đo: luôn hiển thị TB, Cv, Cs
            type: 'scatter',
            data: empiricalData,
            color: '#ff0000', // Màu đỏ như FFC 2008
            marker: {
                symbol: 'diamond', // Diamond shape như FFC 2008
                radius: 4,
                lineWidth: 0.5,
                lineColor: '#fff'
            },
            zIndex: 6
        });

        // Tính toán kích thước cân đối dựa trên viewport - Responsive
        const viewportWidth = windowWidth;
        const isDesktop = viewportWidth > 1024;
        const isTablet = viewportWidth > 768 && viewportWidth <= 1024;
        const isMobile = viewportWidth <= 768;

        // Chart width: responsive với max-width hợp lý
        let chartWidth = null; // null = auto (100% container)
        if (isDesktop) {
            chartWidth = Math.min(1200, viewportWidth - 200); // Max 1200px, trừ padding
        } else if (isTablet) {
            chartWidth = Math.min(900, viewportWidth - 100);
        } else {
            chartWidth = null; // Mobile: full width
        }

        // Chart height: responsive - Tăng chiều cao
        const chartHeight = isDesktop ? 780 : isTablet ? 650 : 550;

        return {
            chart: {
                type: 'line',
                height: chartHeight,
                width: chartWidth,
                backgroundColor: '#ffffff',
                plotBackgroundColor: '#ffffff',
                spacingBottom: isMobile ? 100 : 140, // Tăng spacing để có đủ chỗ cho labels (tăng từ 120 lên 140)
                spacingLeft: isMobile ? 60 : 75,
                spacingRight: isMobile ? 50 : 70,
                spacingTop: isMobile ? 80 : 100, // Giảm spacing trên mobile
                alignTicks: true,
                reflow: true, // Cho phép chart tự điều chỉnh khi resize
                animation: {
                    duration: 500,
                    easing: 'easeOutQuart'
                },
                style: {
                    fontFamily: '"Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif'
                },
                // QUAN TRỌNG: Thêm events để force set min/max đúng và hiển thị TẤT CẢ labels
                events: {
                    init: function () {
                        // Force set min/max đúng TRƯỚC khi chart render
                        const xAxis = this.xAxis[0];
                        if (xAxis) {
                            // Đảm bảo min/max được set đúng trong options
                            if (xAxis.options.min !== 1.0 || xAxis.options.max !== 10000) {
                                xAxis.options.min = 1.0;
                                xAxis.options.max = 10000;
                            }
                        }
                    },
                    load: function () {
                        // Force set min/max đúng sau khi chart load
                        const xAxis = this.xAxis[0];
                        if (xAxis) {
                            if (xAxis.min !== 1.0 || xAxis.max !== 10000) {
                                xAxis.setExtremes(1.0, 10000, false, false);
                            }
                        }
                    }
                }
            },
            title: {
                text: chartData.statistics
                    ? `ĐƯỜNG TẦN SUẤT ${headerTitle.toUpperCase()} `
                    : 'ĐƯỜNG TẦN SUẤT',
                align: 'center',
                style: {
                    fontSize: '20px',
                    fontWeight: '700',
                    color: '#0d47a1',
                    letterSpacing: '0.5px'
                },
                margin: 24
            },
            subtitle: null, // Bỏ subtitle, sẽ dùng info box bên ngoài
            xAxis: [{
                type: 'logarithmic',
                title: {
                    text: 'Chu kỳ lặp lại, T (năm)',
                    style: {
                        fontSize: '14px',
                        fontWeight: '600',
                        color: '#1565c0',
                        letterSpacing: '0.3px'
                    }
                },
                min: 1.0, // T min = 100/99.99 ≈ 1.0
                max: 10000, // T max = 100/0.01 = 10000
                // QUAN TRỌNG: Không cho phép Highcharts tự động adjust min/max từ data
                startOnTick: false, // Không tự động adjust min
                endOnTick: false, // Không tự động adjust max
                // Tick positions: Các giá trị T CHUẨN trong phân tích tần suất
                // QUAN TRỌNG: Dùng tickPositions array trực tiếp thay vì tickPositioner
                // Vì tickPositioner bị gọi với min/max từ data (0-4) thay vì options (1-10000)
                tickPositions: [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000],
                // QUAN TRỌNG: Set tickAmount để ép Highcharts tạo nhiều ticks
                tickAmount: 13, // Force tạo 13 ticks (bằng số lượng tickPositions)
                tickInterval: null,
                // QUAN TRỌNG: Set tickPixelInterval = null để DISABLE auto-hiding hoàn toàn
                // Với logarithmic axis, Highcharts tự động ẩn labels nếu quá gần
                // Set null để disable behavior này
                tickPixelInterval: null,
                showFirstLabel: true,
                showLastLabel: true,
                // Labels cho bottom axis (T - Return Period)
                labels: {
                    formatter: function () {
                        const T = this.value;
                        if (!isFinite(T) || T <= 0) return '';

                        // Format T values theo chuẩn phân tích tần suất
                        let formattedValue;
                        if (T < 1) {
                            formattedValue = T.toFixed(2);
                        } else if (T < 10) {
                            formattedValue = T.toFixed(1);
                        } else {
                            formattedValue = Math.round(T).toString();
                        }

                        // Điều chỉnh vị trí cho giá trị 10 và 100 để tránh đè lên trục
                        // Dùng HTML với margin-top để đẩy xuống
                        if (Math.abs(T - 10) < 0.1 || Math.abs(T - 100) < 1) {
                            return `<div style="margin-top: 10px; display: inline-block;">${formattedValue}</div>`;
                        }

                        return formattedValue;
                    },
                    style: {
                        fontSize: '11px',
                        color: '#374151',
                        fontWeight: '500'
                    },
                    step: 1, // Hiển thị tất cả labels
                    autoRotation: [0], // Không tự động xoay
                    allowOverlap: false, // Không cho phép overlap - Highcharts sẽ tự ẩn nếu cần
                    reserveSpace: true,
                    rotation: 0,
                    staggerLines: 1,
                    enabled: true, // Bật labels mặc định
                    useHTML: true, // Bật HTML để có thể điều chỉnh vị trí cho 10 và 100
                    padding: 8, // Tăng padding để tách xa axis line
                    distance: 15, // Tăng distance để labels không sát axis
                    overflow: 'allow',
                    crop: false,
                    y: 5 // Base y position
                },
                // PlotLines cho các mốc quan trọng trong phân tích tần suất
                // P% là xác suất VƯỢT: P THẤP = sự kiện HIẾM = T CAO = quan trọng
                // Chỉ highlight 3 P quan trọng nhất: 0.01% (T=10000), 0.1% (T=1000), 1% (T=100)
                plotLines: [
                    {
                        value: 10000,
                        color: '#8b0000',
                        width: 2,
                        dashStyle: 'Solid',
                        zIndex: 5,
                        label: {
                            text: 'P=0.01%',
                            align: 'right',
                            verticalAlign: 'top',
                            y: 60, // Đẩy label xuống 60px (đặc biệt cho P=0.01%)
                            style: { color: '#8b0000', fontWeight: '600', fontSize: '10px' }
                        }
                    },
                    {
                        value: 1000,
                        color: '#ff0000',
                        width: 2,
                        dashStyle: 'Solid',
                        zIndex: 5,
                        label: {
                            text: 'P=0.1%',
                            align: 'right',
                            verticalAlign: 'top',
                            y: 55, // Đẩy label xuống 55px
                            style: { color: '#ff0000', fontWeight: '600', fontSize: '10px' }
                        }
                    },
                    {
                        value: 100,
                        color: '#ff6600',
                        width: 2,
                        dashStyle: 'Solid',
                        zIndex: 5,
                        label: {
                            text: 'P=1%',
                            align: 'right',
                            verticalAlign: 'top',
                            y: 55, // Đẩy label xuống 55px
                            style: { color: '#ff6600', fontWeight: '600', fontSize: '10px' }
                        }
                    }
                ],
                gridLineColor: '#e3f2fd',
                gridLineWidth: 1,
                minorGridLineColor: '#f5f5f5',
                minorGridLineWidth: 0.5,
                // QUAN TRỌNG: Với logarithmic axis, cần set minorTickInterval để hiển thị đầy đủ
                minorTickInterval: 'auto', // Tự động tính minor ticks
                minorTickLength: 3,
                minorTickPosition: 'outside',
                minorTickWidth: 1,
                lineColor: '#1565c0',
                lineWidth: 2,
                opposite: false,
                // Events để đảm bảo min/max đúng
                events: {
                    afterSetExtremes: function () {
                        // Force set min/max đúng nếu bị override bởi data
                        if (this.min !== 1.0 || this.max !== 10000) {
                            this.setExtremes(1.0, 10000, false, false);
                        }
                    },
                    afterInit: function () {
                        // Đảm bảo options.min/max được set đúng
                        if (this.options.min !== 1.0 || this.options.max !== 10000) {
                            this.options.min = 1.0;
                            this.options.max = 10000;
                        }
                    }
                }
            }, {
                type: 'logarithmic',
                title: {
                    text: 'Tần suất, P(%)',
                    style: {
                        fontSize: '14px',
                        fontWeight: '600',
                        color: '#1565c0',
                        letterSpacing: '0.3px'
                    }
                },
                min: 0.01, // P min
                max: 99.99, // P max
                linkedTo: 0, // Linked với T axis - sẽ dùng CÙNG tick positions
                // QUAN TRỌNG: Với linkedTo, KHÔNG thể set tickPositions riêng
                // Top axis sẽ tự động dùng tickPositions từ bottom axis (T values)
                // Formatter sẽ convert T → P: P = 100/T
                tickAmount: undefined, // Không tự động tính
                labels: {
                    formatter: function () {
                        // Với linkedTo, this.value là T từ bottom axis
                        // Convert từ T về P(%): P = 100/T
                        const T = this.value;
                        if (!isFinite(T) || T <= 0) return '';
                        const p = 100 / T;
                        if (!isFinite(p) || p <= 0 || p > 100) return '';

                        // Format P(%) - CHÍNH XÁC theo chuẩn phân tích tần suất
                        const standardP = [100, 50, 25, 10, 5, 3, 1, 0.5, 0.3, 0.1, 0.05, 0.03, 0.01];
                        const matched = standardP.find(sp => Math.abs(p - sp) < 0.01);
                        if (matched !== undefined) {
                            // Nếu khớp với giá trị chuẩn, hiển thị chính xác
                            if (matched >= 1) {
                                return Math.round(matched).toString();
                            } else if (matched >= 0.1) {
                                return matched.toFixed(1);
                            } else {
                                return matched.toFixed(2);
                            }
                        }

                        // Nếu không khớp, format theo quy tắc chung
                        if (p >= 1) {
                            return Math.round(p).toString();
                        } else if (p >= 0.1) {
                            return p.toFixed(1);
                        } else {
                            return p.toFixed(2);
                        }
                    },
                    style: {
                        fontSize: '11px',
                        color: '#374151',
                        fontWeight: '500'
                    },
                    step: 1, // Hiển thị tất cả labels
                    autoRotation: [0], // Không tự động xoay
                    allowOverlap: false, // Không cho phép overlap
                    reserveSpace: true,
                    rotation: 0,
                    enabled: true,
                    useHTML: false,
                    padding: 8, // Tăng padding để tách xa axis line
                    distance: 10, // Tăng distance để labels không sát axis
                    overflow: 'allow',
                    crop: false,
                    y: -5 // Đẩy labels lên một chút
                },
                gridLineColor: '#e3f2fd',
                gridLineWidth: 1,
                minorGridLineColor: '#f5f5f5',
                minorGridLineWidth: 0.5,
                lineColor: '#1565c0',
                lineWidth: 2,
                opposite: true
            }],
            yAxis: {
                type: 'linear',
                title: {
                    text: `${headerTitle} (${headerUnit})`,
                    style: {
                        fontSize: '14px',
                        fontWeight: '600',
                        color: '#1565c0',
                        letterSpacing: '0.3px'
                    }
                },
                min: finalYMin, // Cho phép giá trị âm như FFC 2008
                max: finalYMax,
                // Tính toán tick interval hợp lý (mỗi 500 hoặc tương tự)
                tickInterval: finalYMax - finalYMin > 5000 ? 1000 : finalYMax - finalYMin > 2000 ? 500 : finalYMax - finalYMin > 1000 ? 200 : 100,
                gridLineColor: '#e3f2fd',
                gridLineWidth: 1,
                minorGridLineColor: '#f5f5f5',
                minorGridLineWidth: 0.5,
                minorTickInterval: 0.2,
                lineColor: '#1565c0',
                lineWidth: 2,
                labels: {
                    style: { fontSize: '11px', color: '#333' },
                    formatter: function () {
                        const val = this.value;
                        // Safety check: filter out invalid values
                        if (!isFinite(val) || Math.abs(val) > 1e8) {
                            return '';
                        }
                        // Nếu giá trị là 0, hiển thị "0" thay vì "0.00"
                        if (Math.abs(val) < 0.0001) {
                            return '0';
                        }
                        // Format số lớn với dấu phẩy phân cách hàng nghìn
                        if (Math.abs(val) >= 1000) {
                            return val.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
                        }
                        // Format số >= 1: không có số thập phân
                        if (Math.abs(val) >= 1) {
                            return val.toFixed(0);
                        }
                        // Format số < 1: dùng số thập phân hợp lý
                        // Nếu >= 0.1: 1 chữ số thập phân
                        if (Math.abs(val) >= 0.1) {
                            return val.toFixed(1);
                        }
                        // Nếu >= 0.01: 2 chữ số thập phân
                        if (Math.abs(val) >= 0.01) {
                            return val.toFixed(2);
                        }
                        // Nếu < 0.01: dùng scientific notation hoặc 3 chữ số thập phân
                        return val.toFixed(3);
                    }
                }
            },
            series: series,
            legend: {
                enabled: true,
                align: 'right',
                verticalAlign: 'top',
                x: -10,
                y: 10,
                backgroundColor: 'rgba(255, 255, 255, 0.98)',
                borderColor: '#e0e7ff',
                borderWidth: 1,
                borderRadius: 8,
                shadow: {
                    color: 'rgba(0,0,0,0.05)',
                    offsetX: 0,
                    offsetY: 2,
                    opacity: 0.5,
                    width: 3
                },
                itemStyle: {
                    fontSize: '12px',
                    color: '#374151',
                    fontWeight: '500'
                },
                itemHoverStyle: {
                    color: '#1565c0'
                }
            },
            tooltip: {
                formatter: function () {
                    // this.x là T (Return Period) - giống backend
                    const T = this.x;
                    const p = 100 / T; // P = 100/T
                    return `P: ${p.toFixed(2)}% (T=${T.toFixed(1)} năm)<br>Q: ${this.y.toFixed(2)} ${headerUnit}`;
                }
            },
            plotOptions: {
                line: {
                    lineWidth: 2,
                    states: {
                        hover: {
                            lineWidth: 3
                        }
                    }
                },
                scatter: {
                    marker: {
                        states: {
                            hover: {
                                radius: 6
                            }
                        }
                    }
                },
            },
            credits: {
                enabled: false
            },
            accessibility: {
                enabled: false // Tắt accessibility warning
            }
        };
    }, [chartData, distributionName, headerTitle, headerUnit, fileInfo, settings, windowWidth]);

    // Early return
    if (isLoading || !chartData || !chartData.theoretical_curve || !chartData.empirical_points) {
        return (
            <div className="text-center py-5">
                <FontAwesomeIcon icon={faSpinner} className="loading-spinner me-3" />
                <p className="mt-3">{isLoading ? 'Đang tải biểu đồ...' : 'Không có dữ liệu'}</p>
            </div>
        );
    }

    if (!options) {
        return (
            <div className="text-center py-5">
                <p className="mt-3">Không có dữ liệu hợp lệ</p>
            </div>
        );
    }

    const hasWarnings = chartData.quality_warnings && chartData.quality_warnings.length > 0;
    const hasCriticalWarning = chartData.quality_warnings?.some(w => w.includes('NGHIÊM TRỌNG'));

    return (
        <div style={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center', // Căn giữa tất cả các phần tử con
            padding: windowWidth > 768 ? '10px 20px' : '8px 10px' // Giảm padding top để các phần tử gần nhau hơn
        }}>
            {hasWarnings && (
                <Alert
                    variant={hasCriticalWarning ? "danger" : "warning"}
                    className="mb-3"
                    style={{
                        maxWidth: '1400px',
                        width: '100%',
                        marginLeft: 'auto',
                        marginRight: 'auto'
                    }}
                >
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

            {/* Header Section - Professional Water Resources Engineering Style - Centered & Responsive */}
            <div style={{
                background: 'linear-gradient(135deg, #0d47a1 0%, #1565c0 100%)',
                borderRadius: '12px',
                padding: windowWidth > 768 ? '20px 32px' : '16px 24px', // Responsive padding - giảm padding
                marginBottom: '16px', // Giảm từ 32px xuống 16px
                marginTop: '10px', // Thêm margin-top nhỏ để có khoảng cách vừa phải
                marginLeft: 'auto',
                marginRight: 'auto',
                maxWidth: '1400px', // Cùng max-width với chart container
                width: '100%',
                boxShadow: '0 4px 12px rgba(13, 71, 161, 0.2)',
                color: '#ffffff'
            }}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '20px'
                }}>
                    <div style={{ flex: '1', minWidth: '250px' }}>
                        <h2 style={{
                            margin: 0,
                            fontSize: '28px',
                            fontWeight: '700',
                            color: '#ffffff',
                            letterSpacing: '0.5px',
                            marginBottom: '8px'
                        }}>
                            Biểu đồ tần suất
                        </h2>
                        {/* <p style={{
                            margin: 0,
                            fontSize: '14px',
                            color: 'rgba(255, 255, 255, 0.9)',
                            fontWeight: '400'
                        }}>
                            Phân tích tần suất theo chuẩn kỹ thuật tài nguyên nước
                        </p> */}
                    </div>
                    <div>
                        <Button
                            variant="light"
                            size="sm"
                            onClick={() => setShowConfigModal(true)}
                            style={{
                                borderRadius: '8px',
                                padding: '8px 16px',
                                fontWeight: '500',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                                border: 'none'
                            }}
                        >
                            <FontAwesomeIcon icon={faCog} className="me-2" />
                            Cấu hình
                        </Button>
                    </div>
                </div>
            </div>

            {/* Statistics Info Box - Modern Technical Style - Centered & Responsive */}
            {chartData.statistics && (
                <div style={{
                    background: 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
                    border: '1px solid #e0e7ff',
                    borderRadius: '12px',
                    padding: windowWidth > 768 ? '16px 24px' : '14px 20px', // Giảm padding
                    marginBottom: '16px', // Giảm từ 28px xuống 16px
                    marginLeft: 'auto',
                    marginRight: 'auto',
                    maxWidth: '1400px', // Cùng max-width với chart container
                    width: '100%',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                    borderLeft: '4px solid #1565c0'
                }}>
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        flexWrap: 'wrap',
                        gap: '20px'
                    }}>
                        <div style={{ flex: '1', minWidth: '200px' }}>
                            <div style={{
                                fontSize: '16px',
                                fontWeight: '700',
                                color: '#1565c0',
                                marginBottom: '16px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}>
                                <div style={{
                                    width: '4px',
                                    height: '20px',
                                    background: '#1565c0',
                                    borderRadius: '2px'
                                }}></div>
                                Phân bố {distributionName}
                            </div>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                                gap: '12px',
                                fontSize: '14px',
                                color: '#374151'
                            }}>
                                <div style={{
                                    background: '#f0f4ff',
                                    padding: '10px 14px',
                                    borderRadius: '8px',
                                    border: '1px solid #e0e7ff'
                                }}>
                                    <div style={{
                                        fontSize: '11px',
                                        color: '#6b7280',
                                        fontWeight: '600',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px',
                                        marginBottom: '4px'
                                    }}>
                                        Số mẫu
                                    </div>
                                    <div style={{
                                        fontSize: '18px',
                                        fontWeight: '700',
                                        color: '#1e40af'
                                    }}>
                                        {chartData.statistics.n}
                                    </div>
                                </div>
                                <div style={{
                                    background: '#f0f4ff',
                                    padding: '10px 14px',
                                    borderRadius: '8px',
                                    border: '1px solid #e0e7ff'
                                }}>
                                    <div style={{
                                        fontSize: '11px',
                                        color: '#6b7280',
                                        fontWeight: '600',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px',
                                        marginBottom: '4px'
                                    }}>
                                        Trung bình (TB)
                                    </div>
                                    <div style={{
                                        fontSize: '18px',
                                        fontWeight: '700',
                                        color: '#1e40af'
                                    }}>
                                        {chartData.statistics.mean.toFixed(2)} {headerUnit}
                                    </div>
                                </div>
                                <div style={{
                                    background: '#f0f4ff',
                                    padding: '10px 14px',
                                    borderRadius: '8px',
                                    border: '1px solid #e0e7ff'
                                }}>
                                    <div style={{
                                        fontSize: '11px',
                                        color: '#6b7280',
                                        fontWeight: '600',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px',
                                        marginBottom: '4px'
                                    }}>
                                        Hệ số biến động (Cv)
                                    </div>
                                    <div style={{
                                        fontSize: '18px',
                                        fontWeight: '700',
                                        color: '#1e40af'
                                    }}>
                                        {chartData.statistics.cv.toFixed(2)}
                                    </div>
                                </div>
                                <div style={{
                                    background: '#f0f4ff',
                                    padding: '10px 14px',
                                    borderRadius: '8px',
                                    border: '1px solid #e0e7ff'
                                }}>
                                    <div style={{
                                        fontSize: '11px',
                                        color: '#6b7280',
                                        fontWeight: '600',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px',
                                        marginBottom: '4px'
                                    }}>
                                        Hệ số bất đối xứng (Cs)
                                    </div>
                                    <div style={{
                                        fontSize: '18px',
                                        fontWeight: '700',
                                        color: '#1e40af'
                                    }}>
                                        {chartData.statistics.cs.toFixed(2)}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Chart Container - Professional Layout - Centered & Responsive */}
            <div
                style={{
                    opacity: fadeIn ? 1 : 0,
                    transition: fadeIn ? 'opacity 0.4s ease-in-out' : 'none',
                    width: '100%',
                    maxWidth: '1400px', // Max width để không quá rộng trên màn hình lớn
                    margin: '0 auto', // Căn giữa
                    marginTop: '0', // Đảm bảo không có margin-top thừa
                    padding: '0',
                    boxSizing: 'border-box',
                    background: '#ffffff',
                    borderRadius: '12px',
                    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center' // Căn giữa nội dung
                }}
            >
                {fadeIn && (
                    <div style={{
                        width: '100%',
                        maxWidth: '100%',
                        padding: windowWidth > 768 ? '24px' : '16px', // Responsive padding
                        background: '#fafbfc',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center'
                    }}>
                        <div style={{
                            width: '100%',
                            maxWidth: '100%',
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center'
                        }}>
                            <HighchartsReact
                                highcharts={Highcharts}
                                options={options}
                                containerProps={{
                                    style: {
                                        width: '100%',
                                        maxWidth: '100%',
                                        height: '100%',
                                        margin: '0 auto',
                                        display: 'block'
                                    }
                                }}
                                allowChartUpdate={true}
                                updateArgs={[true, true, false]}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Config Modal */}
            <FrequencyCurveConfigModal
                visible={showConfigModal}
                onOk={(newSettings) => {
                    setShowConfigModal(false);
                    // Settings đã được update trong context, component sẽ re-render
                }}
                onCancel={() => setShowConfigModal(false)}
            />
        </div>
    );
};

// Memoize component để tránh re-render không cần thiết
// Chỉ re-render khi props thực sự thay đổi
export default memo(HighchartsFrequencyChart, (prevProps, nextProps) => {
    // Chỉ re-render nếu endpoint hoặc dataUpdated thay đổi
    return prevProps.endpoint === nextProps.endpoint &&
        prevProps.dataUpdated === nextProps.dataUpdated;
});

