import React, { useState, useEffect } from 'react';
import { Card, Table, Badge, Button, Alert, Spinner, Row, Col } from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
    faChartBar, 
    faAward, 
    faInfoCircle, 
    faSort,
    faSortUp,
    faSortDown,
    faCheckCircle,
    faExclamationTriangle,
    faTimesCircle
} from '@fortawesome/free-solid-svg-icons';

const StationModelSelector = ({ stationId, onModelSelect, selectedModel }) => {
    const [distributionAnalysis, setDistributionAnalysis] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [sortBy, setSortBy] = useState('AIC'); // AIC, p_value, ChiSquare
    const [sortOrder, setSortOrder] = useState('asc'); // asc, desc

    useEffect(() => {
        if (stationId) {
            fetchDistributionAnalysis();
        }
    }, [stationId]);

    const fetchDistributionAnalysis = async () => {
        try {
            setLoading(true);
            setError(null);

            const response = await fetch(
                'http://localhost:8000/analysis/distribution?agg_func=max',
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
            setDistributionAnalysis(data);

        } catch (err) {
            setError('Không thể phân tích phân phối: ' + err.message);
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

    const getQualityBadge = (pValue, aic, dataGrade) => {
        if (!pValue) {
            return <Badge bg="secondary">N/A</Badge>;
        }

        if (pValue >= 0.05) {
            return <Badge bg="success">Tốt</Badge>;
        } else if (pValue >= 0.01) {
            return <Badge bg="warning">Chấp nhận</Badge>;
        } else {
            return <Badge bg="danger">Kém</Badge>;
        }
    };

    const getDataQualityIcon = (grade) => {
        switch (grade) {
            case 'excellent':
                return <FontAwesomeIcon icon={faCheckCircle} className="text-success" />;
            case 'good':
                return <FontAwesomeIcon icon={faCheckCircle} className="text-info" />;
            case 'fair':
                return <FontAwesomeIcon icon={faExclamationTriangle} className="text-warning" />;
            case 'poor':
                return <FontAwesomeIcon icon={faTimesCircle} className="text-danger" />;
            default:
                return <FontAwesomeIcon icon={faInfoCircle} className="text-secondary" />;
        }
    };

    const handleSort = (column) => {
        if (sortBy === column) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(column);
            setSortOrder('asc');
        }
    };

    const getSortIcon = (column) => {
        if (sortBy !== column) {
            return <FontAwesomeIcon icon={faSort} className="text-muted" />;
        }
        return <FontAwesomeIcon icon={sortOrder === 'asc' ? faSortUp : faSortDown} />;
    };

    const sortedDistributions = () => {
        if (!distributionAnalysis) return [];

        const distributions = Object.entries(distributionAnalysis).map(([key, value]) => ({
            name: key,
            ...value
        }));

        return distributions.sort((a, b) => {
            let aVal = a[sortBy];
            let bVal = b[sortBy];

            // Xử lý giá trị null/undefined
            if (aVal == null) aVal = sortBy === 'p_value' ? -1 : Infinity;
            if (bVal == null) bVal = sortBy === 'p_value' ? -1 : Infinity;

            if (sortOrder === 'asc') {
                return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
            } else {
                return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
            }
        });
    };

    const getBestModel = () => {
        if (!distributionAnalysis) return null;

        // Tìm model có AIC nhỏ nhất và p-value > 0.05
        const validModels = Object.entries(distributionAnalysis)
            .filter(([, data]) => data.p_value && data.p_value >= 0.05)
            .sort((a, b) => a[1].AIC - b[1].AIC);

        if (validModels.length > 0) {
            return validModels[0][0];
        }

        // Nếu không có model hợp lệ, chọn theo AIC thấp nhất
        const allModels = Object.entries(distributionAnalysis)
            .filter(([, data]) => data.AIC && data.AIC !== Infinity)
            .sort((a, b) => a[1].AIC - b[1].AIC);

        return allModels.length > 0 ? allModels[0][0] : null;
    };

    if (loading) {
        return (
            <Card>
                <Card.Header className="bg-primary text-white">
                    <FontAwesomeIcon icon={faChartBar} className="me-2" />
                    Lựa chọn mô hình phân phối
                </Card.Header>
                <Card.Body className="text-center py-4">
                    <Spinner animation="border" variant="primary" />
                    <p className="mt-3">Đang phân tích các mô hình phân phối...</p>
                </Card.Body>
            </Card>
        );
    }

    if (error) {
        return (
            <Card>
                <Card.Header className="bg-danger text-white">
                    <FontAwesomeIcon icon={faChartBar} className="me-2" />
                    Lỗi phân tích mô hình
                </Card.Header>
                <Card.Body>
                    <Alert variant="danger">
                        <FontAwesomeIcon icon={faExclamationTriangle} className="me-2" />
                        {error}
                        <Button 
                            variant="outline-danger" 
                            size="sm" 
                            className="ms-2"
                            onClick={fetchDistributionAnalysis}
                        >
                            Thử lại
                        </Button>
                    </Alert>
                </Card.Body>
            </Card>
        );
    }

    const bestModel = getBestModel();
    const distributions = sortedDistributions();

    return (
        <Card className="station-model-selector">
            <Card.Header className="bg-primary text-white">
                <FontAwesomeIcon icon={faChartBar} className="me-2" />
                Lựa chọn mô hình phân phối tối ưu
            </Card.Header>
            
            <Card.Body>
                {/* Tóm tắt chất lượng dữ liệu */}
                {distributions.length > 0 && (
                    <Row className="mb-3">
                        <Col md={4}>
                            <div className="text-center">
                                {getDataQualityIcon(distributions[0].data_quality_grade)}
                                <div className="small">
                                    <strong>Chất lượng:</strong> {distributions[0].data_quality_grade}
                                </div>
                                <div className="small text-muted">
                                    {distributions[0].sample_size} năm dữ liệu
                                </div>
                            </div>
                        </Col>
                        <Col md={4}>
                            <div className="text-center">
                                <FontAwesomeIcon icon={faAward} className="text-warning" size="lg" />
                                <div className="small">
                                    <strong>Khuyến nghị:</strong>
                                </div>
                                <div className="small">
                                    <Badge bg="success">
                                        {getDistributionDisplayName(bestModel)}
                                    </Badge>
                                </div>
                            </div>
                        </Col>
                        <Col md={4}>
                            <div className="text-center">
                                <FontAwesomeIcon icon={faInfoCircle} className="text-info" size="lg" />
                                <div className="small">
                                    <strong>Độ tin cậy:</strong>
                                </div>
                                <div className="small text-muted">
                                    {distributions[0].uncertainty_level}
                                </div>
                            </div>
                        </Col>
                    </Row>
                )}

                {/* Bảng so sánh mô hình */}
                <Table responsive striped hover size="sm">
                    <thead className="table-dark">
                        <tr>
                            <th>Phân phối</th>
                            <th 
                                style={{ cursor: 'pointer' }}
                                onClick={() => handleSort('AIC')}
                            >
                                AIC {getSortIcon('AIC')}
                            </th>
                            <th 
                                style={{ cursor: 'pointer' }}
                                onClick={() => handleSort('ChiSquare')}
                            >
                                χ² {getSortIcon('ChiSquare')}
                            </th>
                            <th 
                                style={{ cursor: 'pointer' }}
                                onClick={() => handleSort('p_value')}
                            >
                                p-value {getSortIcon('p_value')}
                            </th>
                            <th>Đánh giá</th>
                            <th>Chọn</th>
                        </tr>
                    </thead>
                    <tbody>
                        {distributions.map((dist, index) => (
                            <tr 
                                key={dist.name}
                                className={dist.name === bestModel ? 'table-success' : ''}
                            >
                                <td>
                                    <div className="d-flex align-items-center">
                                        {dist.name === bestModel && (
                                            <FontAwesomeIcon 
                                                icon={faAward} 
                                                className="text-warning me-2" 
                                            />
                                        )}
                                        <strong>{getDistributionDisplayName(dist.name)}</strong>
                                    </div>
                                    {dist.name === bestModel && (
                                        <small className="text-success">Khuyến nghị</small>
                                    )}
                                </td>
                                <td>
                                    <code>{dist.AIC ? dist.AIC.toFixed(2) : 'N/A'}</code>
                                </td>
                                <td>
                                    <code>{dist.ChiSquare ? dist.ChiSquare.toFixed(3) : 'N/A'}</code>
                                </td>
                                <td>
                                    <code>{dist.p_value ? dist.p_value.toFixed(4) : 'N/A'}</code>
                                </td>
                                <td>
                                    {getQualityBadge(dist.p_value, dist.AIC, dist.data_quality_grade)}
                                </td>
                                <td>
                                    <Button
                                        variant={selectedModel === dist.name ? "success" : "outline-primary"}
                                        size="sm"
                                        onClick={() => onModelSelect(dist.name)}
                                    >
                                        {selectedModel === dist.name ? (
                                            <>
                                                <FontAwesomeIcon icon={faCheckCircle} className="me-1" />
                                                Đã chọn
                                            </>
                                        ) : (
                                            'Chọn'
                                        )}
                                    </Button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </Table>

                {/* Giải thích chỉ số */}
                <Alert variant="info" className="mt-3">
                    <FontAwesomeIcon icon={faInfoCircle} className="me-2" />
                    <strong>Giải thích chỉ số:</strong>
                    <Row className="mt-2">
                        <Col md={4}>
                            <small>
                                <strong>AIC (Akaike Information Criterion):</strong><br/>
                                Thấp hơn = Tốt hơn<br/>
                                So sánh chất lượng mô hình
                            </small>
                        </Col>
                        <Col md={4}>
                            <small>
                                <strong>Chi-Square (χ²):</strong><br/>
                                Thấp hơn = Tốt hơn<br/>
                                Kiểm định độ phù hợp
                            </small>
                        </Col>
                        <Col md={4}>
                            <small>
                                <strong>p-value:</strong><br/>
                                &ge; 0.05 = Chấp nhận được<br/>
                                &ge; 0.01 = Cân nhắc sử dụng
                            </small>
                        </Col>
                    </Row>
                </Alert>

                {/* Nút chọn model tự động */}
                {bestModel && (
                    <div className="text-center mt-3">
                        <Button
                            variant="success"
                            onClick={() => onModelSelect(bestModel)}
                            disabled={selectedModel === bestModel}
                        >
                            <FontAwesomeIcon icon={faAward} className="me-2" />
                            {selectedModel === bestModel ? 
                                'Đã chọn mô hình tối ưu' : 
                                `Chọn mô hình tối ưu: ${getDistributionDisplayName(bestModel)}`
                            }
                        </Button>
                    </div>
                )}
            </Card.Body>
        </Card>
    );
};

export default StationModelSelector;