import React, { createContext, useState, useContext, useCallback, useEffect } from 'react';

/**
 * SessionContext - Quản lý session state và persist data
 * 
 * Mục đích:
 * - Lưu toàn bộ state của mỗi phiên phân tích
 * - Tránh mất data khi chuyển tab hoặc đóng/mở sidebar
 * - Đảm bảo tính đồng bộ cho từng phiên
 * - Restore state khi quay lại tab
 */

const SessionContext = createContext();

export const useSession = () => {
    const context = useContext(SessionContext);
    if (!context) {
        throw new Error('useSession must be used within SessionProvider');
    }
    return context;
};

// Session storage keys
const SESSION_STORAGE_KEY = 'tstv_session_data';
const SESSION_ID_KEY = 'tstv_session_id';
const SESSION_TIMESTAMP_KEY = 'tstv_session_timestamp';

// Session expiry: 24 hours
const SESSION_EXPIRY = 24 * 60 * 60 * 1000;

export const SessionProvider = ({ children }) => {
    // Generate or retrieve session ID
    const getSessionId = useCallback(() => {
        let sessionId = sessionStorage.getItem(SESSION_ID_KEY);
        if (!sessionId) {
            sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            sessionStorage.setItem(SESSION_ID_KEY, sessionId);
            sessionStorage.setItem(SESSION_TIMESTAMP_KEY, Date.now().toString());
        }
        return sessionId;
    }, []);

    const [sessionId] = useState(() => getSessionId());
    
    // Session state
    const [sessionData, setSessionData] = useState({
        // File info
        fileInfo: {
            dataType: "Unknown",
            unit: "Unknown",
            fileExtension: "",
            fileName: "",
            isValid: false,
        },
        
        // Unit info
        unit: "mm",
        nameColumn: '',
        
        // Analysis data
        hasData: false,
        dataSource: null, // 'upload' | 'manual' | 'rainfall_api'
        
        // Chart state
        selectedModel: 'null',
        selectedValue: 'null',
        chartSettings: {
            method: 'auto',
            lineStyle: 'solid',
            lineWidth: 2
        },
        
        // UI state
        activeSection: 'tai-len-file',
        sidebarCollapsed: false,
        
        // Timestamp
        lastUpdated: Date.now()
    });

    // Load session data from sessionStorage on mount
    useEffect(() => {
        try {
            const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                
                // Check if session is still valid (not expired)
                const timestamp = sessionStorage.getItem(SESSION_TIMESTAMP_KEY);
                if (timestamp && Date.now() - parseInt(timestamp) < SESSION_EXPIRY) {
                    setSessionData(parsed);
                } else {
                    // Session expired, clear it
                    clearSession();
                }
            }
        } catch (e) {
            console.warn('[Session] Failed to load session data:', e);
        }
        
        // QUAN TRỌNG: Listen for fileInfo updates từ FileInfoContext
        const handleFileInfoUpdate = (event) => {
            try {
                const { fileInfo } = event.detail;
                if (fileInfo) {
                    setSessionData(prev => ({
                        ...prev,
                        fileInfo: {
                            ...prev.fileInfo,
                            ...fileInfo
                        },
                        hasData: fileInfo.isValid || prev.hasData,
                        lastUpdated: Date.now()
                    }));
                    console.log('[Session] FileInfo synced from FileInfoContext:', fileInfo);
                }
            } catch (e) {
                console.warn('[Session] Failed to sync fileInfo:', e);
            }
        };
        
        window.addEventListener('fileInfoUpdated', handleFileInfoUpdate);
        
        return () => {
            window.removeEventListener('fileInfoUpdated', handleFileInfoUpdate);
        };
    }, []);

    // Save session data to sessionStorage whenever it changes
    useEffect(() => {
        try {
            const dataToSave = {
                ...sessionData,
                lastUpdated: Date.now()
            };
            sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(dataToSave));
            sessionStorage.setItem(SESSION_TIMESTAMP_KEY, Date.now().toString());
            
            // Trigger custom event for other contexts to sync
            window.dispatchEvent(new CustomEvent('sessionDataUpdated', { detail: dataToSave }));
        } catch (e) {
            console.warn('[Session] Failed to save session data:', e);
        }
    }, [sessionData]);

    /**
     * Update file info in session
     */
    const updateFileInfo = useCallback((fileInfo) => {
        setSessionData(prev => ({
            ...prev,
            fileInfo: {
                ...prev.fileInfo,
                ...fileInfo
            },
            hasData: fileInfo.isValid || prev.hasData,
            lastUpdated: Date.now()
        }));
    }, []);

    /**
     * Update unit info in session
     */
    const updateUnitInfo = useCallback((unit, nameColumn) => {
        setSessionData(prev => ({
            ...prev,
            unit: unit || prev.unit,
            nameColumn: nameColumn !== undefined ? nameColumn : prev.nameColumn,
            lastUpdated: Date.now()
        }));
    }, []);

    /**
     * Set data source
     */
    const setDataSource = useCallback((source) => {
        setSessionData(prev => ({
            ...prev,
            dataSource: source,
            hasData: true,
            lastUpdated: Date.now()
        }));
    }, []);

    /**
     * Update selected model and value
     */
    const updateSelectedModel = useCallback((model, value) => {
        setSessionData(prev => ({
            ...prev,
            selectedModel: model || prev.selectedModel,
            selectedValue: value !== undefined ? value : prev.selectedValue,
            lastUpdated: Date.now()
        }));
    }, []);

    /**
     * Update chart settings
     */
    const updateChartSettings = useCallback((settings) => {
        setSessionData(prev => ({
            ...prev,
            chartSettings: {
                ...prev.chartSettings,
                ...settings
            },
            lastUpdated: Date.now()
        }));
    }, []);

    /**
     * Update active section
     */
    const updateActiveSection = useCallback((section) => {
        setSessionData(prev => ({
            ...prev,
            activeSection: section,
            lastUpdated: Date.now()
        }));
    }, []);

    /**
     * Update sidebar state
     */
    const updateSidebarState = useCallback((collapsed) => {
        setSessionData(prev => ({
            ...prev,
            sidebarCollapsed: collapsed,
            lastUpdated: Date.now()
        }));
    }, []);

    /**
     * Clear session (when user uploads new file or starts new analysis)
     */
    const clearSession = useCallback(() => {
        const defaultData = {
            fileInfo: {
                dataType: "Unknown",
                unit: "Unknown",
                fileExtension: "",
                fileName: "",
                isValid: false,
            },
            unit: "mm",
            nameColumn: '',
            hasData: false,
            dataSource: null,
            selectedModel: 'null',
            selectedValue: 'null',
            chartSettings: {
                method: 'auto',
                lineStyle: 'solid',
                lineWidth: 2
            },
            activeSection: 'tai-len-file',
            sidebarCollapsed: false,
            lastUpdated: Date.now()
        };
        
        setSessionData(defaultData);
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
        sessionStorage.removeItem(SESSION_ID_KEY);
        sessionStorage.removeItem(SESSION_TIMESTAMP_KEY);
        
        // Generate new session ID
        getSessionId();
    }, [getSessionId]);

    /**
     * Check if session has valid data
     */
    const hasValidData = useCallback(() => {
        return sessionData.hasData && sessionData.dataSource !== null;
    }, [sessionData.hasData, sessionData.dataSource]);

    const value = {
        // Session info
        sessionId,
        sessionData,
        
        // Update methods
        updateFileInfo,
        updateUnitInfo,
        setDataSource,
        updateSelectedModel,
        updateChartSettings,
        updateActiveSection,
        updateSidebarState,
        
        // Utility methods
        clearSession,
        hasValidData
    };

    return (
        <SessionContext.Provider value={value}>
            {children}
        </SessionContext.Provider>
    );
};

