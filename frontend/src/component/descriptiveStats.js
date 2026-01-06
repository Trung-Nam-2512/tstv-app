import React, { useState, useEffect } from 'react';
import '../assets/descriptiveStats.css';
import axios from 'axios';
import Config from '../config/config';
import { Card } from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChartBar, faSpinner } from '@fortawesome/free-solid-svg-icons';

const StatsDisplay = ({ dataUpdated, fetch, checked }) => {
    const [overallStats, setOverallStats] = useState(null);
    const [loadingOverall, setLoadingOverall] = useState(false);
    const [errorOverall, setErrorOverall] = useState(null);

    const fetchOverallStats = async () => {
        setLoadingOverall(true);
        setErrorOverall(null);
        try {
            const response = await axios.get(`${Config.BASE_URL}/stats/monthly`);
            setOverallStats(response.data);
        } catch (error) {
            // Xử lý lỗi 404 khi chưa có dữ liệu một cách thân thiện
            if (error.response && error.response.status === 404) {
                const errorDetail = error.response.data?.detail || error.response.data?.message || '';
                if (errorDetail.includes('Dữ liệu chưa được tải') || errorDetail.includes('chưa được tải')) {
                    // Không set error, để hiển thị empty state thay vì lỗi
                    setOverallStats(null);
                } else {
                    setErrorOverall('Không tìm thấy dữ liệu thống kê theo tháng');
                }
            } else if (error.response && error.response.status === 400) {
                const errorDetail = error.response.data?.detail || error.response.data?.message || '';
                setErrorOverall(errorDetail || 'Dữ liệu không hợp lệ');
            } else {
                // Các lỗi khác (network, 500, etc.)
                setErrorOverall(error.response?.data?.detail || error.response?.data?.message || 'Không thể tải dữ liệu thống kê');
            }
        } finally {
            setLoadingOverall(false);
        }
    };

    useEffect(() => {
        if (fetch) {
            fetchOverallStats();
        }
    }, []);

    // Hàm kiểm tra xem tất cả các hàng có giống nhau không (chỉ xét các giá trị Min, Max, Mean, Std)
    const allStatsAreSame = (stats) => {
        if (!stats || stats.length === 0) return false;

        const firstStat = stats[0]; // Lấy giá trị đầu tiên để so sánh
        return stats.every(stat =>
            stat.min === firstStat.min &&
            stat.max === firstStat.max &&
            stat.mean === firstStat.mean &&
            stat.std === firstStat.std
        );
    };

    const getMonthName = (monthNumber) => {
        const months = [
            'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
            'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'
        ];
        return months[monthNumber - 1] || `Tháng ${monthNumber}`;
    };

    return (
        <div className={`main-stats ${fetch ? 'p-20' : ''} fade-in`} style={{ 
            marginTop: '30px',
            padding: fetch ? '0 20px' : '0'
        }}>
            {fetch && (
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
                        letterSpacing: '0.3px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '12px'
                    }}>
                        <FontAwesomeIcon icon={faChartBar} style={{ color: '#3b82f6' }} />
                        Thống kê mô tả theo tháng
                    </h2>
                    <p style={{
                        fontSize: '14px',
                        color: '#6b7280',
                        margin: 0,
                        fontWeight: '400',
                        textAlign: 'center'
                    }}>
                        Phân tích chi tiết dữ liệu theo từng tháng
                    </p>
                </div>
            )}

            {loadingOverall ? (
                <div className="text-center py-5">
                    <FontAwesomeIcon icon={faSpinner} className="loading-spinner me-3" />
                    <p className="mt-3">Đang nạp dữ liệu thống kê tổng hợp...</p>
                </div>
            ) : errorOverall ? (
                <div className="alert alert-warning text-center" style={{
                    borderRadius: '12px',
                    border: '1px solid #f59e0b',
                    backgroundColor: '#fffbeb',
                    color: '#92400e',
                    padding: '16px 20px'
                }}>
                    <strong>Thông báo:</strong> {errorOverall}
                </div>
            ) : overallStats && overallStats.length > 0 ? (
                allStatsAreSame(overallStats) ? (
                    <div className="alert alert-warning text-center" style={{
                        borderRadius: '12px',
                        border: '1px solid #fbbf24',
                        backgroundColor: '#fffbeb',
                        color: '#92400e',
                        padding: '16px 20px'
                    }}>
                        <strong>Thông báo:</strong> Không có dữ liệu tháng (Dữ liệu các tháng giống nhau)
                    </div>
                ) : (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                        gap: '24px',
                        padding: '1rem 0'
                    }}>
                        {overallStats.map((stat, index) => (
                            <Card key={index} style={{
                                border: '1px solid #e5e7eb',
                                borderRadius: '12px',
                                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                                transition: 'all 0.2s ease',
                                height: '100%',
                                overflow: 'hidden',
                                display: 'flex',
                                flexDirection: 'column'
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
                                    padding: '16px 20px',
                                    textAlign: 'center'
                                }}>
                                    <span style={{
                                        display: 'inline-block',
                                        padding: '8px 16px',
                                        borderRadius: '6px',
                                        backgroundColor: '#eff6ff',
                                        color: '#1e40af',
                                        fontSize: '14px',
                                        fontWeight: '600',
                                        border: '1px solid #bfdbfe'
                                    }}>
                                        {getMonthName(stat.Month)}
                                    </span>
                                </Card.Header>
                                
                                {/* Card Body - Statistics Grid */}
                                <Card.Body style={{
                                    padding: '24px',
                                    flex: 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: '1fr 1fr',
                                        gap: '16px',
                                        width: '100%'
                                    }}>
                                        {/* Min */}
                                        <div style={{
                                            padding: '16px',
                                            background: '#f9fafb',
                                            borderRadius: '8px',
                                            border: '1px solid #e5e7eb',
                                            textAlign: 'center',
                                            transition: 'all 0.2s ease'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = '#f3f4f6';
                                            e.currentTarget.style.borderColor = '#d1d5db';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = '#f9fafb';
                                            e.currentTarget.style.borderColor = '#e5e7eb';
                                        }}>
                                            <div style={{
                                                fontSize: '11px',
                                                fontWeight: '600',
                                                color: '#6b7280',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.5px',
                                                marginBottom: '8px'
                                            }}>
                                                Min
                                            </div>
                                            <div style={{
                                                fontSize: '18px',
                                                fontWeight: '700',
                                                color: '#dc2626',
                                                fontFamily: 'monospace',
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis'
                                            }}>
                                                {stat.min ? stat.min.toFixed(2) : 'N/A'}
                                            </div>
                                        </div>

                                        {/* Max */}
                                        <div style={{
                                            padding: '16px',
                                            background: '#f9fafb',
                                            borderRadius: '8px',
                                            border: '1px solid #e5e7eb',
                                            textAlign: 'center',
                                            transition: 'all 0.2s ease'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = '#f3f4f6';
                                            e.currentTarget.style.borderColor = '#d1d5db';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = '#f9fafb';
                                            e.currentTarget.style.borderColor = '#e5e7eb';
                                        }}>
                                            <div style={{
                                                fontSize: '11px',
                                                fontWeight: '600',
                                                color: '#6b7280',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.5px',
                                                marginBottom: '8px'
                                            }}>
                                                Max
                                            </div>
                                            <div style={{
                                                fontSize: '18px',
                                                fontWeight: '700',
                                                color: '#059669',
                                                fontFamily: 'monospace',
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis'
                                            }}>
                                                {stat.max ? stat.max.toFixed(2) : 'N/A'}
                                            </div>
                                        </div>

                                        {/* Mean */}
                                        <div style={{
                                            padding: '16px',
                                            background: '#f9fafb',
                                            borderRadius: '8px',
                                            border: '1px solid #e5e7eb',
                                            textAlign: 'center',
                                            transition: 'all 0.2s ease'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = '#f3f4f6';
                                            e.currentTarget.style.borderColor = '#d1d5db';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = '#f9fafb';
                                            e.currentTarget.style.borderColor = '#e5e7eb';
                                        }}>
                                            <div style={{
                                                fontSize: '11px',
                                                fontWeight: '600',
                                                color: '#6b7280',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.5px',
                                                marginBottom: '8px'
                                            }}>
                                                Mean
                                            </div>
                                            <div style={{
                                                fontSize: '18px',
                                                fontWeight: '700',
                                                color: '#0284c7',
                                                fontFamily: 'monospace',
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis'
                                            }}>
                                                {stat.mean ? stat.mean.toFixed(2) : 'N/A'}
                                            </div>
                                        </div>

                                        {/* Std */}
                                        <div style={{
                                            padding: '16px',
                                            background: '#f9fafb',
                                            borderRadius: '8px',
                                            border: '1px solid #e5e7eb',
                                            textAlign: 'center',
                                            transition: 'all 0.2s ease'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = '#f3f4f6';
                                            e.currentTarget.style.borderColor = '#d1d5db';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = '#f9fafb';
                                            e.currentTarget.style.borderColor = '#e5e7eb';
                                        }}>
                                            <div style={{
                                                fontSize: '11px',
                                                fontWeight: '600',
                                                color: '#6b7280',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.5px',
                                                marginBottom: '8px'
                                            }}>
                                                Std
                                            </div>
                                            <div style={{
                                                fontSize: '18px',
                                                fontWeight: '700',
                                                color: '#7c3aed',
                                                fontFamily: 'monospace',
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis'
                                            }}>
                                                {stat.std ? stat.std.toFixed(2) : 'N/A'}
                                            </div>
                                        </div>
                                    </div>
                                </Card.Body>
                            </Card>
                        ))}
                    </div>
                )
            ) : (
                <div className="text-center py-5">
                    <div className="empty-state">
                        <FontAwesomeIcon icon={faChartBar} className="empty-icon" style={{ color: '#d1d5db' }} />
                        <p className="mt-3 text-muted">Chưa có dữ liệu để hiển thị</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StatsDisplay;
