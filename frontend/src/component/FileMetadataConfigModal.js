// FileMetadataConfigModal.js
// Modal để người dùng cấu hình metadata (dataType và unit) cho file
import React, { useState, useEffect } from 'react';
import { Modal, Form, Button, Alert } from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faInfoCircle, faCog } from '@fortawesome/free-solid-svg-icons';

const FileMetadataConfigModal = ({
    show,
    onConfirm,
    onSkip,
    fileName,
    parsedData = null
}) => {
    const [dataType, setDataType] = useState('');
    const [unit, setUnit] = useState('');
    const [errors, setErrors] = useState({});

    // Initialize form với giá trị parsed (nếu có)
    useEffect(() => {
        if (show && parsedData) {
            setDataType(parsedData.dataType !== 'Unknown' ? parsedData.dataType : '');
            setUnit(parsedData.unit !== 'Unknown' ? parsedData.unit : '');
        } else if (show) {
            // Reset form khi mở modal
            setDataType('');
            setUnit('');
        }
        setErrors({});
    }, [show, parsedData]);

    const validate = () => {
        const newErrors = {};
        if (!dataType.trim()) {
            newErrors.dataType = 'Vui lòng nhập loại dữ liệu';
        }
        if (!unit.trim()) {
            newErrors.unit = 'Vui lòng nhập đơn vị';
        }
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleConfirm = () => {
        if (validate()) {
            onConfirm({
                dataType: dataType.trim(),
                unit: unit.trim(),
                fileExtension: fileName ? fileName.split('.').pop().toLowerCase() : '',
                isValid: true
            });
        }
    };

    const handleSkip = () => {
        // Dùng giá trị parsed nếu có, nếu không thì dùng giá trị mặc định
        if (onSkip) {
            onSkip(parsedData || {
                dataType: "Unknown",
                unit: "Unknown",
                fileExtension: fileName ? fileName.split('.').pop().toLowerCase() : '',
                isValid: false
            });
        }
    };

    // Common data types và units suggestions
    const dataTypeSuggestions = [
        'Rainfall', 'Lượng mưa', 'Discharge', 'Lưu lượng',
        'Temperature', 'Nhiệt độ', 'Humidity', 'Độ ẩm',
        'Water Level', 'Mực nước', 'Flow', 'Dòng chảy'
    ];

    const unitSuggestions = [
        'mm', 'm', 'm³/s', 'm³', '°C', '%', 'm/s', 'km/h'
    ];

    return (
        <Modal
            show={show}
            onHide={handleSkip}
            centered
            size="lg"
            backdrop="static"
            keyboard={false}
        >
            <Modal.Header
                style={{
                    background: 'linear-gradient(135deg, #0d47a1 0%, #1565c0 100%)',
                    color: '#ffffff',
                    borderBottom: 'none'
                }}
            >
                <Modal.Title style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    fontWeight: '600'
                }}>
                    <FontAwesomeIcon icon={faCog} />
                    Cấu hình thông tin dữ liệu
                </Modal.Title>
            </Modal.Header>
            <Modal.Body style={{ padding: '24px' }}>
                {fileName && (
                    <Alert variant="info" style={{ marginBottom: '20px' }}>
                        <FontAwesomeIcon icon={faInfoCircle} className="me-2" />
                        <strong>File đã chọn:</strong> {fileName}
                    </Alert>
                )}

                {parsedData && parsedData.dataType !== 'Unknown' && (
                    <Alert variant="success" style={{ marginBottom: '20px' }}>
                        <FontAwesomeIcon icon={faInfoCircle} className="me-2" />
                        <strong>Đã tự động nhận diện từ tên file:</strong> {parsedData.dataType} ({parsedData.unit})
                        <br />
                        <small>Bạn có thể chỉnh sửa hoặc bỏ qua để dùng giá trị này.</small>
                    </Alert>
                )}

                {(!parsedData || parsedData.dataType === 'Unknown') && (
                    <Alert variant="warning" style={{ marginBottom: '20px' }}>
                        <FontAwesomeIcon icon={faInfoCircle} className="me-2" />
                        <strong>Không thể tự động nhận diện từ tên file.</strong>
                        <br />
                        <small>Vui lòng nhập thông tin thủ công để biểu đồ hiển thị chính xác.</small>
                    </Alert>
                )}

                <Form>
                    <Form.Group className="mb-3">
                        <Form.Label>
                            <strong>Loại dữ liệu</strong> <span style={{ color: 'red' }}>*</span>
                        </Form.Label>
                        <Form.Control
                            type="text"
                            placeholder="Ví dụ: Lượng mưa, Lưu lượng, Nhiệt độ..."
                            value={dataType}
                            onChange={(e) => {
                                setDataType(e.target.value);
                                if (errors.dataType) {
                                    setErrors({ ...errors, dataType: '' });
                                }
                            }}
                            isInvalid={!!errors.dataType}
                            list="dataTypeSuggestions"
                        />
                        <datalist id="dataTypeSuggestions">
                            {dataTypeSuggestions.map((suggestion, idx) => (
                                <option key={idx} value={suggestion} />
                            ))}
                        </datalist>
                        {errors.dataType && (
                            <Form.Control.Feedback type="invalid">
                                {errors.dataType}
                            </Form.Control.Feedback>
                        )}
                        <Form.Text className="text-muted">
                            Tên loại dữ liệu sẽ hiển thị trên các biểu đồ
                        </Form.Text>
                    </Form.Group>

                    <Form.Group className="mb-3">
                        <Form.Label>
                            <strong>Đơn vị</strong> <span style={{ color: 'red' }}>*</span>
                        </Form.Label>
                        <Form.Control
                            type="text"
                            placeholder="Ví dụ: mm, m³/s, °C..."
                            value={unit}
                            onChange={(e) => {
                                setUnit(e.target.value);
                                if (errors.unit) {
                                    setErrors({ ...errors, unit: '' });
                                }
                            }}
                            isInvalid={!!errors.unit}
                            list="unitSuggestions"
                        />
                        <datalist id="unitSuggestions">
                            {unitSuggestions.map((suggestion, idx) => (
                                <option key={idx} value={suggestion} />
                            ))}
                        </datalist>
                        {errors.unit && (
                            <Form.Control.Feedback type="invalid">
                                {errors.unit}
                            </Form.Control.Feedback>
                        )}
                        <Form.Text className="text-muted">
                            Đơn vị đo lường sẽ hiển thị trên các trục biểu đồ
                        </Form.Text>
                    </Form.Group>
                </Form>
            </Modal.Body>
            <Modal.Footer style={{ borderTop: '1px solid #e0e0e0', padding: '16px 24px' }}>
                <Button
                    variant="outline-secondary"
                    onClick={handleSkip}
                >
                    {parsedData && parsedData.dataType !== 'Unknown'
                        ? 'Dùng giá trị tự động'
                        : 'Bỏ qua (sẽ hiển thị Unknown)'}
                </Button>
                <Button
                    variant="primary"
                    onClick={handleConfirm}
                    style={{
                        background: 'linear-gradient(135deg, #0d47a1 0%, #1565c0 100%)',
                        border: 'none',
                        fontWeight: '500'
                    }}
                >
                    Xác nhận
                </Button>
            </Modal.Footer>
        </Modal>
    );
};

export default FileMetadataConfigModal;





