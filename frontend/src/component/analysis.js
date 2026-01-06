import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import Config from '../config/config';
import { ModelContext } from '../context/selectedModelContext';
import { Card, Row, Col, Badge, Alert, ProgressBar } from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChartBar, faSpinner, faCheckCircle, faExclamationTriangle } from '@fortawesome/free-solid-svg-icons';
import '../assets/analysis.css';

function Analysis({ dataUpdated, fetch }) {
    const [analysis, setAnalysis] = useState({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const { selectedValue } = useContext(ModelContext);

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await axios
                .get(`${Config.BASE_URL}/analysis/distribution?agg_func=${selectedValue}`);
            setAnalysis(response.data);
        } catch (err) {
            console.error("Error fetching distribution analysis: ", err);
            if (err.response && err.response.status === 404) {
                const errorDetail = err.response.data?.detail || err.response.data?.message || '';
                if (errorDetail.includes('Dữ liệu chưa được tải') || errorDetail.includes('chưa được tải')) {
                    // Không set error, để hiển thị empty state thay vì lỗi
                    setAnalysis({});
                } else {
                    setError({ message: 'Không tìm thấy dữ liệu phân tích' });
                }
            } else if (err.response && err.response.status === 400) {
                const errorDetail = err.response.data?.detail || err.response.data?.message || '';
                setError({ message: errorDetail || 'Dữ liệu không hợp lệ' });
            } else {
                setError({
                    message: err.response?.data?.detail || err.response?.data?.message || err.message || 'Không thể tải dữ liệu phân tích'
                });
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (dataUpdated != null && fetch && selectedValue !== 'null') {
            fetchData();
        }
    }, [dataUpdated, fetch, selectedValue]);

    if (loading) {
        return (
            <div className="text-center py-5">
                <FontAwesomeIcon icon={faSpinner} className="loading-spinner me-3" />
                <p className="mt-3">Chờ nạp dữ liệu phân tích...</p>
            </div>
        );
    }

    if (error) {
        return (
            <Alert variant="warning" className="text-center">
                <FontAwesomeIcon icon={faExclamationTriangle} className="me-2" />
                <strong>Thông báo:</strong> {error.message}
            </Alert>
        );
    }

    const getQualityScore = (aic, pValue) => {
        if (!aic || pValue === null || pValue === undefined) {
            return {
                score: 0,
                label: 'Không đủ dữ liệu',
                color: '#6c757d',
                bgColor: '#f8f9fa',
                borderColor: '#dee2e6'
            };
        }

        // Tính điểm dựa trên AIC và p-value
        let score = 0;
        if (aic < 10) score += 40;
        else if (aic < 20) score += 30;
        else if (aic < 30) score += 20;
        else score += 10;

        if (pValue > 0.05) score += 60;
        else if (pValue > 0.01) score += 40;
        else if (pValue > 0.001) score += 20;
        else score += 10;

        if (score >= 80) {
            return {
                score,
                label: 'Tốt',
                color: '#0d9488',
                bgColor: '#ecfdf5',
                borderColor: '#6ee7b7'
            };
        }
        if (score >= 60) {
            return {
                score,
                label: 'Khá',
                color: '#0284c7',
                bgColor: '#f0f9ff',
                borderColor: '#7dd3fc'
            };
        }
        if (score >= 40) {
            return {
                score,
                label: 'Trung bình',
                color: '#f59e0b',
                bgColor: '#fffbeb',
                borderColor: '#fcd34d'
            };
        }
        return {
            score,
            label: 'Kém',
            color: '#dc2626',
            bgColor: '#fef2f2',
            borderColor: '#fca5a5'
        };
    };
    return (
        <div className="analysis fade-in" style={{ marginTop: '50px', padding: '0 20px' }}>
            {/* Header Section - Professional Style */}
            <div style={{
                marginBottom: '40px',
                paddingBottom: '20px',
                borderBottom: '2px solid #e5e7eb'
            }}>
                <h2 style={{
                    fontSize: '28px',
                    fontWeight: '700',
                    color: '#0d47a1',
                    marginBottom: '8px',
                    letterSpacing: '0.3px'
                }}>
                    Chỉ số phân phối xác suất
                </h2>
                <p style={{
                    fontSize: '14px',
                    color: '#6b7280',
                    margin: 0,
                    fontWeight: '400'
                }}>
                    Phân tích chất lượng mô hình phân phối
                </p>
            </div>

            {analysis && Object.keys(analysis).length > 0 ? (
                <Row className="g-4">
                    {Object.keys(analysis).map((model) => {
                        const modelData = analysis[model];
                        const quality = getQualityScore(modelData.AIC, modelData.p_value);

                        return (
                            <Col key={model} xs={12} md={6} lg={4}>
                                <Card style={{
                                    border: '1px solid #e5e7eb',
                                    borderRadius: '12px',
                                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                                    transition: 'all 0.2s ease',
                                    height: '100%',
                                    overflow: 'hidden'
                                }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
                                        e.currentTarget.style.transform = 'translateY(-2px)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)';
                                        e.currentTarget.style.transform = 'translateY(0)';
                                    }}>
                                    {/* Card Header - Clean Professional Style */}
                                    <Card.Header style={{
                                        background: '#f8fafc',
                                        borderBottom: '1px solid #e5e7eb',
                                        padding: '16px 20px'
                                    }}>
                                        <div style={{
                                            fontSize: '14px',
                                            fontWeight: '600',
                                            color: '#1e40af',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.5px'
                                        }}>
                                            {model.toUpperCase()}
                                        </div>
                                    </Card.Header>

                                    <Card.Body style={{ padding: '20px' }}>
                                        {/* Metrics Section */}
                                        <div style={{ marginBottom: '20px' }}>
                                            <div style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                padding: '12px 0',
                                                borderBottom: '1px solid #f3f4f6'
                                            }}>
                                                <div style={{
                                                    fontSize: '13px',
                                                    fontWeight: '500',
                                                    color: '#6b7280',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '8px'
                                                }}>
                                                    <span style={{
                                                        width: '6px',
                                                        height: '6px',
                                                        borderRadius: '50%',
                                                        background: '#3b82f6'
                                                    }}></span>
                                                    AIC Score
                                                </div>
                                                <div style={{
                                                    fontSize: '16px',
                                                    fontWeight: '600',
                                                    color: '#1e40af'
                                                }}>
                                                    {modelData.AIC ? modelData.AIC.toFixed(2) : 'N/A'}
                                                </div>
                                            </div>

                                            <div style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                padding: '12px 0',
                                                borderBottom: '1px solid #f3f4f6'
                                            }}>
                                                <div style={{
                                                    fontSize: '13px',
                                                    fontWeight: '500',
                                                    color: '#6b7280',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '8px'
                                                }}>
                                                    <span style={{
                                                        width: '6px',
                                                        height: '6px',
                                                        borderRadius: '50%',
                                                        background: '#10b981'
                                                    }}></span>
                                                    Chi-Square
                                                </div>
                                                <div style={{
                                                    fontSize: '16px',
                                                    fontWeight: '600',
                                                    color: '#059669'
                                                }}>
                                                    {modelData.ChiSquare ? modelData.ChiSquare.toFixed(2) : 'N/A'}
                                                </div>
                                            </div>

                                            <div style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                padding: '12px 0'
                                            }}>
                                                <div style={{
                                                    fontSize: '13px',
                                                    fontWeight: '500',
                                                    color: '#6b7280',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '8px'
                                                }}>
                                                    <span style={{
                                                        width: '6px',
                                                        height: '6px',
                                                        borderRadius: '50%',
                                                        background: '#ef4444'
                                                    }}></span>
                                                    p-value
                                                </div>
                                                <div style={{
                                                    fontSize: '16px',
                                                    fontWeight: '600',
                                                    color: '#dc2626'
                                                }}>
                                                    {modelData.p_value !== null && modelData.p_value !== undefined
                                                        ? modelData.p_value.toFixed(4)
                                                        : 'N/A'}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Quality Assessment - Clean Style */}
                                        <div style={{
                                            marginTop: '20px',
                                            paddingTop: '20px',
                                            borderTop: '2px solid #e5e7eb'
                                        }}>
                                            <div style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                marginBottom: '12px'
                                            }}>
                                                <span style={{
                                                    fontSize: '13px',
                                                    fontWeight: '600',
                                                    color: '#374151'
                                                }}>
                                                    Chất lượng mô hình
                                                </span>
                                                <span style={{
                                                    fontSize: '13px',
                                                    fontWeight: '600',
                                                    padding: '6px 12px',
                                                    borderRadius: '6px',
                                                    color: quality.color,
                                                    backgroundColor: quality.bgColor,
                                                    border: `1px solid ${quality.borderColor}`
                                                }}>
                                                    {quality.label}
                                                </span>
                                            </div>
                                            <div style={{
                                                width: '100%',
                                                height: '8px',
                                                backgroundColor: '#f3f4f6',
                                                borderRadius: '4px',
                                                overflow: 'hidden'
                                            }}>
                                                <div style={{
                                                    width: `${quality.score}%`,
                                                    height: '100%',
                                                    backgroundColor: quality.color,
                                                    transition: 'width 0.3s ease',
                                                    borderRadius: '4px'
                                                }}></div>
                                            </div>
                                            <div style={{
                                                fontSize: '11px',
                                                color: '#9ca3af',
                                                marginTop: '6px',
                                                textAlign: 'right'
                                            }}>
                                                {quality.score}%
                                            </div>
                                        </div>
                                    </Card.Body>
                                </Card>
                            </Col>
                        );
                    })}
                </Row>
            ) : (
                <div className="text-center py-5">
                    <div className="empty-state">
                        <FontAwesomeIcon icon={faChartBar} className="empty-icon" style={{ color: '#d1d5db' }} />
                        <p className="mt-3 text-muted">Chờ nạp dữ liệu để phân tích...</p>
                    </div>
                </div>
            )}

            {/* Parameters Section - Professional Style */}
            <div style={{ marginTop: '60px', paddingTop: '40px', borderTop: '2px solid #e5e7eb' }}>
                <div style={{
                    marginBottom: '32px',
                    paddingBottom: '16px',
                    borderBottom: '1px solid #e5e7eb'
                }}>
                    <h3 style={{
                        fontSize: '24px',
                        fontWeight: '700',
                        color: '#0d47a1',
                        margin: 0,
                        letterSpacing: '0.3px'
                    }}>
                        Giá trị tham số phân phối
                    </h3>
                    <p style={{
                        fontSize: '14px',
                        color: '#6b7280',
                        margin: '8px 0 0 0',
                        fontWeight: '400'
                    }}>
                        Các tham số ước lượng của từng mô hình phân phối
                    </p>
                </div>

                <Row className="g-4">
                    {analysis && Object.keys(analysis).length > 0 ? (
                        Object.keys(analysis).map((model) => (
                            analysis[model].params && (
                                <Col key={model} xs={12} md={6} lg={4}>
                                    <Card style={{
                                        border: '1px solid #e5e7eb',
                                        borderRadius: '12px',
                                        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                                        transition: 'all 0.2s ease',
                                        height: '100%',
                                        overflow: 'hidden'
                                    }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
                                            e.currentTarget.style.transform = 'translateY(-2px)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)';
                                            e.currentTarget.style.transform = 'translateY(0)';
                                        }}>
                                        <Card.Header style={{
                                            background: '#f8fafc',
                                            borderBottom: '1px solid #e5e7eb',
                                            padding: '16px 20px'
                                        }}>
                                            <div style={{
                                                fontSize: '14px',
                                                fontWeight: '600',
                                                color: '#1e40af',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.5px'
                                            }}>
                                                {model.toUpperCase()} Parameters
                                            </div>
                                        </Card.Header>
                                        <Card.Body style={{ padding: '20px' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                <div style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    padding: '12px',
                                                    background: '#f9fafb',
                                                    borderRadius: '8px',
                                                    border: '1px solid #e5e7eb'
                                                }}>
                                                    <span style={{
                                                        fontSize: '13px',
                                                        fontWeight: '500',
                                                        color: '#6b7280'
                                                    }}>
                                                        Shape
                                                    </span>
                                                    <span style={{
                                                        fontSize: '15px',
                                                        fontWeight: '600',
                                                        color: '#1f2937',
                                                        fontFamily: 'monospace'
                                                    }}>
                                                        {analysis[model].params.shape === null
                                                            ? 'None'
                                                            : analysis[model].params.shape !== undefined
                                                                ? analysis[model].params.shape.toFixed(3)
                                                                : 'N/A'}
                                                    </span>
                                                </div>
                                                <div style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    padding: '12px',
                                                    background: '#f9fafb',
                                                    borderRadius: '8px',
                                                    border: '1px solid #e5e7eb'
                                                }}>
                                                    <span style={{
                                                        fontSize: '13px',
                                                        fontWeight: '500',
                                                        color: '#6b7280'
                                                    }}>
                                                        Location
                                                    </span>
                                                    <span style={{
                                                        fontSize: '15px',
                                                        fontWeight: '600',
                                                        color: '#1f2937',
                                                        fontFamily: 'monospace'
                                                    }}>
                                                        {analysis[model].params.loc ? analysis[model].params.loc.toFixed(3) : 'N/A'}
                                                    </span>
                                                </div>
                                                <div style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    padding: '12px',
                                                    background: '#f9fafb',
                                                    borderRadius: '8px',
                                                    border: '1px solid #e5e7eb'
                                                }}>
                                                    <span style={{
                                                        fontSize: '13px',
                                                        fontWeight: '500',
                                                        color: '#6b7280'
                                                    }}>
                                                        Scale
                                                    </span>
                                                    <span style={{
                                                        fontSize: '15px',
                                                        fontWeight: '600',
                                                        color: '#1f2937',
                                                        fontFamily: 'monospace'
                                                    }}>
                                                        {analysis[model].params.scale ? analysis[model].params.scale.toFixed(3) : 'N/A'}
                                                    </span>
                                                </div>
                                            </div>
                                        </Card.Body>
                                    </Card>
                                </Col>
                            )
                        ))
                    ) : (
                        <div className="text-center py-5">
                            <div className="empty-state">
                                <FontAwesomeIcon icon={faChartBar} className="empty-icon" style={{ color: '#d1d5db' }} />
                                <p className="mt-3 text-muted">Chờ nạp dữ liệu để xem tham số...</p>
                            </div>
                        </div>
                    )}
                </Row>
            </div>
        </div>
    );
}

export default Analysis;



