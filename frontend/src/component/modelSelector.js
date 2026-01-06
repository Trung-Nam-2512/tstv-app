import React, { useContext } from 'react';
import { ModelContext } from '../context/selectedModelContext'; // Import ModelContext
import { useAnalysis } from '../context/analysisContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCloud, faUpload, faKeyboard, faInfoCircle } from '@fortawesome/free-solid-svg-icons';

const ModelSelector = () => {
    const { selectedModel, handleModelChange, selectedValue, handleValueChange, isTransitioning } = useContext(ModelContext);
    const { getSourceDisplayInfo, cacheMetadata } = useAnalysis();

    // Mảng các mô hình dưới dạng đối tượng: { display: hiển thị, value: giá trị thực }
    const models = [
        { display: 'Chọn mô hình', value: '' },
        { display: 'Gumbel', value: 'gumbel' },
        { display: 'Lognormal', value: 'lognorm' },
        { display: 'Gamma', value: 'gamma' },
        { display: 'Logistic', value: 'logistic' },
        { display: 'Exponential', value: 'expon' },
        { display: 'Generalized Extreme Value', value: 'genextreme' },
        { display: 'Generalized Pareto', value: 'genpareto' },
        { display: 'Pearson3', value: 'pearson3' },
        { display: 'Frechet', value: 'frechet' }
    ];

    const values = [
        { display: 'Chọn giá trị', value: '' },
        { display: 'Min', value: 'min' },
        { display: 'Max', value: 'max' },
        { display: 'Mean', value: 'mean' },
        { display: 'Sum', value: 'sum' }
    ];

    // Lấy thông tin nguồn dữ liệu từ cache
    const sourceInfo = getSourceDisplayInfo();
    
    // Icon và màu sắc theo nguồn dữ liệu
    const getSourceStyle = () => {
        if (!sourceInfo) return { icon: faInfoCircle, color: '#6c757d', bg: '#f8f9fa' };
        
        switch (sourceInfo.source) {
            case 'rainfall_api':
                return { icon: faCloud, color: '#0d6efd', bg: '#e7f1ff' };
            case 'upload':
                return { icon: faUpload, color: '#198754', bg: '#d1e7dd' };
            case 'manual':
                return { icon: faKeyboard, color: '#6f42c1', bg: '#e2d9f3' };
            default:
                return { icon: faInfoCircle, color: '#6c757d', bg: '#f8f9fa' };
        }
    };
    
    const sourceStyle = getSourceStyle();

    return (
        <div className="col-md-10 container-select-option" style={{ padding: '30px 0', margin: '0 auto' }}>
            {/* Hiển thị thông tin nguồn dữ liệu */}
            {sourceInfo && (
                <div style={{ 
                    marginBottom: '20px',
                    padding: '12px 20px',
                    background: sourceStyle.bg,
                    borderRadius: '8px',
                    border: `1px solid ${sourceStyle.color}20`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    marginLeft: '100px',
                    marginRight: '100px'
                }}>
                    <FontAwesomeIcon 
                        icon={sourceStyle.icon} 
                        style={{ 
                            fontSize: '24px', 
                            color: sourceStyle.color 
                        }} 
                    />
                    <div>
                        <div style={{ 
                            fontWeight: '600', 
                            color: sourceStyle.color,
                            fontSize: '14px' 
                        }}>
                            {sourceInfo.label}
                        </div>
                        <div style={{ 
                            fontSize: '12px', 
                            color: '#6c757d',
                            marginTop: '2px'
                        }}>
                            {sourceInfo.source === 'rainfall_api' && cacheMetadata.locationInfo && (
                                <>Vị trí: {cacheMetadata.locationInfo.latitude?.toFixed(4)}, {cacheMetadata.locationInfo.longitude?.toFixed(4)}</>
                            )}
                            {sourceInfo.source === 'upload' && cacheMetadata.fileName && (
                                <>File: {cacheMetadata.fileName}</>
                            )}
                            {sourceInfo.source === 'manual' && (
                                <>Dữ liệu được nhập trực tiếp</>
                            )}
                            {' • '}
                            Hàm tổng hợp: <strong>{sourceInfo.agg_func?.toUpperCase()}</strong>
                        </div>
                    </div>
                </div>
            )}
            
            <label htmlFor="modelSelect" style={{ fontWeight: 'bold', marginRight: '10px', fontSize: '24px', marginLeft: '100px' }}>
                Chọn mô hình:
            </label>
            <select 
                id="modelSelect" 
                value={selectedModel} 
                onChange={(e) => handleModelChange(e.target.value)}
                disabled={isTransitioning}
                style={{
                    cursor: isTransitioning ? 'wait' : 'pointer',
                    opacity: isTransitioning ? 0.6 : 1,
                    transition: 'opacity 0.2s ease'
                }}
            >
                {models.map((model) => (
                    <option key={model.value} value={model.value}>
                        {model.display}
                    </option>
                ))}
            </select>
            <label htmlFor="valueSelect" style={{ fontWeight: 'bold', marginRight: '10px', fontSize: '24px', marginLeft: '100px' }}>
                Chọn giá trị:
            </label>
            <select 
                id="valueSelect" 
                value={selectedValue} 
                onChange={(e) => handleValueChange(e.target.value)}
                disabled={isTransitioning}
                style={{
                    cursor: isTransitioning ? 'wait' : 'pointer',
                    opacity: isTransitioning ? 0.6 : 1,
                    transition: 'opacity 0.2s ease'
                }}
            >
                {values.map((item) => (
                    <option key={item.value} value={item.value}>
                        {item.display}
                    </option>
                ))}
            </select>
        </div>
    );
};

export default ModelSelector;
