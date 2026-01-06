import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Map, { Marker, NavigationControl, ScaleControl, GeolocateControl } from 'react-map-gl';
import {
  Card, Row, Col, Slider, Select, InputNumber, Button, Spin,
  Alert, Collapse, Space, Divider, Typography, Tooltip, message, Progress,
  Checkbox, Tag
} from 'antd';
import {
  EnvironmentOutlined, ThunderboltOutlined, CloudOutlined,
  InfoCircleOutlined, SettingOutlined, AimOutlined, CheckCircleOutlined
} from '@ant-design/icons';
import Config from '../config/config';
import { useAnalysis } from '../context/analysisContext';
import { useFileInfo } from '../context/fileInfoContext';
import PrecomputeModal from './PrecomputeModal';
import 'mapbox-gl/dist/mapbox-gl.css';
import '../assets/rainfallAnalysis.css';

const { Text } = Typography;
const { Option } = Select;
const { Panel } = Collapse;
const { CheckableTag } = Tag;

// Danh sách tất cả các mô hình phân phối
const ALL_DISTRIBUTIONS = [
  { name: 'gumbel', displayName: 'Gumbel', description: 'Phổ biến cho dữ liệu cực trị', recommended: true },
  { name: 'lognorm', displayName: 'Log-Normal', description: 'Dữ liệu lệch phải' },
  { name: 'gamma', displayName: 'Gamma', description: 'Dữ liệu dương' },
  { name: 'logistic', displayName: 'Logistic', description: 'Tương tự Gumbel' },
  { name: 'expon', displayName: 'Exponential', description: 'Sự kiện hiếm' },
  { name: 'genextreme', displayName: 'GEV', description: 'Tổng quát hóa Gumbel', recommended: true },
  { name: 'genpareto', displayName: 'GPD', description: 'Cực trị vượt ngưỡng' },
  { name: 'frechet', displayName: 'Frechet', description: 'Đuôi nặng bên phải' },
  { name: 'pearson3', displayName: 'Pearson III', description: 'Linh hoạt với Cs' }
];

const RainfallAnalysis = () => {
  const navigate = useNavigate();
  const { setCacheResults, setIsPrecomputing, setPrecomputeProgress, clearCache } = useAnalysis();
  const { updateFileInfo } = useFileInfo();
  
  // State cho việc chọn mô hình
  const [selectedModels, setSelectedModels] = useState(() => {
    // Mặc định chọn các mô hình phổ biến nhất
    return ['gumbel', 'lognorm', 'genextreme', 'gamma'];
  });
  
  const [viewport, setViewport] = useState({
    latitude: 16.0,
    longitude: 106.0,
    zoom: 5.5
  });
  const [markerPosition, setMarkerPosition] = useState(null);
  const mapRef = useRef();

  // Cleanup Mapbox on unmount to prevent memory leaks
  useEffect(() => {
    const mapInstance = mapRef.current;
    return () => {
      if (mapInstance) {
        const map = mapInstance.getMap();
        if (map) {
          map.remove(); // Cleanup Mapbox GL instance
        }
      }
    };
  }, []);

  const [parameters, setParameters] = useState({
    days: 90,
    data_field: 'max',
    min_threshold: 0.5,
    k: 10,
    power: 2.0
  });

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');
  
  // Distribution statuses for PrecomputeModal - chỉ hiển thị mô hình được chọn
  const [distributionStatus, setDistributionStatus] = useState(() => 
    ALL_DISTRIBUTIONS.map(d => ({ ...d, status: 'pending' }))
  );
  
  // Hàm toggle chọn mô hình
  const handleModelToggle = (modelName, checked) => {
    if (checked) {
      setSelectedModels(prev => [...prev, modelName]);
    } else {
      // Phải chọn ít nhất 1 mô hình
      if (selectedModels.length > 1) {
        setSelectedModels(prev => prev.filter(m => m !== modelName));
      } else {
        message.warning('Phải chọn ít nhất 1 mô hình');
      }
    }
  };
  
  // Chọn tất cả mô hình
  const selectAllModels = () => {
    setSelectedModels(ALL_DISTRIBUTIONS.map(d => d.name));
  };
  
  // Chỉ chọn mô hình khuyến nghị
  const selectRecommendedModels = () => {
    setSelectedModels(ALL_DISTRIBUTIONS.filter(d => d.recommended).map(d => d.name));
  };

  const handleMapClick = (event) => {
    const { lngLat } = event;
    setMarkerPosition({
      latitude: lngLat.lat,
      longitude: lngLat.lng
    });
  };

  const updateProgress = (percent, text) => {
    setProgress(percent);
    setProgressText(text);
  };

  const analyzeRainfall = async () => {
    if (!markerPosition) {
      message.warning('Vui lòng chọn điểm trên bản đồ');
      return;
    }
    
    if (selectedModels.length === 0) {
      message.warning('Vui lòng chọn ít nhất 1 mô hình để phân tích');
      return;
    }

    setLoading(true);
    setIsPrecomputing(true);
    setProgress(0);
    setProgressText('Đang khởi tạo...');
    
    // QUAN TRỌNG: Clear cache cũ trước khi phân tích mới
    // Điều này đảm bảo không có nhầm lẫn giữa các nguồn dữ liệu
    clearCache();
    
    // Reset distribution status - chỉ cho các mô hình được chọn
    setDistributionStatus(ALL_DISTRIBUTIONS.map(d => ({ 
      ...d, 
      status: selectedModels.includes(d.name) ? 'pending' : 'skipped',
      time: undefined 
    })));
    
    try {
      // STEP 1: Load dữ liệu mưa
      updateProgress(10, 'Đang tải dữ liệu mưa từ API...');
      
      const analyzeResponse = await fetch(`${Config.BASE_URL}/rainfall/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: markerPosition.latitude,
          longitude: markerPosition.longitude,
          ...parameters
        })
      });

      if (!analyzeResponse.ok) {
        const errorData = await analyzeResponse.json();
        throw new Error(errorData.detail || 'Failed to fetch rainfall data');
      }
      
      const analyzeData = await analyzeResponse.json();
      updateProgress(30, 'Dữ liệu đã tải xong');
      
      // Set fileInfo context để biểu đồ hiển thị đúng label
      updateFileInfo({
        dataType: parameters.data_field === 'rainfall' ? 'Lượng mưa' : 
                  parameters.data_field === 'total_24h' ? 'Tổng lượng mưa 24h' : 'Lượng mưa',
        unit: 'mm',
        fileExtension: '',
        fileName: `Rainfall_${markerPosition.latitude.toFixed(2)}_${markerPosition.longitude.toFixed(2)}`,
        isValid: true
      });
      
      // Check quality
      if (analyzeData.quality_assessment?.quality_score < 40) {
        message.warning('Chất lượng dữ liệu thấp. Kết quả có thể không tin cậy.');
      }
      
      // STEP 2: Pre-compute CHỈ các distributions được chọn
      updateProgress(35, `Bắt đầu phân tích ${selectedModels.length} mô hình...`);
      
      const agg_func = parameters.data_field === 'rainfall' ? 'max' : 
                       parameters.data_field === 'total_24h' ? 'sum' : 'max';
      
      // Gọi API với danh sách mô hình được chọn
      const precomputeResponse = await fetch(
        `${Config.BASE_URL}/analysis/precompute_all?agg_func=${agg_func}&distributions=${selectedModels.join(',')}`,
        { method: 'POST' }
      );
      
      if (!precomputeResponse.ok) {
        throw new Error('Failed to precompute distributions');
      }
      
      const precomputeData = await precomputeResponse.json();
      
      // Update progress dựa trên results
      const { results, timing, summary } = precomputeData;
      
      // Update distribution status với timing info
      setDistributionStatus(prev => prev.map(d => {
        if (!selectedModels.includes(d.name)) {
          return { ...d, status: 'skipped' };
        }
        return {
          ...d,
          status: results[d.name] ? 'completed' : 'error',
          time: timing[d.name]
        };
      }));
      
      // Update precompute progress
      setPrecomputeProgress({
        current: summary.success,
        total: summary.total,
        percentage: Math.round((summary.success / summary.total) * 100),
        currentModel: '',
        timing: timing
      });
      
      updateProgress(95, `Đã phân tích ${summary.success}/${summary.total} mô hình`);
      
      // STEP 3: Lưu vào cache VỚI METADATA đầy đủ
      // QUAN TRỌNG: Thêm locationInfo để phân biệt với các phiên phân tích khác
      setCacheResults(results, 'rainfall_api', agg_func, {
        locationInfo: {
          latitude: markerPosition.latitude,
          longitude: markerPosition.longitude
        },
        selectedModels: selectedModels
      });
      
      updateProgress(100, 'Hoàn tất!');
      
      // STEP 4: Navigate to results với delay để UI không bị block
      const navigateToResults = () => {
        setIsPrecomputing(false);
        // Small delay để đảm bảo cache đã được set
        setTimeout(() => {
          navigate('/ket-qua');
        }, 100);
      };
      
      if (window.requestIdleCallback) {
        requestIdleCallback(() => {
          message.success({
            content: `Phân tích thành công ${summary.success}/${summary.total} mô hình! Đang chuyển đến trang kết quả...`,
            duration: 2
          });
          setTimeout(navigateToResults, 300);
        }, { timeout: 1000 });
      } else {
        setTimeout(() => {
          message.success({
            content: `Phân tích thành công ${summary.success}/${summary.total} mô hình! Đang chuyển đến trang kết quả...`,
            duration: 2
          });
          setTimeout(navigateToResults, 300);
        }, 500);
      }
      
    } catch (error) {
      console.error('Error:', error);
      message.error(`Lỗi: ${error.message}`);
      setLoading(false);
      setIsPrecomputing(false);
      setProgress(0);
    }
  };

  const getSuggestions = async () => {
    if (!markerPosition) {
      message.warning('Vui lòng chọn điểm trên bản đồ');
      return;
    }

    try {
      const response = await fetch(`${Config.BASE_URL}/rainfall/suggest-params`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: markerPosition.latitude,
          longitude: markerPosition.longitude,
          ...parameters
        })
      });

      const data = await response.json();
      
      if (data.optimization.has_suggestions) {
        message.info({
          content: (
            <div>
              <Text strong>Khuyến nghị:</Text>
              {Object.keys(data.optimization.suggestions).map(key => {
                const sug = data.optimization.suggestions[key];
                return (
                  <div key={key}>
                    {key}: {sug.current} → {sug.suggested}
                  </div>
                );
              })}
            </div>
          ),
          duration: 5
        });
      } else {
        message.success('Parameters hiện tại đã tốt!');
      }
    } catch (error) {
      console.error('Error:', error);
      message.error('Lỗi khi lấy suggestions');
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5', padding: '24px' }}>
      {/* Pre-compute Modal */}
      <PrecomputeModal
        visible={loading}
        progress={{
          current: distributionStatus.filter(d => d.status === 'completed').length,
          total: distributionStatus.length,
          percentage: progress,
          currentModel: progressText,
          timing: distributionStatus.reduce((acc, d) => {
            if (d.time !== undefined) acc[d.name] = d.time;
            return acc;
          }, {})
        }}
        distributionStatus={distributionStatus}
      />
      
      <Row gutter={24} style={{ height: '100%' }}>
        {/* Left Panel - Map */}
        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <EnvironmentOutlined />
                <span>Chọn vị trí phân tích</span>
              </Space>
            }
            style={{ marginBottom: 16, height: '100%' }}
          >
            <div style={{ height: '500px', width: '100%', borderRadius: 8, overflow: 'hidden' }}>
              <Map
                {...viewport}
                onMove={evt => setViewport(evt.viewState)}
                onClick={handleMapClick}
                mapStyle="mapbox://styles/mapbox/streets-v12"
                mapboxAccessToken={Config.MAPBOX_ACCESS_TOKEN}
                ref={mapRef}
                style={{ width: '100%', height: '100%' }}
              >
                {markerPosition && (
                  <Marker
                    latitude={markerPosition.latitude}
                    longitude={markerPosition.longitude}
                    anchor="bottom"
                  >
                    <AimOutlined style={{ fontSize: 32, color: '#ff4d4f' }} />
                  </Marker>
                )}
                <NavigationControl position="top-right" />
                <ScaleControl />
                <GeolocateControl />
              </Map>
            </div>

            {markerPosition && (
              <Alert
                message="Tọa độ đã chọn"
                description={
                  <Text code>
                    Lat: {markerPosition.latitude.toFixed(4)}, 
                    Lng: {markerPosition.longitude.toFixed(4)}
                  </Text>
                }
                type="info"
                showIcon
                icon={<EnvironmentOutlined />}
                style={{ marginTop: 16 }}
              />
            )}
          </Card>
        </Col>

        {/* Right Panel - Parameters */}
        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <SettingOutlined />
                <span>Tham số phân tích</span>
              </Space>
            }
            style={{ height: '100%' }}
          >
            {loading ? (
              <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                <Spin size="large" />
                <div style={{ marginTop: 24 }}>
                  <Progress
                    percent={progress}
                    status="active"
                    strokeColor={{
                      '0%': '#667eea',
                      '100%': '#764ba2',
                    }}
                    style={{ maxWidth: 400, margin: '0 auto' }}
                  />
                  <Text style={{ display: 'block', marginTop: 16, fontSize: 16, color: '#666' }}>
                    {progressText}
                  </Text>
                  <Text style={{ display: 'block', marginTop: 8, fontSize: 14, color: '#999' }}>
                    {progress}%
                  </Text>
                </div>
              </div>
            ) : (
              <Space direction="vertical" style={{ width: '100%' }} size="large">
                {/* Days */}
                <div>
                  <Text strong>Số ngày: {parameters.days}</Text>
                  <Slider
                    min={30}
                    max={180}
                    value={parameters.days}
                    onChange={(val) => setParameters({ ...parameters, days: val })}
                    marks={{ 30: '30', 90: '90', 180: '180' }}
                  />
                </div>

                {/* Data field */}
                <div>
                  <Text strong>Trường dữ liệu:</Text>
                  <Select
                    value={parameters.data_field}
                    onChange={(val) => setParameters({ ...parameters, data_field: val })}
                    style={{ width: '100%', marginTop: 8 }}
                  >
                    <Option value="rainfall">Rainfall</Option>
                    <Option value="max">Max ⭐</Option>
                    <Option value="mean">Mean</Option>
                    <Option value="min">Min</Option>
                    <Option value="sum">Sum</Option>
                  </Select>
                </div>

                {/* Min threshold */}
                <div>
                  <Text strong>Ngưỡng tối thiểu (mm):</Text>
                  <InputNumber
                    min={0}
                    max={10}
                    step={0.1}
                    value={parameters.min_threshold}
                    onChange={(val) => setParameters({ ...parameters, min_threshold: val })}
                    style={{ width: '100%', marginTop: 8 }}
                  />
                </div>

                {/* Model Selection - QUAN TRỌNG để tăng tốc */}
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    marginBottom: '12px'
                  }}>
                    <Text strong>Chọn mô hình phân tích ({selectedModels.length}/{ALL_DISTRIBUTIONS.length}):</Text>
                    <Space>
                      <Button size="small" onClick={selectRecommendedModels}>
                        Khuyến nghị
                      </Button>
                      <Button size="small" onClick={selectAllModels}>
                        Chọn tất cả
                      </Button>
                    </Space>
                  </div>
                  <div style={{ 
                    display: 'flex', 
                    flexWrap: 'wrap', 
                    gap: '8px',
                    padding: '12px',
                    background: '#f5f5f5',
                    borderRadius: '8px'
                  }}>
                    {ALL_DISTRIBUTIONS.map(model => (
                      <Tooltip key={model.name} title={model.description}>
                        <CheckableTag
                          checked={selectedModels.includes(model.name)}
                          onChange={(checked) => handleModelToggle(model.name, checked)}
                          style={{
                            border: selectedModels.includes(model.name) 
                              ? '1px solid #1890ff' 
                              : '1px solid #d9d9d9',
                            borderRadius: '4px',
                            padding: '4px 12px',
                            cursor: 'pointer'
                          }}
                        >
                          {model.displayName}
                          {model.recommended && (
                            <CheckCircleOutlined style={{ marginLeft: 4, color: '#52c41a' }} />
                          )}
                        </CheckableTag>
                      </Tooltip>
                    ))}
                  </div>
                  <Text type="secondary" style={{ fontSize: '12px', display: 'block', marginTop: '8px' }}>
                    Chọn ít mô hình hơn để tăng tốc độ phân tích. Mô hình có ✓ là khuyến nghị.
                  </Text>
                </div>

                {/* Advanced parameters */}
                <Collapse ghost>
                  <Panel header="Tham số nâng cao" key="1">
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <div>
                        <Text>Số trạm (k): {parameters.k}</Text>
                        <Slider
                          min={3}
                          max={20}
                          value={parameters.k}
                          onChange={(val) => setParameters({ ...parameters, k: val })}
                        />
                      </div>
                      <div>
                        <Text>Power IDW: {parameters.power}</Text>
                        <Slider
                          min={1}
                          max={5}
                          step={0.1}
                          value={parameters.power}
                          onChange={(val) => setParameters({ ...parameters, power: val })}
                        />
                      </div>
                    </Space>
                  </Panel>
                </Collapse>

                <Divider />

                {/* Action buttons */}
                <Space style={{ width: '100%' }} direction="vertical">
                  <Button
                    type="primary"
                    icon={<ThunderboltOutlined />}
                    onClick={analyzeRainfall}
                    disabled={!markerPosition || selectedModels.length === 0}
                    block
                    size="large"
                    style={{
                      height: '50px',
                      fontSize: '16px',
                      fontWeight: 600
                    }}
                  >
                    Phân tích {selectedModels.length} mô hình
                  </Button>
                  <Tooltip title="Nhận gợi ý tối ưu parameters">
                    <Button
                      icon={<InfoCircleOutlined />}
                      onClick={getSuggestions}
                      disabled={!markerPosition}
                      block
                    >
                      Gợi ý tối ưu
                    </Button>
                  </Tooltip>
                </Space>

                {!markerPosition && (
                  <Alert
                    message="Hướng dẫn"
                    description="Click vào bất kỳ điểm nào trên bản đồ Việt Nam để chọn vị trí phân tích"
                    type="info"
                    showIcon
                    icon={<CloudOutlined />}
                  />
                )}
              </Space>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default RainfallAnalysis;
