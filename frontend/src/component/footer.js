import React, { useState, useEffect, useRef } from 'react';
import { Container, Row, Col } from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEnvelope, faCopyright, faGlobe } from '@fortawesome/free-solid-svg-icons';
import { faFacebook, faInstagram, faTwitter } from '@fortawesome/free-brands-svg-icons';
import logo from '../assets/assets';
import '../assets/footer.css';
import Config from '../config/config';

const Footer = () => {
    const [stats, setStats] = useState({
        total_visits: 0,
        daily_stats: {}
    });
    const apiCalled = useRef(false);

    useEffect(() => {
        if (apiCalled.current) return;
        apiCalled.current = true;

        const recordAndFetchStats = async () => {
            try {
                const visitResponse = await fetch(`${Config.BASE_URL}/external/visit`, { method: 'POST' });
                const visitData = await visitResponse.json();
                // console.log('Visit recorded:', visitData);

                // Lấy thống kê lượt truy cập
                const statsResponse = await fetch(`${Config.BASE_URL}/external/stats-visit`);
                const statsData = await statsResponse.json();

                setStats(statsData);
                // console.log("statsData visit ", statsData)
            } catch (err) {
                console.error("Error recording visit or fetching stats:", err);
                // Set default values if API fails
                setStats({
                    total_visits: 0,
                    daily_stats: {}
                });
            }
        };

        recordAndFetchStats();
    }, []);

    const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

    // Safe access to stats with fallback values
    const dailyVisits = stats.daily_stats && stats.daily_stats[today] ? stats.daily_stats[today] : 0;
    const totalVisits = stats.total_visits || 0;

    return (
        <footer className="app-footer">
            <hr />
            <Container>
                <Row>
                    <Col md={4} className="footer-section">
                        <div className="footer-logo">
                            <img src={logo} alt="Logo" />
                        </div>
                        {/* Giới thiệu */}
                        <p className="footer-industry">
                            <strong>NGÀNH:&nbsp;</strong>KĨ THUẬT TÀI NGUYÊN NƯỚC-PHÂN HIỆU<br /> TRƯỜNG ĐẠI HỌC THỦY LỢI.
                        </p>
                        <p className="footer-address">
                            <strong>ĐỊA CHỈ:</strong> SỐ 02 TRƯỜNG SA, PHƯỜNG 17,<br /> QUẬN BÌNH THẠNH, TP.HCM.
                        </p>
                        <p className="footer-contact">
                            <FontAwesomeIcon icon={faEnvelope} className="me-2" />
                            nguyendd@tlu.edu.vn
                        </p>
                    </Col>
                    <Col md={4} className="footer-section">
                        {/* Liên kết nhanh */}
                        <h5 className='footer-quick-link-title'>Liên kết nhanh</h5>
                        <ul className="footer-links">
                            <li><a href="#huong-dan">Hướng dẫn sử dụng</a></li>
                            <li><a href="#faq">Câu hỏi thường gặp</a></li>
                            <li><a href="#ve-chung-toi">Về chúng tôi</a></li>
                            <li><a href="#dieu-khoan">Điều khoản sử dụng</a></li>
                            <li><a href="#bao-mat">Chính sách bảo mật</a></li>
                        </ul>
                    </Col>
                    <Col md={4} className="footer-section">
                        {/* Bản quyền và phiên bản */}
                        <p className="footer-copyright">
                            <FontAwesomeIcon icon={faCopyright} className="me-2" />
                            {new Date().getFullYear()}TSTV
                        </p>
                        <p className="footer-intro">
                            Phần mềm phân tích tần suất thủy văn giúp người dùng tính toán và phân tích dữ liệu thủy văn một cách nhanh chóng.
                        </p>
                        <p className="footer-version">Phiên bản: 3.0.0</p>
                        <p className="footer-version">Nguồn dữ liệu mưa: <a href="https://vrain.vn/" target="_blank" rel="noopener noreferrer" style={{ color: 'white' }}>VRAIN</a></p>
                        {/* Hiển thị thống kê lượt truy cập từ MongoDB */}
                        <p className="footer-visits">Truy cập hôm nay: {dailyVisits}</p>
                        <p className="footer-visits">Tổng lượt truy cập: {totalVisits}</p>
                        {/* Các icon mạng xã hội */}
                        <div className="footer-social">
                            <a href="https://www.facebook.com/KythuatTNN" target="_blank" rel="noopener noreferrer">
                                <FontAwesomeIcon icon={faFacebook} />
                            </a>
                            <a href="#!" rel="noopener noreferrer">
                                <FontAwesomeIcon icon={faInstagram} />
                            </a>
                            <a href="#!" rel="noopener noreferrer">
                                <FontAwesomeIcon icon={faTwitter} />
                            </a>
                        </div>
                        <div className='footer-language'>
                            <FontAwesomeIcon icon={faGlobe} className="me-2" />
                            <select>
                                <option>Tiếng Việt</option>
                                <option>English</option>
                            </select>
                        </div>
                    </Col>
                </Row>
            </Container>
        </footer>
    );
};

export default Footer;
