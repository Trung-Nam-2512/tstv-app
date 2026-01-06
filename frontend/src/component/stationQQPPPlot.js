import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Button, Badge, Alert, Spinner } from 'react-bootstrap';
import Plot from 'react-plotly.js';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChartLine, faInfoCircle, faDownload, faSync } from '@fortawesome/free-solid-svg-icons';

const StationQQPPPlot = ({ stationId, distribution, analysisData, onRefresh }) => {
    const [qqppData, setQqppData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (stationId && distribution && analysisData) {
            fetchQQPPData();
        }
    }, [stationId, distribution, analysisData]);

    const fetchQQPPData = async () => {
        try {
            setLoading(true);
            setError(null);

            // API endpoint cho QQ-PP Plot
            const response = await fetch(
                `http://localhost:8000/analysis/qq_pp/${distribution}?agg_func=max`,
                {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            setQqppData(data);

        } catch (err) {
            setError('Không thể tải dữ liệu QQ-PP: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const getDistributionDisplayName = (dist) => {
        const names = {
            'gumbel': 'Gumbel',
            'genextreme': 'GEV',
            'frechet': 'Fréchet',
            'lognormal': 'Log-Normal',
            'pearson3': 'Pearson III',
            'gamma': 'Gamma',
            'weibull': 'Weibull',
            'logistic': 'Logistic',
            'exponential': 'Exponential',
            'genpareto': 'GPD'
        };
        return names[dist] || dist.toUpperCase();
    };

    const downloadPlots = () => {
        // Tạo link download cho các plot
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
        const filename = `QQ-PP_${stationId}_${distribution}_${timestamp}`;
        
        alert(`Đang chuẩn bị tải xuống: ${filename}.png`);
        // Implement actual download logic here
    };

    if (loading) {
        return (
            <Card>
                <Card.Header className="bg-info text-white">
                    <FontAwesomeIcon icon={faChartLine} className="me-2" />
                    Biểu đồ QQ-PP - {getDistributionDisplayName(distribution)}
                </Card.Header>
                <Card.Body className="text-center py-5">
                    <Spinner animation="border" variant="info" />
                    <p className="mt-3">Đang tạo biểu đồ QQ-PP...</p>
                </Card.Body>
            </Card>
        );
    }

    if (error) {
        return (
            <Card>
                <Card.Header className="bg-danger text-white">
                    <FontAwesomeIcon icon={faChartLine} className="me-2" />
                    Lỗi biểu đồ QQ-PP
                </Card.Header>
                <Card.Body>
                    <Alert variant="danger">
                        <FontAwesomeIcon icon={faInfoCircle} className="me-2" />
                        {error}
                        <Button 
                            variant="outline-danger" 
                            size="sm" 
                            className="ms-2"
                            onClick={fetchQQPPData}
                        >
                            <FontAwesomeIcon icon={faSync} className="me-1" />
                            Thử lại
                        </Button>
                    </Alert>
                </Card.Body>
            </Card>
        );
    }

    if (!qqppData || !qqppData.qq || !qqppData.pp) {
        return (
            <Card>
                <Card.Header className="bg-warning text-white">
                    <FontAwesomeIcon icon={faChartLine} className="me-2" />
                    Không có dữ liệu QQ-PP
                </Card.Header>
                <Card.Body>
                    <Alert variant="warning">
                        <FontAwesomeIcon icon={faInfoCircle} className="me-2" />
                        Chưa có dữ liệu để tạo biểu đồ QQ-PP cho phân phối {getDistributionDisplayName(distribution)}.
                    </Alert>
                </Card.Body>
            </Card>
        );
    }

    // Chuẩn bị dữ liệu cho QQ Plot
    const qqSampleData = qqppData.qq.map(point => point.sample);
    const qqTheoreticalData = qqppData.qq.map(point => point.theoretical);
    const maxValue = Math.max(...qqSampleData, ...qqTheoreticalData);
    const minValue = Math.min(...qqSampleData, ...qqTheoreticalData);

    // Chuẩn bị dữ liệu cho PP Plot
    const ppEmpiricalData = qqppData.pp.map(point => point.empirical);
    const ppTheoreticalData = qqppData.pp.map(point => point.theoretical);

    // Cấu hình QQ Plot
    const qqPlotData = [
        {
            x: qqTheoreticalData,
            y: qqSampleData,
            mode: 'markers',
            type: 'scatter',
            name: 'Dữ liệu quan trắc',
            marker: {
                color: 'rgba(31, 119, 180, 0.7)',
                size: 8,
                symbol: 'circle'
            },
            hovertemplate: '<b>Q-Q Plot</b><br>' +
                          'Lý thuyết: %{x:.2f}<br>' +
                          'Quan trắc: %{y:.2f}<br>' +
                          '<extra></extra>'
        },
        {
            x: [minValue, maxValue],
            y: [minValue, maxValue],
            mode: 'lines',
            type: 'scatter',
            name: 'Đường chuẩn (1:1)',
            line: {
                color: 'rgba(255, 0, 0, 0.8)',
                width: 2,
                dash: 'dash'
            },
            hoverinfo: 'skip'
        }
    ];

    const qqLayout = {
        title: {
            text: `Q-Q Plot - ${getDistributionDisplayName(distribution)}`,
            font: { size: 14, color: '#2c3e50' }
        },
        xaxis: {
            title: 'Quantile lý thuyết',
            gridcolor: '#f0f0f0',
            zeroline: false
        },
        yaxis: {
            title: 'Quantile quan trắc',
            gridcolor: '#f0f0f0',
            zeroline: false
        },
        plot_bgcolor: 'white',
        paper_bgcolor: 'white',
        font: { family: 'Arial, sans-serif', size: 12 },
        margin: { l: 60, r: 20, t: 50, b: 50 },
        showlegend: true,
        legend: {
            orientation: 'h',
            y: -0.2,
            x: 0.5,
            xanchor: 'center'
        }
    };

    // Cấu hình PP Plot
    const ppPlotData = [
        {
            x: ppTheoreticalData,
            y: ppEmpiricalData,
            mode: 'markers',
            type: 'scatter',
            name: 'Dữ liệu quan trắc',
            marker: {
                color: 'rgba(255, 127, 14, 0.7)',
                size: 8,
                symbol: 'diamond'
            },
            hovertemplate: '<b>P-P Plot</b><br>' +
                          'CDF lý thuyết: %{x:.3f}<br>' +
                          'CDF quan trắc: %{y:.3f}<br>' +
                          '<extra></extra>'
        },
        {
            x: [0, 1],
            y: [0, 1],
            mode: 'lines',
            type: 'scatter',
            name: 'Đường chuẩn (1:1)',
            line: {
                color: 'rgba(255, 0, 0, 0.8)',
                width: 2,
                dash: 'dash'
            },
            hoverinfo: 'skip'
        }
    ];

    const ppLayout = {
        title: {
            text: `P-P Plot - ${getDistributionDisplayName(distribution)}`,
            font: { size: 14, color: '#2c3e50' }
        },
        xaxis: {
            title: 'CDF lý thuyết',
            gridcolor: '#f0f0f0',
            zeroline: false,
            range: [0, 1]
        },
        yaxis: {
            title: 'CDF quan trắc',
            gridcolor: '#f0f0f0',
            zeroline: false,
            range: [0, 1]
        },
        plot_bgcolor: 'white',
        paper_bgcolor: 'white',
        font: { family: 'Arial, sans-serif', size: 12 },
        margin: { l: 60, r: 20, t: 50, b: 50 },
        showlegend: true,
        legend: {
            orientation: 'h',
            y: -0.2,
            x: 0.5,
            xanchor: 'center'
        }
    };

    // Tính toán R² cho QQ plot
    const calculateR2 = (observed, predicted) => {
        const meanObserved = observed.reduce((a, b) => a + b, 0) / observed.length;
        const ssTotal = observed.reduce((sum, val) => sum + Math.pow(val - meanObserved, 2), 0);
        const ssRes = observed.reduce((sum, val, i) => sum + Math.pow(val - predicted[i], 2), 0);
        return 1 - (ssRes / ssTotal);
    };

    const qqR2 = calculateR2(qqSampleData, qqTheoreticalData);
    const ppR2 = calculateR2(ppEmpiricalData, ppTheoreticalData);

    return (
        <Card className="station-qqpp-plot">
            <Card.Header className="bg-info text-white d-flex justify-content-between align-items-center">
                <div>
                    <FontAwesomeIcon icon={faChartLine} className="me-2" />
                    Biểu đồ QQ-PP - Kiểm định độ phù hợp
                    <Badge bg="light" text="dark" className="ms-2">
                        {getDistributionDisplayName(distribution)}
                    </Badge>
                </div>
                <div>
                    <Button 
                        variant="outline-light" 
                        size="sm" 
                        onClick={downloadPlots}
                        className="me-2"
                    >
                        <FontAwesomeIcon icon={faDownload} className="me-1" />
                        Tải xuống
                    </Button>
                    <Button 
                        variant="outline-light" 
                        size="sm" 
                        onClick={fetchQQPPData}
                    >
                        <FontAwesomeIcon icon={faSync} className="me-1" />
                        Làm mới
                    </Button>
                </div>
            </Card.Header>
            
            <Card.Body>
                {/* Thông tin đánh giá */}
                <Row className="mb-3">
                    <Col md={6}>
                        <div className="d-flex justify-content-between">
                            <span><strong>R² QQ Plot:</strong></span>
                            <Badge bg={qqR2 > 0.95 ? "success" : qqR2 > 0.90 ? "warning" : "danger"}>
                                {qqR2.toFixed(4)}
                            </Badge>
                        </div>
                    </Col>
                    <Col md={6}>
                        <div className="d-flex justify-content-between">
                            <span><strong>R² PP Plot:</strong></span>
                            <Badge bg={ppR2 > 0.95 ? "success" : ppR2 > 0.90 ? "warning" : "danger"}>
                                {ppR2.toFixed(4)}
                            </Badge>
                        </div>
                    </Col>
                </Row>

                {/* Biểu đồ */}
                <Row>
                    <Col md={6}>
                        <div className="plot-container">
                            <Plot
                                data={qqPlotData}
                                layout={qqLayout}
                                config={{
                                    displayModeBar: true,
                                    modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d'],
                                    displaylogo: false,
                                    responsive: true
                                }}
                                style={{ width: '100%', height: '400px' }}
                            />
                        </div>
                    </Col>
                    <Col md={6}>
                        <div className="plot-container">
                            <Plot
                                data={ppPlotData}
                                layout={ppLayout}
                                config={{
                                    displayModeBar: true,
                                    modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d'],
                                    displaylogo: false,
                                    responsive: true
                                }}
                                style={{ width: '100%', height: '400px' }}
                            />
                        </div>
                    </Col>
                </Row>

                {/* Giải thích */}
                <Alert variant="info" className="mt-3">
                    <FontAwesomeIcon icon={faInfoCircle} className="me-2" />
                    <strong>Cách đọc biểu đồ:</strong>
                    <ul className="mb-0 mt-2">
                        <li><strong>QQ Plot:</strong> So sánh quantile lý thuyết với quan trắc. Điểm càng gần đường 1:1 thì phân phối càng phù hợp</li>
                        <li><strong>PP Plot:</strong> So sánh xác suất lý thuyết với quan trắc. R² &gt; 0.95 = Rất tốt, R² &gt; 0.90 = Tốt, R² &lt; 0.90 = Cần xem xét</li>
                        <li><strong>Đánh giá tổng thể:</strong> Cả hai biểu đồ đều cần có R² cao và điểm phân bố đều quanh đường 1:1</li>
                    </ul>
                </Alert>
            </Card.Body>
        </Card>
    );
};

export default StationQQPPPlot;