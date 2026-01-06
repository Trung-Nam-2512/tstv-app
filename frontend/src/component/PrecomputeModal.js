import React from 'react';
import { Modal, Progress, List, Typography, Space, Tag, Divider } from 'antd';
import { 
    LoadingOutlined, 
    CheckCircleOutlined, 
    ClockCircleOutlined,
    CloseCircleOutlined,
    BarChartOutlined
} from '@ant-design/icons';
import './PrecomputeModal.css';

const { Title, Text } = Typography;

/**
 * PrecomputeModal - Modal hiển thị tiến trình pre-compute distributions
 * 
 * Props:
 * - visible: boolean - Hiển thị modal
 * - progress: object - { current, total, percentage, currentModel, timing }
 * - distributionStatus: array - [{ name, displayName, status, time }]
 */
const PrecomputeModal = ({ visible, progress, distributionStatus }) => {
    const { current, total, percentage, currentModel } = progress;
    
    // Tính tổng thời gian đã dùng
    const totalTime = Object.values(progress.timing || {})
        .reduce((sum, time) => sum + time, 0);
    
    // Estimate remaining time
    const avgTime = totalTime / current || 0;
    const remainingTime = avgTime * (total - current);
    
    // Format time display
    const formatTime = (seconds) => {
        if (seconds < 60) {
            return `${seconds.toFixed(1)}s`;
        }
        const mins = Math.floor(seconds / 60);
        const secs = (seconds % 60).toFixed(0);
        return `${mins}m ${secs}s`;
    };
    
    return (
        <Modal
            open={visible}
            closable={false}
            footer={null}
            centered
            width={520}
            className="precompute-modal"
            maskClosable={false}
        >
            <div className="precompute-content">
                {/* Header */}
                <div className="precompute-header">
                    <div className="header-icon">
                        <BarChartOutlined />
                    </div>
                    <Title level={4} className="header-title">
                        Phân tích các mô hình phân phối
                    </Title>
                    <Text className="header-subtitle">
                        Đang xử lý dữ liệu và tính toán các tham số phân phối
                    </Text>
                </div>
                
                <Divider style={{ margin: '16px 0' }} />
                
                {/* Progress Circle */}
                <div className="precompute-progress">
                    <Progress
                        type="circle"
                        percent={percentage}
                        strokeColor={{
                            '0%': '#3b82f6',
                            '50%': '#10b981',
                            '100%': '#059669',
                        }}
                        strokeWidth={8}
                        width={140}
                        trailColor="#e5e7eb"
                        format={() => (
                            <div className="progress-content">
                                <div className="progress-percentage">
                                    {percentage}%
                                </div>
                                <div className="progress-fraction">
                                    {current} / {total}
                                </div>
                            </div>
                        )}
                    />
                </div>
                
                {/* Current Model Status */}
                {currentModel && (
                    <div className="current-model">
                        <div className="current-model-content">
                            <LoadingOutlined className="current-model-icon" />
                            <div className="current-model-text">
                                <Text className="current-model-label">Đang xử lý:</Text>
                                <Text className="current-model-name">{currentModel}</Text>
                            </div>
                        </div>
                    </div>
                )}
                
                {/* Time Info */}
                <div className="time-info">
                    <div className="time-info-item">
                        <ClockCircleOutlined className="time-icon" />
                        <div className="time-content">
                            <Text className="time-label">Thời gian đã dùng</Text>
                            <Text className="time-value">{formatTime(totalTime)}</Text>
                        </div>
                    </div>
                    {remainingTime > 0 && (
                        <>
                            <div className="time-divider" />
                            <div className="time-info-item">
                                <ClockCircleOutlined className="time-icon" />
                                <div className="time-content">
                                    <Text className="time-label">Thời gian còn lại</Text>
                                    <Text className="time-value estimate">{formatTime(remainingTime)}</Text>
                                </div>
                            </div>
                        </>
                    )}
                </div>
                
                {/* Distribution Status List */}
                <div className="distribution-list-container">
                    <Text className="distribution-list-title">Trạng thái các mô hình:</Text>
                    <div className="distribution-list">
                        <List
                            size="small"
                            dataSource={distributionStatus}
                            renderItem={item => (
                                <List.Item className={`distribution-item status-${item.status}`}>
                                    <div className="distribution-item-content">
                                        <div className="distribution-item-left">
                                            {item.status === 'completed' && (
                                                <CheckCircleOutlined className="status-icon status-completed-icon" />
                                            )}
                                            {item.status === 'computing' && (
                                                <LoadingOutlined className="status-icon status-computing-icon" />
                                            )}
                                            {item.status === 'pending' && (
                                                <ClockCircleOutlined className="status-icon status-pending-icon" />
                                            )}
                                            {item.status === 'error' && (
                                                <CloseCircleOutlined className="status-icon status-error-icon" />
                                            )}
                                            <Text className={`distribution-name ${item.status === 'computing' ? 'computing' : ''}`}>
                                                {item.displayName}
                                            </Text>
                                        </div>
                                        
                                        {item.time !== undefined && item.status === 'completed' && (
                                            <Tag className="time-tag" color="default">
                                                {item.time.toFixed(2)}s
                                            </Tag>
                                        )}
                                    </div>
                                </List.Item>
                            )}
                        />
                    </div>
                </div>
                
                {/* Progress Bar */}
                <div className="progress-bar-container">
                    <Progress 
                        percent={percentage}
                        strokeColor={{
                            '0%': '#3b82f6',
                            '100%': '#10b981',
                        }}
                        showInfo={false}
                        strokeWidth={4}
                        trailColor="#e5e7eb"
                    />
                </div>
            </div>
        </Modal>
    );
};

export default PrecomputeModal;
