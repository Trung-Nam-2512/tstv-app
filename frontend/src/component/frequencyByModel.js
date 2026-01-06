// Component hiển thị kết quả phân tích tần suất theo mô hình phân phối xác suất
// Hiển thị đường cong lý thuyết và điểm kinh nghiệm
import React, { useState, useEffect, useContext, useRef } from 'react';
import axios from 'axios';
import '../assets/frequencyByModel.css';
import { ModelContext } from '../context/selectedModelContext';
import { useFileInfo } from '../context/fileInfoContext';
import html2canvas from 'html2canvas';
import * as XLSX from 'xlsx';
import { useUnit } from '../context/unitContext';
import Config from '../config/config';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner } from '@fortawesome/free-solid-svg-icons';

function FrequencyByModel({ distributionName, dataUpdated, fetch }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const { fileInfo } = useFileInfo();
    const { nameColumn, unit } = useUnit();
    const { selectedModel, selectedValue } = useContext(ModelContext);



    const tableRef = useRef(null);
    const headerTitle =
        fileInfo?.dataType && fileInfo.dataType !== "Unknown"
            ? fileInfo.dataType
            : nameColumn || "Unknown";

    const headerUnit =
        fileInfo?.unit && fileInfo.unit !== "Unknown"
            ? fileInfo.unit
            : unit || "Unknown";
    useEffect(() => {
        // Chỉ thực hiện API call khi có dữ liệu và đã chọn mô hình + giá trị
        if (!fetch) return; // Chưa có dữ liệu được tải lên
        if (!selectedModel || selectedModel === 'null' || selectedModel === '') return;
        if (!selectedValue || selectedValue === 'null' || selectedValue === '') return;
        axios
            .get(`${Config.BASE_URL}/analysis/frequency_by_model?distribution_name=${selectedModel}&agg_func=${selectedValue}`)
            .then((response) => {
                setData(response.data);
                setLoading(false);
            })
            .catch((err) => {
                console.error("Error fetching frequency data:", err);
                // Xử lý lỗi 404 khi chưa có dữ liệu một cách thân thiện
                if (err.response && err.response.status === 404) {
                    const errorDetail = err.response.data?.detail || err.response.data?.message || '';
                    if (errorDetail.includes('Dữ liệu chưa được tải') || errorDetail.includes('chưa được tải')) {
                        setError({ message: 'Chưa có dữ liệu để phân tích. Vui lòng tải dữ liệu lên trước.' });
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
                setLoading(false);
            });
    }, [selectedModel, selectedValue, fetch, dataUpdated]);

    // Hàm chuyển đổi dữ liệu thành CSV
    const convertDataToCSV = (dataArray) => {
        if (!dataArray || dataArray.length === 0) return "";
        const header = Object.keys(dataArray[0]).join(",") + "\n";
        const rows = dataArray.map(item =>
            Object.values(item)
                .map(value => `"${value}"`)
                .join(",")
        ).join("\n");
        return header + rows;
    };

    // Tải file CSV
    const downloadCSV = () => {
        if (!data || !data.theoretical_curve || !Array.isArray(data.theoretical_curve)) return;
        const csvContent = convertDataToCSV(data.theoretical_curve);
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", `frequency_analysis_${selectedModel}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Tải file XLSX sử dụng SheetJS
    const downloadXLSX = () => {
        if (!data || !data.theoretical_curve || !Array.isArray(data.theoretical_curve)) return;
        const worksheet = XLSX.utils.json_to_sheet(data.theoretical_curve);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Analysis");
        XLSX.writeFile(workbook, `frequency_analysis_${selectedModel}.xlsx`);
    };

    // Tải ảnh của bảng dữ liệu sử dụng html2canvas
    const downloadTableImage = () => {
        if (tableRef.current) {
            html2canvas(tableRef.current).then((canvas) => {
                const imgData = canvas.toDataURL('image/png');
                const link = document.createElement('a');
                link.href = imgData;
                link.download = `frequency_analysis_table_${selectedModel}.png`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            });
        }
    };

    return (
        <>
            <div>
                {loading && (
                    <div className="text-center py-5" style={{ marginTop: '100px' }}>
                        <FontAwesomeIcon icon={faSpinner} className="loading-spinner me-3" />
                        <p className="mt-3">Đang tải kết quả mô hình...</p>
                    </div>
                )}
                {error && (
                    <div className="alert alert-warning text-center" style={{
                        margin: '20px auto',
                        maxWidth: '600px',
                        padding: '16px 20px',
                        borderRadius: '12px',
                        border: '1px solid #f59e0b',
                        backgroundColor: '#fffbeb',
                        color: '#92400e'
                    }}>
                        <strong>Thông báo:</strong> {error.response?.data?.detail || error.response?.data?.message || error.message || 'Không thể tải dữ liệu phân tích'}
                    </div>
                )}
                {!loading && !error && data && data.theoretical_curve && Array.isArray(data.theoretical_curve) && (
                    <div className="frequency-container">
                        <h2 style={{ textAlign: 'center', fontWeight: 'bold', marginTop: '20px', color: 'blue' }}>
                            Kết quả phân tích mô hình {selectedModel}
                        </h2>
                        {/* Container chứa bảng kết quả để hỗ trợ chụp ảnh */}
                        <div ref={tableRef}>
                            <table className="frequency-table">
                                <thead>
                                    <tr>
                                        <th>Thứ tự</th>
                                        <th>Tần suất P(%)</th>
                                        <th>{headerTitle} ({headerUnit})</th>
                                        <th>Thời gian lặp lại (năm)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.theoretical_curve.map((item, index) => (
                                        <tr key={index}>
                                            <td>{item["Thứ tự"]}</td>
                                            <td>{item["Tần suất P(%)"]}</td>
                                            <td>{item["Lưu lượng dòng chảy Q m³/s"]}</td>
                                            <td>{item["Thời gian lặp lại (năm)"]}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {/* Các nút tải xuống kết quả phân tích */}
                        <div style={{ textAlign: 'center', marginTop: '20px' }} className='fix-button-reponsive'>
                            <button
                                onClick={downloadCSV}
                                style={{ padding: '10px 20px', marginRight: '10px', backgroundColor: '#4CAF50', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                            >
                                Tải CSV
                            </button>
                            <button
                                onClick={downloadXLSX}
                                style={{ padding: '10px 20px', marginRight: '10px', backgroundColor: '#2196F3', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                            >
                                Tải XLSX
                            </button>
                            <button
                                onClick={downloadTableImage}
                                style={{ padding: '10px 20px', backgroundColor: '#FF5722', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                            >
                                Tải Ảnh Bảng Dữ Liệu
                            </button>
                        </div>
                    </div>
                )}
                {!loading && !error && !data && !fetch && (
                    <div>Cung cấp dữ liệu để xem kết quả...</div>
                )}
                {!loading && !error && fetch && (!selectedModel || selectedModel === '' || !selectedValue || selectedValue === '') && (
                    <div>Chọn mô hình phân phối và giá trị để xem kết quả...</div>
                )}
            </div>
        </>
    );
}

export default FrequencyByModel;
