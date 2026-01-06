import React from 'react';
import { Table, Badge, Alert, ProgressBar } from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExclamationTriangle, faCheckCircle, faInfoCircle } from '@fortawesome/free-solid-svg-icons';

const StationEvaluationMetrics = ({ analysisResult }) => {
    if (!analysisResult?.comprehensive_analysis?.statistical_analysis?.distribution_comparison) {
        return (
            <div className="text-center py-4">
                <p>Không có dữ liệu đánh giá</p>
            </div>
        );
    }

    const distributions = analysisResult.comprehensive_analysis?.statistical_analysis?.distribution_comparison || {};
    const ranking = analysisResult.comprehensive_analysis?.statistical_analysis?.goodness_of_fit_ranking || [];
    const qualityControl = analysisResult.quality_control || { professional_grade: true, overall_score: 100, completeness: 100, recommendations: [] };

    // Hàm đánh giá p-value theo tiêu chuẩn thủy văn
    const evaluatePValue = (pValue) => {
        if (pValue >= 0.05) return { status: 'Phù hợp', color: 'success', icon: faCheckCircle };
        if (pValue >= 0.01) return { status: 'Cần cân nhắc', color: 'warning', icon: faExclamationTriangle };
        return { status: 'Không phù hợp', color: 'danger', icon: faExclamationTriangle };
    };

    // Hàm đánh giá AIC
    const evaluateAIC = (aic, allAIC) => {
        const minAIC = Math.min(...allAIC);
        const deltaAIC = aic - minAIC;
        if (deltaAIC <= 2) return { level: 'Tốt nhất', color: 'success' };
        if (deltaAIC <= 7) return { level: 'Tốt', color: 'info' };
        if (deltaAIC <= 10) return { level: 'Khá', color: 'warning' };
        return { level: 'Kém', color: 'danger' };
    };

    const allAIC = Object.values(distributions).map(d => d?.AIC || 0).filter(aic => aic !== 0);

    return (
        <div className="station-evaluation-metrics">
            <h6 className="mb-3">
                <FontAwesomeIcon icon={faInfoCircle} className="me-2" />
                Đánh giá chất lượng phân tích tần suất
            </h6>

            {/* Cảnh báo quality control */}
            {!qualityControl.professional_grade && (
                <Alert variant="warning" className="mb-3">
                    <FontAwesomeIcon icon={faExclamationTriangle} className="me-2" />
                    <strong>Cảnh báo chất lượng dữ liệu:</strong>
                    <ul className="mb-0 mt-2">
                        <li>Dữ liệu chưa đạt tiêu chuẩn chuyên nghiệp (Grade: {qualityControl.professional_assessment?.overall_grade || 'N/A'})</li>
                        <li>WMO-168: {qualityControl.professional_assessment?.wmo_168_compliant ? '✅ Tuân thủ' : '❌ Không tuân thủ'}</li>
                        <li>Phù hợp phân tích tần suất: {qualityControl.professional_assessment?.frequency_analysis_suitable ? '✅ Có' : '❌ Không'}</li>
                    </ul>
                </Alert>
            )}

            {/* Bảng đánh giá phân phối */}
            <Table striped bordered hover size="sm" responsive>
                <thead className="table-dark">
                    <tr>
                        <th>Thứ hạng</th>
                        <th>Phân phối</th>
                        <th>AIC</th>
                        <th>Đánh giá AIC</th>
                        <th>p-value</th>
                        <th>Đánh giá p-value</th>
                        <th>Chi-Square</th>
                        <th>Chất lượng</th>
                    </tr>
                </thead>
                <tbody>
                    {ranking.map((item, index) => {
                        const dist = distributions[item.distribution] || {};
                        const pValueEval = evaluatePValue(item.p_value || 0);
                        const aicEval = evaluateAIC(item.aic || 0, allAIC.length > 0 ? allAIC : [0]);
                        
                        return (
                            <tr key={index} className={index === 0 ? 'table-info' : ''}>
                                <td>
                                    <Badge bg={index === 0 ? 'success' : 'secondary'}>
                                        {item.rank}
                                    </Badge>
                                </td>
                                <td>
                                    <strong>{item.distribution.toUpperCase()}</strong>
                                    {index === 0 && <Badge bg="success" className="ms-2">Tốt nhất</Badge>}
                                </td>
                                <td>{(item.aic || 0).toFixed(2)}</td>
                                <td>
                                    <Badge bg={aicEval.color}>
                                        {aicEval.level}
                                    </Badge>
                                </td>
                                <td>{(item.p_value || 0).toFixed(4)}</td>
                                <td>
                                    <Badge bg={pValueEval.color}>
                                        <FontAwesomeIcon icon={pValueEval.icon} className="me-1" />
                                        {pValueEval.status}
                                    </Badge>
                                </td>
                                <td>{(dist.ChiSquare || 0).toFixed(2)}</td>
                                <td>
                                    <Badge bg={(dist.data_quality_grade || 'poor') === 'excellent' ? 'success' : 
                                              (dist.data_quality_grade || 'poor') === 'good' ? 'info' : 
                                              (dist.data_quality_grade || 'poor') === 'acceptable' ? 'warning' : 'danger'}>
                                        {dist.data_quality_grade || 'poor'}
                                    </Badge>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </Table>

            {/* Đánh giá tổng quan */}
            <div className="mt-4">
                <h6>Đánh giá tổng quan theo tiêu chuẩn thủy văn:</h6>
                <div className="row">
                    <div className="col-md-6">
                        <div className="mb-3">
                            <label>Độ hoàn thiện dữ liệu</label>
                            <ProgressBar 
                                now={qualityControl.completeness || 0} 
                                label={`${qualityControl.completeness || 0}%`}
                                variant={(qualityControl.completeness || 0) >= 90 ? 'success' : (qualityControl.completeness || 0) >= 70 ? 'warning' : 'danger'}
                            />
                        </div>
                    </div>
                    <div className="col-md-6">
                        <div className="mb-3">
                            <label>Điểm chất lượng tổng</label>
                            <ProgressBar 
                                now={qualityControl.overall_score || 0} 
                                label={`${qualityControl.overall_score || 0}%`}
                                variant={(qualityControl.overall_score || 0) >= 85 ? 'success' : (qualityControl.overall_score || 0) >= 70 ? 'warning' : 'danger'}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Khuyến nghị từ hệ thống */}
            {qualityControl.recommendations && qualityControl.recommendations.length > 0 && (
                <Alert variant="info" className="mt-3">
                    <FontAwesomeIcon icon={faInfoCircle} className="me-2" />
                    <strong>Khuyến nghị cải thiện:</strong>
                    <ul className="mb-0 mt-2">
                        {qualityControl.recommendations.map((rec, index) => (
                            <li key={index}>{rec}</li>
                        ))}
                    </ul>
                </Alert>
            )}

            {/* Giải thích cho người dùng */}
            <Alert variant="light" className="mt-3">
                <small>
                    <strong>Giải thích:</strong><br/>
                    • <strong>AIC</strong>: Tiêu chí thông tin Akaike - giá trị càng nhỏ càng tốt<br/>
                    • <strong>p-value</strong>: Giá trị ≥ 0.05 cho thấy phân phối phù hợp với dữ liệu<br/>
                    • <strong>Chi-Square</strong>: Kiểm định độ phù hợp - giá trị càng nhỏ càng tốt<br/>
                    • Dữ liệu cần ≥30 năm để phân tích tần suất đáng tin cậy theo tiêu chuẩn WMO
                </small>
            </Alert>
        </div>
    );
};

export default StationEvaluationMetrics;