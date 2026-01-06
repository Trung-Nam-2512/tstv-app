import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

const UnitContext = createContext();

export const useUnit = () => useContext(UnitContext);

export const UnitProvider = ({ children }) => {
    // Initialize from sessionStorage or default
    const [unit, setUnit] = useState(() => {
        try {
            const stored = sessionStorage.getItem('tstv_session_data');
            if (stored) {
                const parsed = JSON.parse(stored);
                if (parsed.unit) {
                    return parsed.unit;
                }
            }
        } catch (e) {
            // Ignore
        }
        return "mm";
    });
    
    const [nameColumn, setNameColumn] = useState(() => {
        try {
            const stored = sessionStorage.getItem('tstv_session_data');
            if (stored) {
                const parsed = JSON.parse(stored);
                if (parsed.nameColumn !== undefined) {
                    return parsed.nameColumn;
                }
            }
        } catch (e) {
            // Ignore
        }
        return '';
    });

    // Sync with sessionStorage when it changes
    useEffect(() => {
        const handleStorageChange = () => {
            try {
                const stored = sessionStorage.getItem('tstv_session_data');
                if (stored) {
                    const parsed = JSON.parse(stored);
                    if (parsed.unit && parsed.unit !== unit) {
                        setUnit(parsed.unit);
                    }
                    if (parsed.nameColumn !== undefined && parsed.nameColumn !== nameColumn) {
                        setNameColumn(parsed.nameColumn);
                    }
                }
            } catch (e) {
                // Ignore
            }
        };

        window.addEventListener('storage', handleStorageChange);
        const interval = setInterval(handleStorageChange, 1000);
        
        return () => {
            window.removeEventListener('storage', handleStorageChange);
            clearInterval(interval);
        };
    }, [unit, nameColumn]);

    const handleSetUnit = useCallback((newUnit) => {
        setUnit(newUnit);
        // Update sessionStorage
        try {
            const stored = sessionStorage.getItem('tstv_session_data');
            if (stored) {
                const parsed = JSON.parse(stored);
                parsed.unit = newUnit;
                parsed.lastUpdated = Date.now();
                sessionStorage.setItem('tstv_session_data', JSON.stringify(parsed));
            }
        } catch (e) {
            // Ignore
        }
    }, []);

    const handleSetNameColumn = useCallback((newNameColumn) => {
        setNameColumn(newNameColumn);
        // Update sessionStorage
        try {
            const stored = sessionStorage.getItem('tstv_session_data');
            if (stored) {
                const parsed = JSON.parse(stored);
                parsed.nameColumn = newNameColumn;
                parsed.lastUpdated = Date.now();
                sessionStorage.setItem('tstv_session_data', JSON.stringify(parsed));
            }
        } catch (e) {
            // Ignore
        }
    }, []);

    return (
        <UnitContext.Provider value={{ 
            unit, 
            setUnit: handleSetUnit, 
            nameColumn, 
            setNameColumn: handleSetNameColumn 
        }}>
            {children}
        </UnitContext.Provider>
    );
};
