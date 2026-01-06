// import dotenv from 'dotenv';
// dotenv.config();

// Xác định BASE_URL dựa trên môi trường
// Trong production (Docker), sử dụng /api/ để proxy qua nginx
// Trong development, sử dụng localhost:8000 trực tiếp
const getBaseUrl = () => {
    // Nếu có REACT_APP_API_URL được set, dùng nó
    if (process.env.REACT_APP_API_URL) {
        return process.env.REACT_APP_API_URL;
    }
    
    // Trong production (build), sử dụng /api/ prefix
    // Nginx sẽ proxy /api/ đến backend
    if (process.env.NODE_ENV === 'production') {
        return '/api';
    }
    
    // Development mode: kết nối trực tiếp đến backend
    return 'http://localhost:8000';
};

const Config = {
    BASE_URL: getBaseUrl(),
    BASE_PROXY: 'https://my-worker.trungnampyag.workers.dev',
    // Mapbox Access Token - Tự động lấy từ .env hoặc sử dụng token thực tế
    MAPBOX_ACCESS_TOKEN: process.env.REACT_APP_MAPBOX_TOKEN || 'pk.eyJ1IjoibmFta2lzaTI1MTIiLCJhIjoiY21jeGVqeGduMGRhdTJsb2V2N2MweXc1ciJ9.naZfpBG6ZynTLBC6fQDFRg'
}
export default Config;