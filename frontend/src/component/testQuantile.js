import axios from 'axios';
import React, { useEffect, useState } from 'react';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    BarController,
    LineElement,
    LineController,  // Import thêm LineController
    PointElement,
    Legend,
    Tooltip,
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import { useFileInfo } from '../context/fileInfoContext';
import { useUnit } from '../context/unitContext';
import Config from '../config/config';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner } from '@fortawesome/free-solid-svg-icons';

ChartJS.register(
    CategoryScale,
    LinearScale,
    BarController,
    BarElement,
    LineController,  // Đăng ký LineController
    LineElement,
    PointElement,
    Legend,
    Tooltip
);

const HistogramWithTheoreticalCurve = ({ endpoint, dataUpdated, fetch }) => {
    const [dataAPI, setDataAPI] = useState(null);
    const [isSmallScreen, setIsSmallScreen] = useState(window.innerWidth <= 768);
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

    useEffect(() => {
        const handleResize = () => {
            setIsSmallScreen(window.innerWidth <= 768);
        };

        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);



    const fetchData = async () => {
        if (!fetch) return; // Chỉ fetch khi fetch === true

        try {
            const { data } = await axios.get(`${Config.BASE_URL}${endpoint}`);
            setDataAPI(data);
        } catch (error) {
            console.error('Error fetching data:', error.message);
        }
    };

    useEffect(() => {

        fetchData();
    }, [endpoint, dataUpdated, fetch]);


    if (!dataAPI || !dataAPI.histogram) {
        return (
            <div className="text-center py-5">
                <FontAwesomeIcon icon={faSpinner} className="loading-spinner me-3" />
                <p className="mt-3">Đang tải biểu đồ tần số...</p>
            </div>
        );
    }

    // Giải nén dữ liệu từ backend
    const { histogram } = dataAPI;
    const { counts, bin_midpoints, expected_counts } = histogram;

    // Format tên phân phối từ endpoint
    const getDistributionDisplayName = (endpoint) => {
        if (!endpoint) return 'Unknown';
        
        // Extract distribution name from endpoint (e.g., "/analysis/quantile_data/genextreme?agg_func=max" -> "genextreme")
        const match = endpoint.match(/quantile_data\/([^?]+)/);
        if (!match) return 'Unknown';
        
        const distName = match[1];
        
        // Map distribution names to display names
        const nameMap = {
            'gumbel': 'Gumbel',
            'lognorm': 'Lognormal',
            'gamma': 'Gamma',
            'logistic': 'Logistic',
            'expon': 'Exponential',
            'exponential': 'Exponential',
            'genpareto': 'Generalized Pareto',
            'genextreme': 'Generalized Extreme Value',
            'frechet': 'Frechet',
            'pearson3': 'Pearson3'
        };
        
        return nameMap[distName] || distName.charAt(0).toUpperCase() + distName.slice(1);
    };

    const distributionDisplayName = getDistributionDisplayName(endpoint);

    // Cấu hình dữ liệu cho biểu đồ: dùng bar chart cho empirical counts
    // và line chart cho expected counts từ mô hình đã fit
    const chartData = {
        labels: bin_midpoints.map(value => Number(value.toFixed(2))),
        datasets: [
            {
                type: 'bar',
                label: 'Số liệu thực đo',
                data: counts,
                backgroundColor: 'rgba(21, 101, 192, 0.6)', // Xanh dương nhạt
                borderColor: 'rgba(21, 101, 192, 1)', // Xanh dương đậm
                borderWidth: 1.5,
                borderRadius: 4,
                borderSkipped: false,
            },
            {
                type: 'line',
                label: `Phân bố ${distributionDisplayName}`,
                data: expected_counts,
                borderColor: '#d62728', // Đỏ
                backgroundColor: 'rgba(214, 39, 40, 0.1)',
                fill: false,
                tension: 0.4,
                pointRadius: 4,
                pointHoverRadius: 6,
                pointBackgroundColor: '#d62728',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                pointHoverBackgroundColor: '#d62728',
                pointHoverBorderColor: '#ffffff',
                pointHoverBorderWidth: 2,
            },
        ],
    };

    const optionsHistogram = {
        maintainAspectRatio: false,
        responsive: true,
        height: 500,
        layout: {
            padding: {
                top: 20,
                bottom: 40,
                left: 20,
                right: 20
            }
        },
        scales: {
            x: {
                title: {
                    display: true,
                    text: `${headerTitle} (${headerUnit})`,
                    font: {
                        size: 14,
                        weight: '600',
                        family: '"Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif'
                    },
                    color: '#1565c0',
                    padding: { top: 10, bottom: 5 }
                },
                grid: {
                    color: '#e3f2fd',
                    lineWidth: 1
                },
                ticks: {
                    font: {
                        size: 11,
                        family: '"Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif'
                    },
                    color: '#374151'
                }
            },
            y: {
                title: {
                    display: true,
                    text: 'Count',
                    font: {
                        size: 14,
                        weight: '600',
                        family: '"Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif'
                    },
                    color: '#1565c0',
                    padding: { top: 5, bottom: 10 }
                },
                beginAtZero: true,
                grid: {
                    color: '#e3f2fd',
                    lineWidth: 1
                },
                ticks: {
                    font: {
                        size: 11,
                        family: '"Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif'
                    },
                    color: '#374151'
                }
            },
        },
        plugins: {
            legend: {
                display: true,
                position: 'top',
                align: 'center',
                labels: {
                    font: {
                        size: 12,
                        weight: '500',
                        family: '"Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif'
                    },
                    color: '#374151',
                    padding: 15,
                    usePointStyle: true,
                    pointStyle: 'circle'
                }
            },
            tooltip: {
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                titleColor: '#1a1a1a',
                bodyColor: '#374151',
                borderColor: '#e0e7ff',
                borderWidth: 1,
                padding: 12,
                titleFont: {
                    size: 13,
                    weight: '600',
                    family: '"Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif'
                },
                bodyFont: {
                    size: 12,
                    family: '"Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif'
                },
                boxPadding: 6,
                cornerRadius: 8
            }
        },
    };

    return (
        <div style={{ width: '100%', maxWidth: '1200px', margin: '0 auto' }}>
            {/* Header Section - Professional Water Resources Engineering Style */}
            <div style={{
                background: 'linear-gradient(135deg, #0d47a1 0%, #1565c0 100%)',
                borderRadius: '12px',
                padding: '24px 32px',
                marginBottom: '32px',
                boxShadow: '0 4px 12px rgba(13, 71, 161, 0.2)',
                color: '#ffffff'
            }}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '20px'
                }}>
                    <div style={{ flex: '1', minWidth: '250px' }}>
                        <h2 style={{
                            margin: 0,
                            fontSize: '28px',
                            fontWeight: '700',
                            color: '#ffffff',
                            letterSpacing: '0.5px',
                            marginBottom: '8px'
                        }}>
                            Biểu đồ tần số
                        </h2>
                        <p style={{
                            margin: 0,
                            fontSize: '14px',
                            color: 'rgba(255, 255, 255, 0.9)',
                            fontWeight: '400'
                        }}>
                            Phân tích phân bố tần số theo mô hình {distributionDisplayName}
                        </p>
                    </div>
                </div>
            </div>

            {/* Chart Container - Professional Layout */}
            <div style={{
                background: '#ffffff',
                borderRadius: '12px',
                boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                overflow: 'hidden',
                padding: '24px'
            }}>
                <div style={{
                width: '100%', 
                    height: '500px',
                    position: 'relative'
                }}>
            <Chart type="bar" data={chartData} options={optionsHistogram} />
                </div>
            </div>
        </div>
    );
};

export default HistogramWithTheoreticalCurve;
