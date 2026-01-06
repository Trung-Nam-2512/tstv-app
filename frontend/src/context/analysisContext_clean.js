import React, { createContext, useState, useContext, useCallback, useEffect } from 'react';

/**
 * AnalysisContext - Quản lý pre-computed results và cache
 * 
 * Dùng cho workflow:
 * 1. Rainfall Analysis: Pre-compute all models → cache → instant display
 * 2. Upload/Manual: Compute on-demand → cache từng model
 */

const AnalysisContext = createContext();

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
    
    // Cache metadata
    const [cacheMetadata, setCacheMetadata] = useState({
        timestamp: null,
        source: null,  // 'rainfall_api' | 'upload' | 'manual'
        agg_func: null
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
     */
    const setCacheResults = useCallback((results, source = 'unknown', agg_func = 'max') => {
        setCachedResults(results);
        setCacheMetadata({
            timestamp: Date.now(),
            source,
            agg_func
        });
        
        // Persist to localStorage (với expiry 1 hour)
        try {
            localStorage.setItem('analysis_cache', JSON.stringify({
                results,
                metadata: {
                    timestamp: Date.now(),
                    source,
                    agg_func
                }
            }));
        } catch (e) {
            console.warn('Failed to save to localStorage:', e);
        }
    }, []);
    
    /**
     * Get cached result for specific distribution
     */
    const getCachedResult = useCallback((distributionName) => {
        // Check in-memory cache first
        if (cachedResults[distributionName]) {
            return cachedResults[distributionName];
        }
        
        // Check localStorage
        try {
            const cached = localStorage.getItem('analysis_cache');
            if (cached) {
                const { results, metadata } = JSON.parse(cached);
                
                // Check if cache is still valid (1 hour)
                const CACHE_DURATION = 60 * 60 * 1000; // 1 hour
                if (Date.now() - metadata.timestamp < CACHE_DURATION) {
                    // Update in-memory cache
                    setCachedResults(results);
                    setCacheMetadata(metadata);
                    
                    return results[distributionName] || null;
                }
            }
        } catch (e) {
            console.warn('Failed to read from localStorage:', e);
        }
        
        return null;
    }, [cachedResults]);
    
    /**
     * Clear cache
     */
    const clearCache = useCallback(() => {
        setCachedResults({});
        setCacheMetadata({
            timestamp: null,
            source: null,
            agg_func: null
        });
        localStorage.removeItem('analysis_cache');
    }, []);
    
    /**
     * Check if cache is valid (check both in-memory and localStorage)
     */
    const isCacheValid = useCallback(() => {
        // Check in-memory first
        if (cacheMetadata.timestamp) {
            const CACHE_DURATION = 60 * 60 * 1000; // 1 hour
            if (Date.now() - cacheMetadata.timestamp < CACHE_DURATION) {
                return true;
            }
        }
        
        // Check localStorage if in-memory not available
        try {
            const cached = localStorage.getItem('analysis_cache');
            if (cached) {
                const { metadata } = JSON.parse(cached);
                const CACHE_DURATION = 60 * 60 * 1000; // 1 hour
                if (Date.now() - metadata.timestamp < CACHE_DURATION) {
                    // Load into in-memory
                    const { results } = JSON.parse(cached);
                    setCachedResults(results);
                    setCacheMetadata(metadata);
                    return true;
                }
            }
        } catch (e) {
            // Ignore errors
        }
        
        return false;
    }, [cacheMetadata.timestamp]);
    
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
                } else {
                    // Cache expired, clear it
                    localStorage.removeItem('analysis_cache');
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
        setCacheResults,
        getCachedResult,
        clearCache,
        isCacheValid,
        
        // Pre-compute status
        isPrecomputing,
        setIsPrecomputing,
        precomputeProgress,
        setPrecomputeProgress
    };
    
    return (
        <AnalysisContext.Provider value={value}>
            {children}
        </AnalysisContext.Provider>
    );
};
