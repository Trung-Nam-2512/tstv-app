// ModelContext.js
import React, { createContext, useState, useRef, useCallback, useEffect } from 'react';

// Tạo Context
export const ModelContext = createContext();

// Provider để cung cấp Context cho các component con
export const ModelProvider = ({ children }) => {
    const [selectedModel, setSelectedModel] = useState('null');
    const [selectedValue, setSelectedValue] = useState('null');
    const [isTransitioning, setIsTransitioning] = useState(false);

    // Debounce timers
    const modelChangeTimer = useRef(null);
    const valueChangeTimer = useRef(null);
    const transitionResetTimer = useRef(null);

    // Cleanup all timers on unmount
    useEffect(() => {
        const modelTimer = modelChangeTimer.current;
        const valueTimer = valueChangeTimer.current;
        const transitionTimer = transitionResetTimer.current;

        return () => {
            if (modelTimer) clearTimeout(modelTimer);
            if (valueTimer) clearTimeout(valueTimer);
            if (transitionTimer) clearTimeout(transitionTimer);
        };
    }, []);

    // Simplified model change - instant but with transition state
    const handleModelChange = useCallback((model) => {
        // Ignore if same model
        if (model === selectedModel) return;

        // Clear all timers
        if (modelChangeTimer.current) {
            clearTimeout(modelChangeTimer.current);
        }
        if (transitionResetTimer.current) {
            clearTimeout(transitionResetTimer.current);
        }

        // Set transitioning immediately
        setIsTransitioning(true);

        // Small delay to show loading state before changing
        modelChangeTimer.current = setTimeout(() => {
            // Change model
            setSelectedModel(model);

            // Reset transitioning after animation completes
            transitionResetTimer.current = setTimeout(() => {
                setIsTransitioning(false);
            }, 500); // Match fade animation duration
        }, 100); // Small delay for smooth transition
    }, [selectedModel]);

    // Simplified value change
    const handleValueChange = useCallback((value) => {
        // Ignore if same value
        if (value === selectedValue) return;

        if (valueChangeTimer.current) {
            clearTimeout(valueChangeTimer.current);
        }
        if (transitionResetTimer.current) {
            clearTimeout(transitionResetTimer.current);
        }

        setIsTransitioning(true);

        // Small delay to show loading state
        valueChangeTimer.current = setTimeout(() => {
            setSelectedValue(value);

            transitionResetTimer.current = setTimeout(() => {
                setIsTransitioning(false);
            }, 500);
        }, 100);
    }, [selectedValue]);

    return (
        <ModelContext.Provider value={{
            selectedModel,
            handleModelChange,
            selectedValue,
            handleValueChange,
            isTransitioning
        }}>
            {children}
        </ModelContext.Provider>
    );
};
