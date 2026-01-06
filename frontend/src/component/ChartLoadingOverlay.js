import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner } from '@fortawesome/free-solid-svg-icons';
import './ChartLoadingOverlay.css';

const ChartLoadingOverlay = ({ isLoading, message = "Đang tải biểu đồ..." }) => {
    if (!isLoading) return null;

    return (
        <div className="chart-loading-overlay">
            <div className="chart-loading-content">
                <div className="chart-loading-spinner">
                    <FontAwesomeIcon icon={faSpinner} spin size="2x" />
                </div>
                <p className="chart-loading-message">{message}</p>
                <div className="chart-loading-pulse"></div>
            </div>
        </div>
    );
};

export default ChartLoadingOverlay;








