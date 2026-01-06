import React, { createContext, useState, useContext, useCallback, useEffect } from 'react';

/**
 * AnalysisContext - Quản lý pre-computed results và cache
 * 
 * Dùng cho workflow:
 * 1. Rainfall Analysis: Pre-compute all models → cache → instant display
 * 2. Upload/Manual: Compute on-demand → cache từng model
 * 
 * QUAN TRỌNG: Cache được phân biệt bởi:
 * - analysisId: ID duy nhất cho mỗi phiên phân tích
 * - source: Nguồn dữ liệu ('rainfall_api' | 'upload' | 'manual')
 * - agg_func: Hàm tổng hợp ('max' | 'sum' | etc.)
 */

const AnalysisContext = createContext();

// Generate unique analysis ID
const generateAnalysisId = () => {
    return `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

export const useAnalysis = () => {
    const context = useContext(AnalysisContext);
    if (!context) {
        throw new Error('useAnalysis must be used within AnalysisProvider');
    }
    return context;
};

export const AnalysisProvider = ({ children }) => {
    // Cache results: { [distributionName]: frequency_curve_data }
    const [cachedResults, setCachedResults] = useState({});
    
    // Analysis ID - unique cho mỗi phiên phân tích
    const [analysisId, setAnalysisId] = useState(() => generateAnalysisId());
    
    // Cache metadata - QUAN TRỌNG: Dùng để validate cache
    const [cacheMetadata, setCacheMetadata] = useState({
        timestamp: null,
        source: null,  // 'rainfall_api' | 'upload' | 'manual'
        agg_func: null,
        analysisId: null,
        // Metadata bổ sung cho từng loại source
        locationInfo: null,  // { latitude, longitude } - cho rainfall_api
        fileName: null,      // Tên file - cho upload
        dataInfo: null       // Thông tin dữ liệu - cho manual
    });
    
    // Loading states
    const [isPrecomputing, setIsPrecomputing] = useState(false);
    const [precomputeProgress, setPrecomputeProgress] = useState({
        current: 0,
        total: 0,
        percentage: 0,
        currentModel: '',
        timing: {}
    });
    
    /**
     * Set cached results (từ pre-compute hoặc individual fetches)
     * 
     * @param {Object} results - Kết quả phân tích { [distributionName]: data }
     * @param {string} source - Nguồn dữ liệu: 'rainfall_api' | 'upload' | 'manual'
     * @param {string} agg_func - Hàm tổng hợp: 'max' | 'sum' | etc.
     * @param {Object} additionalMeta - Metadata bổ sung (locationInfo, fileName, dataInfo)
     */
    const setCacheResults = useCallback((results, source = 'unknown', agg_func = 'max', additionalMeta = {}) => {
        // Tạo analysisId mới mỗi khi set cache
        const newAnalysisId = generateAnalysisId();
        setAnalysisId(newAnalysisId);
        
        setCachedResults(results);
        
        const metadata = {
            timestamp: Date.now(),
            source,
            agg_func,
            analysisId: newAnalysisId,
            locationInfo: additionalMeta.locationInfo || null,
            fileName: additionalMeta.fileName || null,
            dataInfo: additionalMeta.dataInfo || null
        };
        
        setCacheMetadata(metadata);
        
        // Persist to localStorage (với expiry 1 hour)
        try {
            localStorage.setItem('analysis_cache', JSON.stringify({
                results,
                metadata
            }));
            
            // Dispatch event để các component khác biết có cache mới
            window.dispatchEvent(new CustomEvent('analysisCache Updated', { 
                detail: { analysisId: newAnalysisId, source, agg_func } 
            }));
            
            console.log(`[AnalysisContext] Cache updated: source=${source}, analysisId=${newAnalysisId}`);
        } catch (e) {
            console.warn('Failed to save to localStorage:', e);
        }
    }, []);
    
    /**
     * Get cached result for specific distribution
     * 
     * @param {string} distributionName - Tên phân phối (gumbel, lognorm, etc.)
     * @param {Object} options - Tùy chọn validate: { source, agg_func }
     * @returns {Object|null} - Dữ liệu cache hoặc null nếu không hợp lệ
     */
    const getCachedResult = useCallback((distributionName, options = {}) => {
        const { source: requiredSource, agg_func: requiredAggFunc } = options;
        
        // Validate in-memory cache với source và agg_func
        const validateCache = (results, metadata) => {
            // Kiểm tra source nếu được yêu cầu
            if (requiredSource && metadata.source !== requiredSource) {
                console.log(`[AnalysisContext] Cache source mismatch: ${metadata.source} !== ${requiredSource}`);
                return false;
            }
            
            // Kiểm tra agg_func nếu được yêu cầu
            if (requiredAggFunc && metadata.agg_func !== requiredAggFunc) {
                console.log(`[AnalysisContext] Cache agg_func mismatch: ${metadata.agg_func} !== ${requiredAggFunc}`);
                return false;
            }
            
            // Kiểm tra cache duration (1 hour)
            const CACHE_DURATION = 60 * 60 * 1000;
            if (Date.now() - metadata.timestamp > CACHE_DURATION) {
                console.log('[AnalysisContext] Cache expired');
                return false;
            }
            
            return true;
        };
        
        // Check in-memory cache first
        if (cachedResults[distributionName] && cacheMetadata.timestamp) {
            if (validateCache(cachedResults, cacheMetadata)) {
                return cachedResults[distributionName];
            }
        }
        
        // Check localStorage
        try {
            const cached = localStorage.getItem('analysis_cache');
            if (cached) {
                const { results, metadata } = JSON.parse(cached);
                
                if (validateCache(results, metadata)) {
                    // Update in-memory cache
                    setCachedResults(results);
                    setCacheMetadata(metadata);
                    setAnalysisId(metadata.analysisId);
                    
                    return results[distributionName] || null;
                }
            }
        } catch (e) {
            console.warn('Failed to read from localStorage:', e);
        }
        
        return null;
    }, [cachedResults, cacheMetadata]);
    
    /**
     * Clear cache và reset analysisId
     */
    const clearCache = useCallback(() => {
        console.log('[AnalysisContext] Cache cleared');
        
        setCachedResults({});
        setCacheMetadata({
            timestamp: null,
            source: null,
            agg_func: null,
            analysisId: null,
            locationInfo: null,
            fileName: null,
            dataInfo: null
        });
        
        // Tạo analysisId mới
        const newAnalysisId = generateAnalysisId();
        setAnalysisId(newAnalysisId);
        
        // Clear localStorage
        localStorage.removeItem('analysis_cache');
        
        // Clear tất cả sessionStorage cache liên quan đến chart data
        try {
            const keysToRemove = [];
            for (let i = 0; i < sessionStorage.length; i++) {
                const key = sessionStorage.key(i);
                if (key && key.startsWith('chart_data_')) {
                    keysToRemove.push(key);
                }
            }
            keysToRemove.forEach(key => sessionStorage.removeItem(key));
            console.log(`[AnalysisContext] Cleared ${keysToRemove.length} sessionStorage chart caches`);
        } catch (e) {
            console.warn('Failed to clear sessionStorage:', e);
        }
        
        // Dispatch event để các component khác biết cache đã bị clear
        window.dispatchEvent(new CustomEvent('analysisCacheCleared', { 
            detail: { newAnalysisId } 
        }));
    }, []);
    
    /**
     * Check if cache is valid (check both in-memory and localStorage)
     * 
     * @param {Object} options - Tùy chọn validate: { source, agg_func }
     * @returns {boolean} - true nếu cache hợp lệ
     */
    const isCacheValid = useCallback((options = {}) => {
        const { source: requiredSource, agg_func: requiredAggFunc } = options;
        const CACHE_DURATION = 60 * 60 * 1000; // 1 hour
        
        const validateMetadata = (metadata) => {
            // Kiểm tra timestamp
            if (!metadata.timestamp || Date.now() - metadata.timestamp > CACHE_DURATION) {
                return false;
            }
            
            // Kiểm tra source nếu được yêu cầu
            if (requiredSource && metadata.source !== requiredSource) {
                return false;
            }
            
            // Kiểm tra agg_func nếu được yêu cầu
            if (requiredAggFunc && metadata.agg_func !== requiredAggFunc) {
                return false;
            }
            
            return true;
        };
        
        // Check in-memory first
        if (cacheMetadata.timestamp && validateMetadata(cacheMetadata)) {
            return true;
        }
        
        // Check localStorage if in-memory not available
        try {
            const cached = localStorage.getItem('analysis_cache');
            if (cached) {
                const { metadata, results } = JSON.parse(cached);
                if (validateMetadata(metadata)) {
                    // Load into in-memory
                    setCachedResults(results);
                    setCacheMetadata(metadata);
                    setAnalysisId(metadata.analysisId);
                    return true;
                }
            }
        } catch (e) {
            // Ignore errors
        }
        
        return false;
    }, [cacheMetadata]);
    
    // Load cache from localStorage on mount
    useEffect(() => {
        try {
            const cached = localStorage.getItem('analysis_cache');
            if (cached) {
                const { results, metadata } = JSON.parse(cached);
                
                // Check if cache is still valid (1 hour)
                const CACHE_DURATION = 60 * 60 * 1000; // 1 hour
                if (Date.now() - metadata.timestamp < CACHE_DURATION) {
                    // Load into in-memory cache
                    setCachedResults(results);
                    setCacheMetadata(metadata);
                    // Restore analysisId nếu có
                    if (metadata.analysisId) {
                        setAnalysisId(metadata.analysisId);
                    }
                    console.log(`[AnalysisContext] Cache restored: source=${metadata.source}, analysisId=${metadata.analysisId}`);
                } else {
                    // Cache expired, clear it
                    localStorage.removeItem('analysis_cache');
                    console.log('[AnalysisContext] Cache expired on mount, cleared');
                }
            }
        } catch (e) {
            console.warn('Failed to load cache from localStorage:', e);
        }
    }, []);
    
    const value = {
        // Cache
        cachedResults,
        cacheMetadata,
        analysisId,
        setCacheResults,
        getCachedResult,
        clearCache,
        isCacheValid,
        
        // Pre-compute status
        isPrecomputing,
        setIsPrecomputing,
        precomputeProgress,
        setPrecomputeProgress,
        
        // Helper để lấy thông tin hiển thị về source
        getSourceDisplayInfo: useCallback(() => {
            if (!cacheMetadata.source) return null;
            
            const sourceLabels = {
                'rainfall_api': 'Dữ liệu mưa từ API',
                'upload': 'File tải lên',
                'manual': 'Nhập thủ công'
            };
            
            let description = sourceLabels[cacheMetadata.source] || 'Không xác định';
            
            // Thêm thông tin chi tiết
            if (cacheMetadata.source === 'rainfall_api' && cacheMetadata.locationInfo) {
                description += ` (Lat: ${cacheMetadata.locationInfo.latitude?.toFixed(4)}, Lng: ${cacheMetadata.locationInfo.longitude?.toFixed(4)})`;
            } else if (cacheMetadata.source === 'upload' && cacheMetadata.fileName) {
                description += `: ${cacheMetadata.fileName}`;
            }
            
            return {
                source: cacheMetadata.source,
                label: sourceLabels[cacheMetadata.source],
                description,
                timestamp: cacheMetadata.timestamp,
                agg_func: cacheMetadata.agg_func,
                analysisId: cacheMetadata.analysisId
            };
        }, [cacheMetadata])
    };
    
    return (
        <AnalysisContext.Provider value={value}>
            {children}
        </AnalysisContext.Provider>
    );
};







