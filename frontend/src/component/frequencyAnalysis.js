// Component hiển thị bảng phân tích tần suất dữ liệu khí tượng thủy văn
// Tính toán và hiển thị tần suất xuất hiện của các giá trị theo năm
import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import '../assets/frequencyAnalysis.css';
import { useFileInfo } from '../context/fileInfoContext';
import html2canvas from 'html2canvas';
import * as XLSX from 'xlsx';
import { useUnit } from '../context/unitContext';
import Config from '../config/config';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner } from '@fortawesome/free-solid-svg-icons';
function FrequencyAnalysisTable({ dataUpdated, fetch }) {
    // State quản lý dữ liệu bảng tần suất
    const [tableData, setTableData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const { fileInfo } = useFileInfo();
    const { nameColumn, unit } = useUnit();



    const tableRef = useRef(null); // Tham chiếu đến bảng dữ liệu
    const headerTitle =
        fileInfo?.dataType && fileInfo.dataType !== "Unknown"
            ? fileInfo.dataType
            : nameColumn || "Unknown";

    const headerUnit =
        fileInfo?.unit && fileInfo.unit !== "Unknown"
            ? fileInfo.unit
            : unit || "Unknown";
    // Effect hook để lấy dữ liệu phân tích tần suất từ backend API
    useEffect(() => {
        if (!fetch) return; // Chỉ fetch khi có dữ liệu
        axios.get(`${Config.BASE_URL}/analysis/frequency`)
            .then(response => {
                setTableData(response.data);
                setLoading(false);
            })
            .catch(err => {
                console.error('Frequency analysis error:', err);
                setError(err);
                setLoading(false);
            });
    }, [dataUpdated, fetch]);

    // Hàm chuyển đổi dữ liệu bảng thành định dạng CSV để export
    const convertDataToCSV = (dataArray) => {
        if (!dataArray || dataArray.length === 0) return "";
        const header = Object.keys(dataArray[0]).join(",") + "\n";
        const rows = dataArray.map(item =>
            Object.values(item)
                .map(value => `"${value}"`) // Đóng gói giá trị trong dấu nháy để tránh lỗi khi có dấu phẩy
                .join(",")
        ).join("\n");
        return header + rows;
    };

    // Hàm tải xuống bảng dữ liệu dưới dạng file CSV
    const downloadCSV = () => {
        if (!tableData || tableData.length === 0) return;
        const csvContent = convertDataToCSV(tableData);
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", `frequency_analysis_table.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Hàm tải xuống bảng dữ liệu dưới dạng file Excel XLSX
    const downloadXLSX = () => {
        if (!tableData || tableData.length === 0) return;
        const worksheet = XLSX.utils.json_to_sheet(tableData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Frequency Analysis");
        XLSX.writeFile(workbook, `frequency_analysis_table.xlsx`);
    };

    // Hàm chụp ảnh màn hình bảng dữ liệu và tải xuống dưới dạng PNG
    const downloadTableImage = () => {
        if (tableRef.current) {
            html2canvas(tableRef.current).then((canvas) => {
                const imgData = canvas.toDataURL('image/png');
                const link = document.createElement('a');
                link.href = imgData;
                link.download = `frequency_analysis_table.png`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            });
        }
    };

    if (loading) {
        return (
            <div className="text-center py-5" style={{ marginTop: '50px' }}>
                <FontAwesomeIcon icon={faSpinner} className="loading-spinner me-3" />
                <p className="mt-3">Đang tải phân tích tần suất...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="frequency-analysis-container">
                <h2 style={{ textAlign: 'center', marginTop: '40px', fontWeight: 'bold', color: 'red' }}>
                    Không thể thực hiện phân tích tần suất
                </h2>
                <div style={{ 
                    padding: '20px', 
                    margin: '20px auto', 
                    maxWidth: '600px', 
                    backgroundColor: '#fff3cd', 
                    border: '1px solid #ffeaa7', 
                    borderRadius: '5px',
                    textAlign: 'center'
                }}>
                    <h4 style={{ color: '#856404', marginBottom: '15px' }}>⚠️ Lỗi dữ liệu</h4>
                    <p style={{ color: '#856404', marginBottom: '15px' }}>
                        {error.response?.data?.detail || error.message || 'Có lỗi xảy ra khi phân tích tần suất'}
                    </p>
                    {error.response?.status === 400 && (
                        <div style={{ marginTop: '15px', padding: '10px', backgroundColor: '#e3f2fd', borderRadius: '3px' }}>
                            <p style={{ color: '#1976d2', fontSize: '14px', margin: '0' }}>
                                <strong>Gợi ý:</strong> Phân tích tần suất cần ít nhất 2-3 năm dữ liệu để có kết quả chính xác. 
                                Vui lòng kiểm tra và bổ sung thêm dữ liệu lịch sử hoặc chọn trạm khác có đủ dữ liệu.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div>
            <div className="frequency-analysis-container">
                <h2 style={{ textAlign: 'center', marginTop: '40px', fontWeight: 'bold', color: 'blue' }}>
                    Phân tích tần suất
                </h2>
                {/* Bọc bảng dữ liệu trong một div có ref để hỗ trợ tải ảnh */}
                <div ref={tableRef}>
                    <table className="frequency-table">
                        <thead>
                            <tr>
                                <th>Thứ tự</th>
                                <th>Thời gian</th>
                                <th>{headerTitle} ({headerUnit})</th>
                                <th>Tần suất P (%)</th>
                                <th>Thứ hạng</th>
                            </tr>
                        </thead>
                        <tbody>
                            {/* Hiển thị từng hàng dữ liệu trong bảng phân tích tần suất */}
                            {tableData.map((row) => (
                                <tr key={row["Thứ tự"]}>
                                    <td>{row["Thứ tự"]}</td>
                                    <td>{parseInt(row["Thời gian"])}</td>
                                    <td>{row["Chỉ số"]}</td>
                                    <td>{row["Tần suất P(%)"]}</td>
                                    <td>{row["Thứ hạng"]}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {/* Các nút tải xuống dữ liệu với nhiều định dạng khác nhau */}
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
        </div>
    );
}

export default FrequencyAnalysisTable;
