import React from 'react';
import { Table, Badge } from 'react-bootstrap';

const StationFrequencyTable = ({ frequencyData, distributionName = 'gumbel' }) => {
    if (!frequencyData?.frequency_by_best_model?.theoretical_curve) {
        return (
            <div className="text-center py-4">
                <p>Không có dữ liệu bảng tần suất</p>
            </div>
        );
    }

    const theoreticalData = frequencyData.frequency_by_best_model.theoretical_curve;
    const empiricalData = frequencyData.frequency_by_best_model.empirical_points || [];

    // Lấy các tần suất chính cho hiển thị
    const mainFrequencies = [1, 2, 5, 10, 20, 25, 50, 100];
    const filteredData = theoreticalData.filter(item => 
        mainFrequencies.includes(Math.round(100 / parseFloat(item["Tần suất P(%)"])))
    );

    const getRowClass = (frequency) => {
        const returnPeriod = Math.round(100 / frequency);
        if (returnPeriod >= 50) return 'table-danger'; // Hiếm
        if (returnPeriod >= 20) return 'table-warning'; // Ít 
        if (returnPeriod >= 10) return 'table-info'; // Trung bình
        return ''; // Thường xuyên
    };

    const formatNumber = (value) => {
        const num = parseFloat(value);
        if (isNaN(num)) return 'N/A';
        if (num > 1000000) return (num / 1000000).toFixed(2) + 'M';
        if (num > 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toFixed(2);
    };

    return (
        <div className="station-frequency-table">
            <h6 className="mb-3">
                <Badge bg="primary" className="me-2">{distributionName.toUpperCase()}</Badge>
                Bảng tần suất theo trạm
            </h6>
            
            {/* Bảng lý thuyết */}
            <div className="mb-4">
                <h6 className="text-muted">Kết quả lý thuyết</h6>
                <Table striped bordered hover size="sm" responsive>
                    <thead className="table-dark">
                        <tr>
                            <th>STT</th>
                            <th>Tần suất (%)</th>
                            <th>Độ sâu (m)</th>
                            <th>Chu kỳ lặp (năm)</th>
                            <th>Mức độ</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredData.map((item, index) => {
                            const frequency = parseFloat(item["Tần suất P(%)"]);
                            const returnPeriod = Math.round(100 / frequency);
                            const depth = formatNumber(item["Lưu lượng dòng chảy Q m³/s"]);
                            
                            let level, badgeColor;
                            if (returnPeriod >= 50) {
                                level = 'Hiếm gặp';
                                badgeColor = 'danger';
                            } else if (returnPeriod >= 20) {
                                level = 'Ít gặp';
                                badgeColor = 'warning';
                            } else if (returnPeriod >= 10) {
                                level = 'Trung bình';
                                badgeColor = 'info';
                            } else {
                                level = 'Thường gặp';
                                badgeColor = 'success';
                            }

                            return (
                                <tr key={index} className={getRowClass(frequency)}>
                                    <td>{index + 1}</td>
                                    <td>{frequency.toFixed(2)}%</td>
                                    <td><strong>{depth}</strong></td>
                                    <td>{returnPeriod}</td>
                                    <td>
                                        <Badge bg={badgeColor} className="small">
                                            {level}
                                        </Badge>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </Table>
            </div>

            {/* Bảng kinh nghiệm nếu có */}
            {empiricalData.length > 0 && (
                <div>
                    <h6 className="text-muted">Dữ liệu kinh nghiệm</h6>
                    <Table striped bordered hover size="sm" responsive>
                        <thead className="table-secondary">
                            <tr>
                                <th>STT</th>
                                <th>Tần suất (%)</th>
                                <th>Độ sâu (m)</th>
                                <th>Chu kỳ lặp (năm)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {empiricalData.map((item, index) => (
                                <tr key={index}>
                                    <td>{item["Thứ tự"]}</td>
                                    <td>{parseFloat(item["Tần suất P(%)"]).toFixed(2)}%</td>
                                    <td><strong>{parseFloat(item["Lưu lượng dòng chảy Q m³/s"]).toFixed(2)}</strong></td>
                                    <td>{item["Thời gian lặp lại (năm)"]}</td>
                                </tr>
                            ))}
                        </tbody>
                    </Table>
                </div>
            )}
        </div>
    );
};

export default StationFrequencyTable;