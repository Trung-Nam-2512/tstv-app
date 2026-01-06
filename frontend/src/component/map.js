import React, { useState } from 'react';
import { MapContainer, TileLayer, useMapEvents, Marker, Popup } from 'react-leaflet';
import { Box, TextField, Button, Typography, Paper, Alert, CircularProgress } from '@mui/material';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { toast } from "react-toastify";
import Config from '../config/config';
// Fix icon default của Leaflet (nếu bạn gặp lỗi về icon)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
    iconUrl: require('leaflet/dist/images/marker-icon.png'),
    shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

// Component để lắng nghe sự kiện click trên bản đồ và lấy tọa độ
const LocationSelector = ({ onLocationSelect }) => {
    useMapEvents({
        click(e) {
            onLocationSelect(e.latlng);
        },
    });
    return null;
};

const MapComponent = ({ selectedPosition, onLocationSelect, loading }) => {
    return (
        <Box sx={{ position: 'relative' }}>
            <MapContainer center={selectedPosition || [16.0, 108.0]} zoom={6} style={{ height: "400px", width: "100%" }}>
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <LocationSelector onLocationSelect={onLocationSelect} />
                {selectedPosition && (
                    <Marker position={selectedPosition}>
                        <Popup>
                            Đã chọn: {selectedPosition.lat.toFixed(4)}, {selectedPosition.lng.toFixed(4)}
                        </Popup>
                    </Marker>
                )}
            </MapContainer>
            {loading && (
                <Box sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    backgroundColor: 'rgba(255, 255, 255, 0.7)',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                }}>
                    <CircularProgress />
                </Box>
            )}
        </Box>
    );
};

const Map = () => {
    const [startYear, setStartYear] = useState("");
    const [endYear, setEndYear] = useState("");
    const [selectedPosition, setSelectedPosition] = useState(null);
    const [csvUrl, setCsvUrl] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");


    const handleFetchData = async () => {
        if (!selectedPosition) {
            setError("Vui lòng chọn vị trí trên bản đồ!");
            return;
        }

        if (!startYear || !endYear) {
            setError("Vui lòng nhập đầy đủ năm bắt đầu và năm kết thúc!");
            return;
        }

        setError("");
        setLoading(true);
        setCsvUrl("");

        try {
            const { lat, lng } = selectedPosition;
            const response = await fetch(
                `${Config.BASE_URL}/data/nasa_power/clean?start_year=${startYear}&end_year=${endYear}&lat=${lat}&lon=${lng}`
            );
            
            if (!response.ok) {
                if (response.status === 404) {
                    const errorData = await response.json().catch(() => ({}));
                    const errorMessage = errorData.detail || errorData.message || 'Endpoint không tồn tại';
                    setError(`Tính năng này chưa được triển khai: ${errorMessage}`);
                    toast.warning("Tính năng lấy dữ liệu nhiệt độ NASA POWER chưa được triển khai trên backend", {
                        position: "top-center", 
                        autoClose: 3000
                    });
                } else {
                    const errorData = await response.json().catch(() => ({}));
                    const errorMessage = errorData.detail || errorData.message || `Lỗi: ${response.status}`;
                    setError(errorMessage);
                    toast.error(`Lỗi khi lấy dữ liệu: ${errorMessage}`, {
                        position: "top-center", 
                        autoClose: 3000
                    });
                }
                return;
            }
            
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            setCsvUrl(url);
            setError("");
            toast.success("Tải dữ liệu thành công! Nhấn nút Download CSV để tải về.", {
                position: "top-center", 
                autoClose: 3000
            });
        } catch (err) {
            const errorMessage = err.message || 'Không thể kết nối đến server';
            setError(errorMessage);
            toast.error(`Lỗi khi lấy dữ liệu: ${errorMessage}`, {
                position: "top-center", 
                autoClose: 3000
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Paper elevation={3} sx={{
            p: 3, maxWidth: 1000, mx: 'auto', mt: 1,
            color: 'red',
            "@media (min-width: 1920px)": {
                fontSize: "15px",
                marginTop: '35px'
            },

        }}>
            <Typography variant="h5" gutterBottom align="center" mb={{ xs: 2, sm: 3 }}>
                API CUNG CẤP DỮ LIỆU NHIỆT ĐỘ
            </Typography>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            <Box sx={{ display: 'flex', flexDirection: 'row', gap: 2, mb: 3 }}>
                <TextField
                    label="Start Year"
                    type="number"
                    value={startYear}
                    onChange={(e) => setStartYear(e.target.value)}
                    placeholder="Ví dụ: 1990"
                    size="small"
                    sx={{ width: '40%' }}
                />
                <TextField
                    label="End Year"
                    type="number"
                    value={endYear}
                    onChange={(e) => setEndYear(e.target.value)}
                    placeholder="Ví dụ: 2020"
                    size="small"
                    sx={{ width: '40%' }}
                />
            </Box>
            <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle1" gutterBottom>
                    Chọn vị trí trên bản đồ:
                </Typography>
                <MapComponent
                    selectedPosition={selectedPosition}
                    onLocationSelect={(latlng) => setSelectedPosition(latlng)}
                    loading={loading} // Thêm prop loading
                />
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <Button variant="contained" onClick={handleFetchData} disabled={loading} sx={{ padding: '10px', marginTop: '10px' }}>
                    {loading ? "Đang tải..." : "Lấy dữ liệu"}
                </Button>
                {csvUrl && (
                    <Button
                        variant="contained"
                        href={csvUrl}
                        download="temperature_C.csv"
                        sx={{
                            backgroundColor: "green",
                            color: "white",
                            padding: "10px 20px",
                            fontSize: "16px",
                            fontWeight: "bold",
                            borderRadius: "8px",
                            textTransform: "none",
                            transition: "0.3s",
                            "&:hover": {
                                transform: "scale(1.02)",
                            },

                        }}
                    >
                        📥 Download CSV
                    </Button>

                )}
            </Box>
        </Paper>
    );
};

export default Map;