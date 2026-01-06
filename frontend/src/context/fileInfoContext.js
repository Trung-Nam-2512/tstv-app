// fileInfoContext.js
import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';

const FileInfoContext = createContext();

// Provider context
export function FileInfoProvider({ children }) {
    // Initialize from sessionStorage or default
    const [fileInfo, setFileInfo] = useState(() => {
        try {
            const stored = sessionStorage.getItem('tstv_session_data');
            if (stored) {
                const parsed = JSON.parse(stored);
                if (parsed.fileInfo) {
                    return parsed.fileInfo;
                }
            }
        } catch (e) {
            // Ignore
        }
        return {
            dataType: "Unknown",
            unit: "Unknown",
            fileExtension: "",
            fileName: "",
            isValid: false,
        };
    });

    // Sync with sessionStorage when it changes (from SessionContext)
    useEffect(() => {
        const handleStorageChange = () => {
            try {
                const stored = sessionStorage.getItem('tstv_session_data');
                if (stored) {
                    const parsed = JSON.parse(stored);
                    if (parsed.fileInfo) {
                        setFileInfo(parsed.fileInfo);
                        console.log('[FileInfoContext] Synced from sessionStorage:', parsed.fileInfo);
                    }
                }
            } catch (e) {
                // Ignore
            }
        };

        // Listen for storage events (when SessionContext updates from another tab)
        window.addEventListener('storage', handleStorageChange);
        
        // Listen for custom event từ SessionContext (same-tab updates)
        const handleSessionDataUpdate = (event) => {
            try {
                const sessionData = event.detail;
                if (sessionData && sessionData.fileInfo) {
                    setFileInfo(sessionData.fileInfo);
                    console.log('[FileInfoContext] Synced from SessionContext event:', sessionData.fileInfo);
                }
            } catch (e) {
                // Ignore
            }
        };
        
        window.addEventListener('sessionDataUpdated', handleSessionDataUpdate);
        
        // Also check periodically (for same-tab updates - backup)
        const interval = setInterval(handleStorageChange, 1000);
        
        return () => {
            window.removeEventListener('storage', handleStorageChange);
            window.removeEventListener('sessionDataUpdated', handleSessionDataUpdate);
            clearInterval(interval);
        };
    }, []);

    const updateFileInfo = useCallback((newFileInfo) => {
        const updatedInfo = {
            ...fileInfo,
            ...newFileInfo
        };
        setFileInfo(updatedInfo);
        
        // Update sessionStorage directly (SessionContext will pick it up)
        try {
            const stored = sessionStorage.getItem('tstv_session_data');
            if (stored) {
                const parsed = JSON.parse(stored);
                parsed.fileInfo = updatedInfo;
                parsed.lastUpdated = Date.now();
                sessionStorage.setItem('tstv_session_data', JSON.stringify(parsed));
                
                // QUAN TRỌNG: Dispatch custom event để SessionContext và các component khác biết fileInfo đã thay đổi
                // Điều này đảm bảo sync ngay lập tức thay vì phải đợi interval check
                window.dispatchEvent(new CustomEvent('fileInfoUpdated', { 
                    detail: { fileInfo: updatedInfo } 
                }));
                
                console.log('[FileInfoContext] FileInfo updated:', updatedInfo);
            } else {
                // Nếu chưa có session data, tạo mới
                const newSessionData = {
                    fileInfo: updatedInfo,
                    unit: updatedInfo.unit || "mm",
                    nameColumn: '',
                    hasData: updatedInfo.isValid || false,
                    dataSource: null,
                    selectedModel: 'null',
                    selectedValue: 'null',
                    chartSettings: {
                        method: 'auto',
                        lineStyle: 'solid',
                        lineWidth: 2
                    },
                    activeSection: 'upload-file',
                    sidebarCollapsed: false,
                    lastUpdated: Date.now()
                };
                sessionStorage.setItem('tstv_session_data', JSON.stringify(newSessionData));
                
                // Dispatch event
                window.dispatchEvent(new CustomEvent('fileInfoUpdated', { 
                    detail: { fileInfo: updatedInfo } 
                }));
                
                console.log('[FileInfoContext] Created new session data with fileInfo:', updatedInfo);
            }
        } catch (e) {
            console.warn('[FileInfoContext] Failed to update sessionStorage:', e);
        }
    }, [fileInfo]);

    return (
        <FileInfoContext.Provider value={{ fileInfo, updateFileInfo }}>
            {children}
        </FileInfoContext.Provider>
    );
}
// Custom hook để lấy giá trị từ context
export function useFileInfo() {
    return useContext(FileInfoContext);
}
// FileInfoContext.js

export function parseFileName(fileName) {
    const parts = fileName.split("_"); // Tách chuỗi theo dấu "_"
    const fileExtension = fileName.split(".").pop().toLowerCase();
    if (parts.length < 2) {
        // Tên file không theo quy ước
        return {
            dataType: "Unknown",
            unit: "Unknown",
            fileExtension: fileExtension,
            isValid: false,
        };
    }

    let dataType = parts[0];
    let unit = parts[1];
    //Xử lý thêm nếu có nhiều _

    // Xóa các kí tự số và phần mở rộng của file, ví dụ : Rainfall_mm_2023.csv
    if (isNaN(parts[parts.length - 1])) { // Không phải là số thì là đơn vị
        unit = parts[parts.length - 1].split('.')[0]
    }

    return {
        dataType: dataType,
        unit: unit,
        fileExtension: fileExtension,
        isValid: true,
    };
}
