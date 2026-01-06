// ChartSettingsContext.js
// Context để quản lý các cài đặt cho frequency curve chart
import React, { createContext, useState, useEffect, useCallback } from 'react';
import { useSession } from './sessionContext';

// Default settings theo FFC 2008
const DEFAULT_SETTINGS = {
    method: 'auto',        // 'auto', 'mom', 'mle'
    lineStyle: 'solid',    // 'solid', 'dashed', 'dotted'
    lineWidth: 2          // 1-5
};

// Load settings từ localStorage
const loadSettings = () => {
    try {
        const saved = localStorage.getItem('frequencyChartSettings');
        if (saved) {
            const parsed = JSON.parse(saved);
            return { ...DEFAULT_SETTINGS, ...parsed };
        }
    } catch (error) {
        console.warn('Failed to load chart settings from localStorage:', error);
    }
    return DEFAULT_SETTINGS;
};

// Save settings to localStorage
const saveSettings = (settings) => {
    try {
        localStorage.setItem('frequencyChartSettings', JSON.stringify(settings));
    } catch (error) {
        console.warn('Failed to save chart settings to localStorage:', error);
    }
};

// Tạo Context
export const ChartSettingsContext = createContext();

// Provider để cung cấp Context cho các component con
export const ChartSettingsProvider = ({ children }) => {
    const { sessionData, updateChartSettings: updateSessionChartSettings } = useSession();
    
    // Initialize from session or localStorage
    const [settings, setSettings] = useState(() => {
        if (sessionData && sessionData.chartSettings) {
            return { ...DEFAULT_SETTINGS, ...sessionData.chartSettings };
        }
        return loadSettings();
    });

    // Sync with session when session data changes
    useEffect(() => {
        if (sessionData && sessionData.chartSettings) {
            const sessionSettings = { ...DEFAULT_SETTINGS, ...sessionData.chartSettings };
            // Only update if different to avoid infinite loop
            if (JSON.stringify(sessionSettings) !== JSON.stringify(settings)) {
                setSettings(sessionSettings);
            }
        }
    }, [sessionData?.chartSettings?.method, sessionData?.chartSettings?.lineStyle, sessionData?.chartSettings?.lineWidth]);

    // Update settings và persist
    const updateSettings = useCallback((newSettings) => {
        const updated = { ...settings, ...newSettings };
        setSettings(updated);
        saveSettings(updated);
        // Also update session
        updateSessionChartSettings(updated);
    }, [settings, updateSessionChartSettings]);

    // Reset về default
    const resetSettings = useCallback(() => {
        setSettings(DEFAULT_SETTINGS);
        saveSettings(DEFAULT_SETTINGS);
    }, []);

    // Get method description for display
    const getMethodDescription = useCallback((method) => {
        const descriptions = {
            'auto': 'Tự động (MOM cho Gumbel, MLE cho khác)',
            'mom': 'Phương pháp Moments (MOM)',
            'mle': 'Maximum Likelihood Estimation (MLE)'
        };
        return descriptions[method] || method;
    }, []);

    // Get line style description
    const getLineStyleDescription = useCallback((style) => {
        const descriptions = {
            'solid': 'Liền nét',
            'dashed': 'Nét đứt',
            'dotted': 'Nét chấm'
        };
        return descriptions[style] || style;
    }, []);

    return (
        <ChartSettingsContext.Provider value={{
            settings,
            updateSettings,
            resetSettings,
            getMethodDescription,
            getLineStyleDescription
        }}>
            {children}
        </ChartSettingsContext.Provider>
    );
};






