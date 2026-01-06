import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { useFileInfo } from "../context/fileInfoContext";
import { useUnit } from "../context/unitContext";
import Config from '../config/config';
import { Card, Table, Alert } from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCalendarAlt, faSpinner, faChartLine } from '@fortawesome/free-solid-svg-icons';
import '../assets/annualStatistics.css';

const AnnualStatistics = ({ fetch }) => {
    const [stats, setStats] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const { fileInfo } = useFileInfo();
    const { nameColumn, unit } = useUnit();
    const headerTitle =
        fileInfo?.dataType && fileInfo.dataType !== "Unknown"
            ? fileInfo.dataType
            : nameColumn || "Unknown";

    const headerUnit =
        fileInfo?.unit && fileInfo.unit !== "Unknown"
            ? fileInfo.unit
            : unit || "Unknown";

    const fetchData = async () => {
        setError(null);
        try {
            const response = await axios.get(`${Config.BASE_URL}/stats/annual`);
            setStats(response.data);
        } catch (error) {
            console.error("Error fetching annual statistics:", error);
            // Xử lý lỗi 404 khi chưa có dữ liệu một cách thân thiện
            if (error.response && error.response.status === 404) {
                const errorDetail = error.response.data?.detail || error.response.data?.message || '';
                if (errorDetail.includes('Dữ liệu chưa được tải') || errorDetail.includes('chưa được tải')) {
                    // Không set error, để hiển thị empty state thay vì lỗi
                    setStats([]);
                } else {
                    setError({ message: 'Không tìm thấy dữ liệu thống kê hàng năm' });
                }
            } else if (error.response && error.response.status === 400) {
                const errorDetail = error.response.data?.detail || error.response.data?.message || '';
                setError({ message: errorDetail || 'Dữ liệu không hợp lệ' });
            } else {
                // Các lỗi khác (network, 500, etc.)
                setError({ 
                    message: error.response?.data?.detail || error.response?.data?.message || 'Không thể tải dữ liệu thống kê hàng năm' 
                });
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (fetch) {
            fetchData();
        }
    }, [fetch]);

    if (loading) return (
        <div className="text-center py-5">
            <FontAwesomeIcon icon={faSpinner} className="loading-spinner me-3" />
            <p className="mt-3">Đang tải dữ liệu thống kê hàng năm...</p>
        </div>
    );

    if (error) return (
        <Alert variant="warning" className="text-center">
            <strong>Thông báo:</strong> {error.message}
        </Alert>
    );

    // Kiểm tra xem tất cả các năm có cùng giá trị min, max, mean không
    const allStatsAreSame = (stats) => {
        if (!stats || stats.length === 0) return false;

        const firstStat = stats[0]; // Lấy giá trị của năm đầu tiên
        return stats.every(stat =>
            stat.min === firstStat.min &&
            stat.max === firstStat.max &&
            stat.mean === firstStat.mean
        );
    };

    return (
        <div className="main-stats-year fade-in" style={{ 
            marginBottom: '40px', 
            marginTop: '50px',
            padding: '0 20px'
        }}>
            {/* Header Section - Professional Style */}
            <div style={{
                marginBottom: '32px',
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
                    <FontAwesomeIcon icon={faCalendarAlt} style={{ color: '#3b82f6' }} />
                    Thống kê hàng năm
                </h2>
                <p style={{
                    fontSize: '14px',
                    color: '#6b7280',
                    margin: 0,
                    fontWeight: '400',
                    textAlign: 'center'
                }}>
                    Phân tích dữ liệu theo từng năm
                </p>
            </div>

            {allStatsAreSame(stats) ? (
                <Alert variant="warning" style={{
                    borderRadius: '12px',
                    border: '1px solid #fbbf24',
                    backgroundColor: '#fffbeb',
                    color: '#92400e',
                    padding: '16px 20px'
                }}>
                    <strong>Thông báo:</strong> Dữ liệu hàng năm không thay đổi
                </Alert>
            ) : (
                <Card style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: '12px',
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                    overflow: 'hidden'
                }}>
                    {/* Table Header - Clean Professional Style */}
                    <div style={{
                        background: '#f8fafc',
                        borderBottom: '2px solid #e5e7eb',
                        padding: '16px 24px'
                    }}>
                        <div style={{
                            fontSize: '16px',
                            fontWeight: '600',
                            color: '#1e40af',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px'
                        }}>
                            <FontAwesomeIcon icon={faChartLine} style={{ color: '#3b82f6' }} />
                            Bảng thống kê chi tiết
                        </div>
                    </div>
                    
                    <Card.Body style={{ padding: '0' }}>
                        <div className="table-responsive">
                            <Table style={{
                                margin: 0,
                                width: '100%',
                                borderCollapse: 'separate',
                                borderSpacing: 0
                            }}>
                                <thead>
                                    <tr style={{
                                        background: '#f8fafc',
                                        borderBottom: '2px solid #e5e7eb'
                                    }}>
                                        <th style={{
                                            padding: '16px 20px',
                                            textAlign: 'center',
                                            fontSize: '13px',
                                            fontWeight: '600',
                                            color: '#374151',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.5px',
                                            borderRight: '1px solid #e5e7eb'
                                        }}>
                                            Năm
                                        </th>
                                        <th style={{
                                            padding: '16px 20px',
                                            textAlign: 'center',
                                            fontSize: '13px',
                                            fontWeight: '600',
                                            color: '#374151',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.5px',
                                            borderRight: '1px solid #e5e7eb'
                                        }}>
                                            Tối thiểu ({headerUnit})
                                        </th>
                                        <th style={{
                                            padding: '16px 20px',
                                            textAlign: 'center',
                                            fontSize: '13px',
                                            fontWeight: '600',
                                            color: '#374151',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.5px',
                                            borderRight: '1px solid #e5e7eb'
                                        }}>
                                            Tối đa ({headerUnit})
                                        </th>
                                        <th style={{
                                            padding: '16px 20px',
                                            textAlign: 'center',
                                            fontSize: '13px',
                                            fontWeight: '600',
                                            color: '#374151',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.5px',
                                            borderRight: '1px solid #e5e7eb'
                                        }}>
                                            Trung bình ({headerUnit})
                                        </th>
                                        <th style={{
                                            padding: '16px 20px',
                                            textAlign: 'center',
                                            fontSize: '13px',
                                            fontWeight: '600',
                                            color: '#374151',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.5px'
                                        }}>
                                            Tổng ({headerUnit})
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {stats.map((row, index) => {
                                        // Kiểm tra nếu min, max và mean bằng nhau
                                        const epsilon = 1e-6;
                                        const isSame =
                                            Math.abs((row.min || 0) - (row.max || 0)) < epsilon &&
                                            Math.abs((row.max || 0) - (row.mean || 0)) < epsilon;
                                        const sumVal = isSame ? (row.mean || 0) : (row.sum || 0);
                                        const isEven = index % 2 === 0;

                                        return (
                                            <tr 
                                                key={index}
                                                style={{
                                                    backgroundColor: isEven ? '#ffffff' : '#f9fafb',
                                                    borderBottom: '1px solid #e5e7eb',
                                                    transition: 'background-color 0.2s ease'
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.backgroundColor = '#f0f9ff';
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.backgroundColor = isEven ? '#ffffff' : '#f9fafb';
                                                }}
                                            >
                                                <td style={{
                                                    padding: '16px 20px',
                                                    textAlign: 'center',
                                                    borderRight: '1px solid #e5e7eb',
                                                    fontWeight: '600'
                                                }}>
                                                    <span style={{
                                                        display: 'inline-block',
                                                        padding: '6px 14px',
                                                        borderRadius: '6px',
                                                        backgroundColor: '#eff6ff',
                                                        color: '#1e40af',
                                                        fontSize: '14px',
                                                        fontWeight: '600',
                                                        border: '1px solid #bfdbfe'
                                                    }}>
                                                        {row.Year}
                                                    </span>
                                                </td>
                                                <td style={{
                                                    padding: '16px 20px',
                                                    textAlign: 'right',
                                                    borderRight: '1px solid #e5e7eb',
                                                    fontSize: '15px',
                                                    fontWeight: '600',
                                                    color: '#dc2626',
                                                    fontFamily: 'monospace'
                                                }}>
                                                    {row.min ? row.min.toFixed(2) : 'N/A'}
                                                </td>
                                                <td style={{
                                                    padding: '16px 20px',
                                                    textAlign: 'right',
                                                    borderRight: '1px solid #e5e7eb',
                                                    fontSize: '15px',
                                                    fontWeight: '600',
                                                    color: '#059669',
                                                    fontFamily: 'monospace'
                                                }}>
                                                    {row.max ? row.max.toFixed(2) : 'N/A'}
                                                </td>
                                                <td style={{
                                                    padding: '16px 20px',
                                                    textAlign: 'right',
                                                    borderRight: '1px solid #e5e7eb',
                                                    fontSize: '15px',
                                                    fontWeight: '600',
                                                    color: '#0284c7',
                                                    fontFamily: 'monospace'
                                                }}>
                                                    {row.mean ? row.mean.toFixed(2) : 'N/A'}
                                                </td>
                                                <td style={{
                                                    padding: '16px 20px',
                                                    textAlign: 'right',
                                                    fontSize: '15px',
                                                    fontWeight: '600',
                                                    color: '#1f2937',
                                                    fontFamily: 'monospace'
                                                }}>
                                                    {sumVal ? sumVal.toFixed(2) : 'N/A'}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </Table>
                        </div>
                    </Card.Body>
                </Card>
            )}
        </div>
    );
};

export default AnnualStatistics;
