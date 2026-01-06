// FrequencyCurveConfigModal.js
// Modal để cấu hình các thông số cho frequency curve chart
import React, { useState, useEffect, useContext } from 'react';
import { Modal, Form, Select, InputNumber, Button, Divider, Space, Typography, Alert } from 'antd';
import { SettingOutlined, ReloadOutlined } from '@ant-design/icons';
import { ChartSettingsContext } from '../context/chartSettingsContext';
import { ModelContext } from '../context/selectedModelContext';

const { Text, Title } = Typography;

const FrequencyCurveConfigModal = ({ visible, onOk, onCancel }) => {
    const [form] = Form.useForm();
    const { settings, updateSettings, resetSettings, getMethodDescription, getLineStyleDescription } = useContext(ChartSettingsContext);
    const { selectedModel } = useContext(ModelContext);
    const [hasChanges, setHasChanges] = useState(false);

    // Initialize form với current settings
    useEffect(() => {
        if (visible) {
            form.setFieldsValue(settings);
            setHasChanges(false);
        }
    }, [visible, settings, form]);

    // Track changes
    const handleValuesChange = () => {
        setHasChanges(true);
    };

    const handleOk = () => {
        form.validateFields().then(values => {
            updateSettings(values);
            setHasChanges(false);
            if (onOk) onOk(values);
        }).catch(err => {
            console.error('Validation failed:', err);
        });
    };

    const handleReset = () => {
        form.setFieldsValue({
            method: 'auto',
            lineStyle: 'solid',
            lineWidth: 2
        });
        resetSettings();
        setHasChanges(false);
    };

    const handleCancel = () => {
        // Reset form về giá trị ban đầu nếu có thay đổi chưa lưu
        if (hasChanges) {
            form.setFieldsValue(settings);
        }
        setHasChanges(false);
        if (onCancel) onCancel();
    };

    // Distribution options
    const distributionOptions = [
        { label: 'Gumbel', value: 'gumbel', momSupported: true },
        { label: 'Lognormal', value: 'lognorm', momSupported: true },
        { label: 'Gamma', value: 'gamma', momSupported: true },
        { label: 'Logistic', value: 'logistic', momSupported: true },
        { label: 'Exponential', value: 'expon', momSupported: true },
        { label: 'Pearson III', value: 'pearson3', momSupported: false },
        { label: 'Generalized Extreme Value', value: 'genextreme', momSupported: false },
        { label: 'Generalized Pareto', value: 'genpareto', momSupported: false },
        { label: 'Frechet', value: 'frechet', momSupported: false }
    ];

    // Method options
    const methodOptions = [
        { 
            label: 'Tự động', 
            value: 'auto',
            description: 'MOM cho Gumbel (FFC 2008), MLE cho các distribution khác'
        },
        { 
            label: 'Phương pháp Moments (MOM)', 
            value: 'mom',
            description: 'Nhanh hơn, phù hợp với FFC 2008. Hỗ trợ: Gumbel, Lognormal, Gamma, Logistic, Exponential'
        },
        { 
            label: 'Maximum Likelihood (MLE)', 
            value: 'mle',
            description: 'Chính xác hơn nhưng chậm hơn. Hỗ trợ tất cả distributions'
        }
    ];

    // Line style options
    const lineStyleOptions = [
        { label: 'Liền nét', value: 'solid' },
        { label: 'Nét đứt', value: 'dashed' },
        { label: 'Nét chấm', value: 'dotted' }
    ];

    // Check if current distribution supports MOM
    const currentDist = distributionOptions.find(d => d.value === selectedModel);
    const momSupported = currentDist?.momSupported || false;

    return (
        <Modal
            title={
                <Space>
                    <SettingOutlined />
                    <span>Cấu hình Frequency Curve</span>
                </Space>
            }
            open={visible}
            onOk={handleOk}
            onCancel={handleCancel}
            width={600}
            okText="Áp dụng"
            cancelText="Hủy"
            footer={[
                <Button key="reset" icon={<ReloadOutlined />} onClick={handleReset}>
                    Đặt lại mặc định
                </Button>,
                <Button key="cancel" onClick={handleCancel}>
                    Hủy
                </Button>,
                <Button key="ok" type="primary" onClick={handleOk}>
                    Áp dụng
                </Button>
            ]}
        >
            <Form
                form={form}
                layout="vertical"
                onValuesChange={handleValuesChange}
            >
                {/* Current Distribution Info */}
                {selectedModel && selectedModel !== 'null' && (
                    <Alert
                        message={`Phân bố hiện tại: ${currentDist?.label || selectedModel}`}
                        description={
                            momSupported 
                                ? "Phân bố này hỗ trợ cả MOM và MLE"
                                : "Phân bố này chỉ hỗ trợ MLE (MOM không khả thi)"
                        }
                        type="info"
                        showIcon
                        style={{ marginBottom: 16 }}
                    />
                )}

                {/* Method Selection */}
                <Form.Item
                    name="method"
                    label={
                        <Space>
                            <Text strong>Xác định thông số</Text>
                            <Text type="secondary" style={{ fontSize: '12px' }}>
                                ({getMethodDescription(form.getFieldValue('method') || settings.method)})
                            </Text>
                        </Space>
                    }
                    tooltip="Chọn phương pháp ước lượng tham số phân phối"
                    rules={[{ required: true, message: 'Vui lòng chọn phương pháp' }]}
                >
                    <Select
                        options={methodOptions}
                        onChange={(value) => {
                            form.setFieldsValue({ method: value });
                            handleValuesChange();
                        }}
                    />
                </Form.Item>

                {/* Method Description */}
                {form.getFieldValue('method') && (
                    <Alert
                        message={methodOptions.find(m => m.value === form.getFieldValue('method'))?.description}
                        type="info"
                        showIcon={false}
                        style={{ marginBottom: 16, fontSize: '12px' }}
                    />
                )}

                <Divider />

                {/* Line Style */}
                <Form.Item
                    name="lineStyle"
                    label={
                        <Space>
                            <Text strong>Kiểu đường</Text>
                            <Text type="secondary" style={{ fontSize: '12px' }}>
                                ({getLineStyleDescription(form.getFieldValue('lineStyle') || settings.lineStyle)})
                            </Text>
                        </Space>
                    }
                    tooltip="Chọn kiểu vẽ đường cong lý thuyết"
                    rules={[{ required: true, message: 'Vui lòng chọn kiểu đường' }]}
                >
                    <Select options={lineStyleOptions} />
                </Form.Item>

                {/* Line Width */}
                <Form.Item
                    name="lineWidth"
                    label={<Text strong>Độ dày đường</Text>}
                    tooltip="Độ dày đường cong (1-5 pixels)"
                    rules={[
                        { required: true, message: 'Vui lòng nhập độ dày' },
                        { type: 'number', min: 1, max: 5, message: 'Độ dày phải từ 1 đến 5' }
                    ]}
                >
                    <InputNumber
                        min={1}
                        max={5}
                        style={{ width: '100%' }}
                        addonAfter="pixels"
                    />
                </Form.Item>

                {/* Preview Info */}
                <Alert
                    message="Thông tin"
                    description={
                        <ul style={{ marginBottom: 0, paddingLeft: 20 }}>
                            <li>Thay đổi sẽ được áp dụng ngay sau khi nhấn "Áp dụng"</li>
                            <li>Cài đặt sẽ được lưu tự động và áp dụng cho các lần sau</li>
                            <li>FFC 2008 khuyến nghị dùng MOM cho Gumbel</li>
                        </ul>
                    }
                    type="info"
                    showIcon
                />
            </Form>
        </Modal>
    );
};

export default FrequencyCurveConfigModal;






