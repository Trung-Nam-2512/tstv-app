import React, { useState, useRef, useEffect } from "react";
import Handsontable from "react-handsontable";
import axios from "axios";
import "handsontable/dist/handsontable.full.css";
import styles from "../assets/manualInput.module.css";
import { useUnit } from "../context/unitContext";
import { useFileInfo } from "../context/fileInfoContext";
import { useSession } from "../context/sessionContext";
import { useAnalysis } from "../context/analysisContext";
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Config from "../config/config";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner } from '@fortawesome/free-solid-svg-icons';
// Component con để nhập năm và chọn kiểu nhập
const YearInput = ({ startYear, setStartYear, endYear, setEndYear, isYearly, setIsYearly, onGenerateTable }) => {

    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '20px',
            alignItems: 'end'
        }}>
            <div>
                <label style={{
                    display: 'block',
                    marginBottom: '8px',
                    fontWeight: '600',
                    color: '#374151',
                    fontSize: '14px'
                }}>
                    Năm bắt đầu
                </label>
                <input
                    type="number"
                    value={startYear}
                    onChange={(e) => setStartYear(e.target.value)}
                    placeholder="Ví dụ: 2000"
                    style={{
                        width: '100%',
                        padding: '10px 14px',
                        border: '1px solid #e0e7ff',
                        borderRadius: '8px',
                        fontSize: '14px',
                        transition: 'all 0.2s',
                        boxSizing: 'border-box'
                    }}
                    onFocus={(e) => {
                        e.target.style.borderColor = '#1565c0';
                        e.target.style.boxShadow = '0 0 0 3px rgba(21, 101, 192, 0.1)';
                    }}
                    onBlur={(e) => {
                        e.target.style.borderColor = '#e0e7ff';
                        e.target.style.boxShadow = 'none';
                    }}
                />
            </div>
            <div>
                <label style={{
                    display: 'block',
                    marginBottom: '8px',
                    fontWeight: '600',
                    color: '#374151',
                    fontSize: '14px'
                }}>
                    Năm kết thúc
                </label>
                <input
                    type="number"
                    value={endYear}
                    onChange={(e) => setEndYear(e.target.value)}
                    placeholder="Ví dụ: 2023"
                    style={{
                        width: '100%',
                        padding: '10px 14px',
                        border: '1px solid #e0e7ff',
                        borderRadius: '8px',
                        fontSize: '14px',
                        transition: 'all 0.2s',
                        boxSizing: 'border-box'
                    }}
                    onFocus={(e) => {
                        e.target.style.borderColor = '#1565c0';
                        e.target.style.boxShadow = '0 0 0 3px rgba(21, 101, 192, 0.1)';
                    }}
                    onBlur={(e) => {
                        e.target.style.borderColor = '#e0e7ff';
                        e.target.style.boxShadow = 'none';
                    }}
                />
            </div>
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                paddingTop: '28px'
            }}>
                <input
                    type="checkbox"
                    checked={isYearly}
                    onChange={(e) => setIsYearly(e.target.checked)}
                    style={{
                        width: '18px',
                        height: '18px',
                        cursor: 'pointer',
                        accentColor: '#1565c0'
                    }}
                />
                <label style={{
                    fontWeight: '500',
                    color: '#374151',
                    fontSize: '14px',
                    cursor: 'pointer',
                    margin: 0
                }}>
                    Nhập theo năm
                </label>
            </div>
            <div>
                <button
                    onClick={onGenerateTable}
                    style={{
                        width: '100%',
                        padding: '12px 24px',
                        background: 'linear-gradient(135deg, #0d47a1 0%, #1565c0 100%)',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '14px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        transition: 'all 0.3s',
                        boxShadow: '0 2px 4px rgba(13, 71, 161, 0.2)'
                    }}
                    onMouseEnter={(e) => {
                        e.target.style.transform = 'translateY(-2px)';
                        e.target.style.boxShadow = '0 4px 8px rgba(13, 71, 161, 0.3)';
                    }}
                    onMouseLeave={(e) => {
                        e.target.style.transform = 'translateY(0)';
                        e.target.style.boxShadow = '0 2px 4px rgba(13, 71, 161, 0.2)';
                    }}
                >
                    Tạo bảng dữ liệu
                </button>
            </div>
        </div>
    );
};

// Component chính
function DataInputForm({ onUploadSuccess, checked }) {
    const [tableData, setTableData] = useState([]);
    const [startYear, setStartYear] = useState("");
    const [endYear, setEndYear] = useState("");
    const [isYearly, setIsYearly] = useState(false);
    const [warning, setWarning] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [columnNames, setColumnNames] = useState({
        year: "Year",
        month: "Month",
        rainfall: "Rainfall",
    });
    const [dataType, setDataType] = useState(""); // Thêm state cho dataType
    const [showCustomDataType, setShowCustomDataType] = useState(false); // State để hiển thị input tùy chỉnh
    const [hasSubmitted, setHasSubmitted] = useState(false); // Track xem đã submit chưa
    const { unit, setUnit, nameColumn, setNameColumn } = useUnit();
    const { updateFileInfo } = useFileInfo();
    const { clearSession, setDataSource } = useSession();
    const { clearCache } = useAnalysis();
    const hotRef = useRef(null);
    
    // QUAN TRỌNG: Update fileInfo khi user thay đổi dataType hoặc unit
    // Chỉ update nếu đã submit ít nhất 1 lần (có dữ liệu)
    useEffect(() => {
        if (hasSubmitted && dataType.trim() && unit) {
            const finalDataType = dataType.trim();
            const finalUnit = unit;
            
            updateFileInfo({
                dataType: finalDataType,
                unit: finalUnit,
                fileExtension: "",
                isValid: true,
                fileName: `Manual_${startYear}-${endYear}`
            });
            
            console.log('[ManualInput] Metadata updated:', { dataType: finalDataType, unit: finalUnit });
        }
    }, [dataType, unit, hasSubmitted, startYear, endYear, updateFileInfo]);





    const generateTableData = () => {
        const sYear = Number(startYear);
        const eYear = Number(endYear);
        setWarning("");

        if (isNaN(sYear) || isNaN(eYear)) {
            toast.error("Vui lòng nhập năm hợp lệ.", { position: "top-center", autoClose: 1400 });
            return;
        }
        const totalYears = eYear - sYear + 1;
        if (totalYears < 5) {
            toast.error("Số năm phải lớn hơn hoặc bằng 5.", { position: "top-center", autoClose: 1400 });
            return;
        }

        const newData = [];
        if (isYearly) {
            checked(true);
            for (let year = sYear; year <= eYear; year++) {
                newData.push([year, ""]);
            }
        } else {
            checked(false);
            for (let year = sYear; year <= eYear; year++) {
                for (let m = 1; m <= 12; m++) {
                    newData.push([year, `Tháng ${m}`, ""]);
                }
            }
        }
        setTableData(newData);
        setWarning("Nhập xong dữ liệu hãy bấm 'Tính toán'");
        toast.success("Tạo bảng thành công", { position: "top-center", autoClose: 1400 });
    };

    const handleSubmit = () => {
        setWarning("");

        if (!tableData.length) {
            toast.error("Chưa có dữ liệu. Vui lòng tạo bảng dữ liệu.", { position: "top-center", autoClose: 1400 });
            return;
        }

        // Validation: Kiểm tra dataType và unit
        if (!dataType.trim()) {
            toast.error("Vui lòng nhập loại dữ liệu.", { position: "top-center", autoClose: 1400 });
            return;
        }
        if (!unit) {
            toast.error("Vui lòng chọn đơn vị đo.", { position: "top-center", autoClose: 1400 });
            return;
        }

        const updatedData = hotRef.current.hotInstance.getData();

        if (!Array.isArray(updatedData)) {
            updatedData = Object.values(updatedData);
        }
        let transformedData = [];

        if (isYearly) {
            const incompleteRows = updatedData.filter((row) => row[1] === "" || row[1] === null);
            if (incompleteRows.length > 0) {
                toast.error("Vui lòng nhập đầy đủ giá trị Rainfall cho tất cả các năm.", { position: "top-center", autoClose: 1400 });
                return;
            }
            transformedData = updatedData.map((row) => ({
                [columnNames.year]: row[0],
                [columnNames.rainfall]: Number(row[1]),
            }));
        } else {
            const incompleteRows = updatedData.filter((row) => row[2] === "" || row[2] === null);
            if (incompleteRows.length > 0) {
                toast.error("Vui lòng nhập đầy đủ giá trị Rainfall cho tất cả các tháng.", { position: "top-center", autoClose: 1400 });
                return;
            }

            transformedData = updatedData.map((row) => {
                const monthStr = row[1].replace("Tháng ", "").trim();
                const month = parseInt(monthStr, 10);
                return {
                    [columnNames.year]: row[0],
                    [columnNames.month]: month,
                    [columnNames.rainfall]: Number(row[2]),
                };
            });
        }
        setNameColumn(columnNames.rainfall);
        // console.log("day la name column ", columnNames.rainfall);
        // Lưu dữ liệu vào localStorage chỉ khi người dùng ấn submit
        localStorage.setItem("tableData", JSON.stringify(transformedData));
        localStorage.setItem("startYear", startYear);
        localStorage.setItem("endYear", endYear);
        localStorage.setItem("isYearly", isYearly);
        const payload = {
            data: transformedData,
        };

        setIsLoading(true);

        axios
            .post(`${Config.BASE_URL}/data/upload_manual`, payload)
            .then((response) => {
                // console.log("Kết quả: ", response.data);

                // Clear previous session and cache when submitting new manual data
                clearSession();
                clearCache();

                // Update fileInfo với metadata từ form
                const finalDataType = dataType.trim() || columnNames.rainfall || "Unknown";
                const finalUnit = unit || "Unknown";

                updateFileInfo({
                    dataType: finalDataType,
                    unit: finalUnit,
                    fileExtension: "",
                    isValid: true,
                    fileName: `Manual_${startYear}-${endYear}`
                });

                setDataSource('manual'); // Mark data source as manual
                setHasSubmitted(true); // Mark đã submit để enable auto-update metadata
                
                // Log để debug
                console.log('[ManualInput] Submit successful, cache cleared and dataSource set to "manual"');

                if (onUploadSuccess) {
                    onUploadSuccess();
                }
                toast.success("Tính toán thành công", { position: "top-center", autoClose: 1400 });
            })
            .catch((error) => {
                console.error("Lỗi: ", error);
                toast.error("Lỗi khi gửi dữ liệu. Vui lòng kiểm tra lại.", { position: "top-center", autoClose: 1400 });

                // Update fileInfo với giá trị Unknown khi có lỗi
                updateFileInfo({
                    dataType: "Unknown",
                    unit: "Unknown",
                    fileExtension: "",
                    isValid: false,
                });
            })
            .finally(() => {
                setIsLoading(false);
            });
    };

    const handleColumnNameChange = (column, newName) => {
        setColumnNames((prevNames) => ({
            ...prevNames,
            [column]: newName,
        }));
    };

    return (
        <div className={styles.container && 'container-manual-input'} >
            {/* Header Section */}
            <div style={{
                background: 'linear-gradient(135deg, #0d47a1 0%, #1565c0 100%)',
                borderRadius: '12px',
                padding: '24px 32px',
                marginBottom: '32px',
                boxShadow: '0 4px 12px rgba(13, 71, 161, 0.2)',
                color: '#ffffff',
                textAlign: 'center'
            }}>
                <h2 style={{
                    margin: 0,
                    fontSize: '28px',
                    fontWeight: '700',
                    color: '#ffffff',
                    letterSpacing: '0.5px'
                }}>
                    Nhập Dữ Liệu Thủ Công
                </h2>
                <p style={{
                    margin: '8px 0 0 0',
                    fontSize: '14px',
                    color: 'rgba(255, 255, 255, 0.9)',
                    fontWeight: '400'
                }}>
                    Nhập dữ liệu trực tiếp vào bảng hoặc tải lên từ file
                </p>
            </div>

            {/* Year Input Section */}
            <div style={{
                background: '#ffffff',
                borderRadius: '12px',
                padding: '24px',
                marginBottom: '24px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
            }}>
                <YearInput
                    startYear={startYear}
                    setStartYear={setStartYear}
                    endYear={endYear}
                    setEndYear={setEndYear}
                    isYearly={isYearly}
                    setIsYearly={setIsYearly}
                    onGenerateTable={generateTableData}
                />
                {warning && (
                    <div className={styles.warning} style={{
                        marginTop: '16px',
                        padding: '12px',
                        background: '#fff3cd',
                        border: '1px solid #ffc107',
                        borderRadius: '8px',
                        color: '#856404'
                    }}>
                        {warning}
                    </div>
                )}
            </div>

            {/* Metadata Configuration Section */}
            <div style={{
                background: '#ffffff',
                borderRadius: '12px',
                padding: '24px',
                marginBottom: '24px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                borderLeft: '4px solid #1565c0'
            }}>
                <h3 style={{
                    margin: '0 0 20px 0',
                    color: '#1565c0',
                    fontSize: '18px',
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}>
                    <div style={{
                        width: '4px',
                        height: '20px',
                        background: '#1565c0',
                        borderRadius: '2px'
                    }}></div>
                    Cấu hình thông tin dữ liệu
                </h3>

                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                    gap: '20px'
                }}>
                    {/* Input cho loại dữ liệu */}
                    <div style={{
                        position: 'relative',
                        marginBottom: '20px'
                    }}>
                        <label style={{
                            display: 'block',
                            marginBottom: '8px',
                            fontWeight: '600',
                            color: '#374151',
                            fontSize: '14px'
                        }}>
                            Loại dữ liệu <span style={{ color: '#dc3545' }}>*</span>
                        </label>
                        <select
                            value={showCustomDataType ? "custom" : dataType}
                            onChange={(e) => {
                                if (e.target.value === "custom") {
                                    setShowCustomDataType(true);
                                    setDataType("");
                                } else {
                                    setShowCustomDataType(false);
                                    setDataType(e.target.value);
                                }
                            }}
                            style={{
                                width: '100%',
                                padding: '10px 14px',
                                border: '1px solid #e0e7ff',
                                borderRadius: '8px',
                                fontSize: '14px',
                                background: '#ffffff',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                boxSizing: 'border-box',
                                appearance: 'none',
                                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23374151' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                                backgroundRepeat: 'no-repeat',
                                backgroundPosition: 'right 14px center',
                                paddingRight: '40px'
                            }}
                            onFocus={(e) => {
                                e.target.style.borderColor = '#1565c0';
                                e.target.style.boxShadow = '0 0 0 3px rgba(21, 101, 192, 0.1)';
                            }}
                            onBlur={(e) => {
                                e.target.style.borderColor = '#e0e7ff';
                                e.target.style.boxShadow = 'none';
                            }}
                        >
                            <option value="">-- Chọn loại dữ liệu --</option>
                            <option value="Lượng mưa">Lượng mưa</option>
                            <option value="Rainfall">Rainfall</option>
                            <option value="Lưu lượng">Lưu lượng</option>
                            <option value="Discharge">Discharge</option>
                            <option value="Nhiệt độ">Nhiệt độ</option>
                            <option value="Temperature">Temperature</option>
                            <option value="Mực nước">Mực nước</option>
                            <option value="Water Level">Water Level</option>
                            <option value="Dòng chảy">Dòng chảy</option>
                            <option value="Flow">Flow</option>
                            <option value="custom">-- Nhập tùy chỉnh --</option>
                        </select>
                        {showCustomDataType && (
                            <input
                                type="text"
                                value={dataType}
                                onChange={(e) => setDataType(e.target.value)}
                                placeholder="Nhập loại dữ liệu tùy chỉnh..."
                                autoFocus
                                style={{
                                    width: '100%',
                                    padding: '10px 14px',
                                    border: '1px solid #e0e7ff',
                                    borderRadius: '8px',
                                    fontSize: '14px',
                                    transition: 'all 0.2s',
                                    boxSizing: 'border-box',
                                    marginTop: '8px'
                                }}
                                onFocus={(e) => {
                                    e.target.style.borderColor = '#1565c0';
                                    e.target.style.boxShadow = '0 0 0 3px rgba(21, 101, 192, 0.1)';
                                }}
                                onBlur={(e) => {
                                    e.target.style.borderColor = '#e0e7ff';
                                    e.target.style.boxShadow = 'none';
                                }}
                            />
                        )}
                        <small style={{
                            display: 'block',
                            marginTop: '6px',
                            color: '#6b7280',
                            fontSize: '12px'
                        }}>
                            {showCustomDataType
                                ? 'Nhập tên loại dữ liệu tùy chỉnh. Tên sẽ hiển thị trên các biểu đồ'
                                : 'Chọn từ danh sách hoặc chọn "Nhập tùy chỉnh" để nhập tên riêng'}
                        </small>
                    </div>

                    {/* Dropdown chọn đơn vị */}
                    <div>
                        <label style={{
                            display: 'block',
                            marginBottom: '8px',
                            fontWeight: '600',
                            color: '#374151',
                            fontSize: '14px'
                        }}>
                            Đơn vị đo <span style={{ color: '#dc3545' }}>*</span>
                        </label>
                        <select
                            value={unit}
                            onChange={(e) => setUnit(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '10px 14px',
                                border: '1px solid #e0e7ff',
                                borderRadius: '8px',
                                fontSize: '14px',
                                background: '#ffffff',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                boxSizing: 'border-box',
                                appearance: 'none',
                                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23374151' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                                backgroundRepeat: 'no-repeat',
                                backgroundPosition: 'right 14px center',
                                paddingRight: '40px'
                            }}
                            onFocus={(e) => {
                                e.target.style.borderColor = '#1565c0';
                                e.target.style.boxShadow = '0 0 0 3px rgba(21, 101, 192, 0.1)';
                            }}
                            onBlur={(e) => {
                                e.target.style.borderColor = '#e0e7ff';
                                e.target.style.boxShadow = 'none';
                            }}
                        >
                            <option value="mm">mm (millimeters)</option>
                            <option value="m³/s">m³/s (cubic meters/second)</option>
                            <option value="°C">°C (Celsius)</option>
                            <option value="°F">°F (Fahrenheit)</option>
                            <option value="K">K (Kelvin)</option>
                            <option value="m/s">m/s (meters/second)</option>
                            <option value="km/h">km/h (kilometers/hour)</option>
                            <option value="mph">mph (miles/hour)</option>
                        </select>
                        <small style={{
                            display: 'block',
                            marginTop: '6px',
                            color: '#6b7280',
                            fontSize: '12px'
                        }}>
                            Đơn vị đo lường sẽ hiển thị trên các trục biểu đồ
                        </small>
                    </div>
                </div>
            </div>


            {tableData.length > 0 && (
                <div className={styles.handsontableContainer}>
                    <div className={styles.yearInputContainer}>
                        <label className={styles.yearInputLabel}>
                            Tên cột năm:
                            <input
                                type="text"
                                className={styles.customColumnNameInput}
                                value={columnNames.year}
                                readOnly="true"

                            />
                        </label>
                        {!isYearly && (
                            <label className={styles.yearInputLabel}>
                                Tên cột tháng:
                                <input
                                    type="text"
                                    className={styles.customColumnNameInput}
                                    value={columnNames.month}
                                    readOnly="true"

                                />
                            </label>
                        )}
                        <label className={styles.yearInputLabel}>
                            Tên cột Rainfall:
                            <input
                                type="text"
                                className={styles.customColumnNameInput}
                                value={columnNames.rainfall}
                                onChange={(e) => handleColumnNameChange("rainfall", e.target.value)}
                            />
                        </label>
                    </div>
                    <div className="handsontable-container">
                        <Handsontable
                            key={isYearly ? `yearly-${tableData.length}` : `monthly-${tableData.length}`}
                            ref={hotRef}
                            data={tableData}
                            colHeaders={
                                isYearly
                                    ? [columnNames.year, columnNames.rainfall]
                                    : [columnNames.year, columnNames.month, columnNames.rainfall]
                            }
                            rowHeaders={true}
                            columns={
                                isYearly
                                    ? [
                                        { data: 0, readOnly: true, className: "col-year" },
                                        { data: 1, className: "col-rainfall" },
                                    ]
                                    : [
                                        { data: 0, readOnly: true, className: "col-year" },
                                        { data: 1, readOnly: true, className: "col-month" },
                                        { data: 2, className: "col-rainfall" },
                                    ]
                            }
                            licenseKey="non-commercial-and-evaluation"
                            dragToScroll={true}
                            dragToFill={true}
                            autoFill={true}
                            colWidths={isYearly ? [200, 230] : [150, 150, 150]}
                        />

                        <button className={styles.submitButton} onClick={handleSubmit} disabled={isLoading}>
                            {isLoading ? (
                                <>
                                    <FontAwesomeIcon icon={faSpinner} className="loading-spinner me-2" />
                                    Đang tính toán...
                                </>
                            ) : (
                                'Tính Toán'
                            )}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default DataInputForm;