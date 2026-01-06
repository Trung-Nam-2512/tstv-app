// sideBar.js
import React, { useState } from 'react';
import { Nav, Collapse } from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faUpload,
    faChartLine,
    faChartBar,
    faTable,
    faDatabase,
    faArrowDown,
    faArrowUp,
    faGlobe,
    faTimes,
    faBell,
    faSignInAlt,
    faUser,
    faCloudRain
} from '@fortawesome/free-solid-svg-icons';
import '../assets/sidebar.css'

const Sidebar = ({ onSectionChange, activeSection, handleCloseSideBar }) => {
    const [dataOpen, setDataOpen] = useState(true);
    const [analysisOpen, setAnalysisOpen] = useState(true);
    const [headerIconsOpen, setHeaderIconsOpen] = useState(true);

    const handleDataClick = () => {
        setDataOpen(!dataOpen);
    };
    const handleAnalysisClick = () => {
        setAnalysisOpen(!analysisOpen)
    }
    const handleHeaderIconsClick = () => {
        setHeaderIconsOpen(!headerIconsOpen);
    };
    const handleLinkClick = (section) => {
        onSectionChange(section);
        handleCloseSideBar();
    };

    return (
        <Nav className="flex-column sidebar-nav">
            {/* Close button for mobile */}
            <div className="sidebar-close-btn d-md-none" onClick={handleCloseSideBar}>
                <FontAwesomeIcon icon={faTimes} />
            </div>

            {/* Nhóm Dữ liệu */}
            <div className='sidebar-group'>
                <div className='sidebar-group-title' onClick={handleDataClick}>
                    <FontAwesomeIcon icon={faDatabase} className='me-2' /> Dữ Liệu
                    {dataOpen ? <FontAwesomeIcon icon={faArrowUp} className='ms-2' /> :
                        <FontAwesomeIcon icon={faArrowDown} className='ms-2' />}
                </div>
                <Collapse in={dataOpen}>
                    <div className="sidebar-sublinks sidebar-data-links">
                        <Nav.Item>
                            <Nav.Link
                                onClick={() => handleLinkClick('upload-file')}
                                className={`sidebar-link ${activeSection === 'upload-file' ? 'active' : ''}`}
                            >
                                <FontAwesomeIcon icon={faUpload} className="me-2" /> Tải lên file
                            </Nav.Link>
                        </Nav.Item>
                        <Nav.Item>
                            <Nav.Link
                                onClick={() => handleLinkClick('manual-input')}
                                className={`sidebar-link ${activeSection === 'manual-input' ? 'active' : ''}`}
                            >
                                <FontAwesomeIcon icon={faUpload} className="me-2" /> Nhập thủ công
                            </Nav.Link>
                        </Nav.Item>

                        <Nav.Item>
                            <Nav.Link
                                onClick={() => handleLinkClick('statistics')}
                                className={`sidebar-link ${activeSection === 'statistics' ? 'active' : ''}`}
                            >
                                <FontAwesomeIcon icon={faChartLine} className="me-2" /> Xem Thống kê
                            </Nav.Link>
                        </Nav.Item>
                        <Nav.Item>
                            <Nav.Link
                                onClick={() => handleLinkClick('api-data')}
                                className={`sidebar-link ${activeSection === 'api-data' ? 'active' : ''}`}
                            >
                                <FontAwesomeIcon icon={faGlobe} className="me-2" />Dữ liệu API
                            </Nav.Link>
                        </Nav.Item>
                        <Nav.Item>
                            <Nav.Link
                                onClick={() => handleLinkClick('rainfall-analysis')}
                                className={`sidebar-link ${activeSection === 'rainfall-analysis' ? 'active' : ''}`}
                            >
                                <FontAwesomeIcon icon={faCloudRain} className="me-2" />Phân tích mưa ⭐
                            </Nav.Link>
                        </Nav.Item>
                    </div>
                </Collapse>
            </div>

            {/* Nhóm Phân Tích */}
            <div className='sidebar-group'>
                <div className='sidebar-group-title' onClick={handleAnalysisClick}>
                    <FontAwesomeIcon icon={faChartBar} className='me-2' /> Kết quả phân tích
                    {analysisOpen ? <FontAwesomeIcon icon={faArrowUp} className='ms-2' /> :
                        <FontAwesomeIcon icon={faArrowDown} className='ms-2' />}
                </div>
                <Collapse in={analysisOpen}>
                    <div className="sidebar-sublinks">

                        <div className="sidebar-sublinks sidebar-sublinks-dropdown">
                            <Nav.Item>
                                <Nav.Link
                                    onClick={() => handleLinkClick('results')}
                                    className={`sidebar-link ${activeSection === 'results' ? 'active' : ''}`}
                                >
                                    <FontAwesomeIcon icon={faChartLine} className="me-2" /> Biểu Đồ Tần Suất
                                </Nav.Link>
                            </Nav.Item>
                            <Nav.Item>
                                <Nav.Link
                                    onClick={() => handleLinkClick('qq-pp-plot')}
                                    className={`sidebar-link ${activeSection === 'qq-pp-plot' ? 'active' : ''}`}
                                >
                                    <FontAwesomeIcon icon={faChartBar} className="me-2" /> Biểu Đồ QQ-PP
                                </Nav.Link>
                            </Nav.Item>
                            <Nav.Item>
                                <Nav.Link
                                    onClick={() => handleLinkClick('analysis-indices')}
                                    className={`sidebar-link ${activeSection === 'analysis-indices' ? 'active' : ''}`}
                                >
                                    <FontAwesomeIcon icon={faTable} className="me-2" /> Chỉ số phân tích
                                </Nav.Link>
                            </Nav.Item>
                            <Nav.Item>
                                <Nav.Link
                                    onClick={() => handleLinkClick('model-results')}
                                    className={`sidebar-link ${activeSection === 'model-results' ? 'active' : ''}`}
                                >
                                    <FontAwesomeIcon icon={faTable} className="me-2" /> Kết quả mô hình
                                </Nav.Link>
                            </Nav.Item>
                            <Nav.Item>
                                <Nav.Link
                                    onClick={() => handleLinkClick('flow-analysis')}
                                    className={`sidebar-link ${activeSection === 'flow-analysis' ? 'active' : ''}`}
                                >
                                    <FontAwesomeIcon icon={faTable} className="me-2" /> Phân tích dữ liệu
                                </Nav.Link>
                            </Nav.Item>
                        </div>
                    </div>

                </Collapse>
            </div>

            {/* Divider */}
            <div className="sidebar-divider d-xxl-none"></div>

            {/* Header Icons Section - Chỉ hiện khi responsive */}
            <div className="sidebar-header-icons d-xxl-none">
                <div className="sidebar-header-title" onClick={handleHeaderIconsClick}>
                    <FontAwesomeIcon icon={faUser} className="me-2" />
                    Chức năng nhanh
                    {headerIconsOpen ? <FontAwesomeIcon icon={faArrowUp} className='ms-2' /> :
                        <FontAwesomeIcon icon={faArrowDown} className='ms-2' />}
                </div>
                <Collapse in={headerIconsOpen}>
                    <div className="sidebar-header-actions">
                        <div className="sidebar-header-icon-item" onClick={() => {
                            // Xử lý thông báo
                            handleCloseSideBar();
                        }}>
                            <FontAwesomeIcon icon={faBell} />
                            <span>Thông báo</span>
                        </div>
                        <div className="sidebar-header-icon-item" onClick={() => {
                            // Xử lý đăng nhập
                            handleCloseSideBar();
                        }}>
                            <FontAwesomeIcon icon={faSignInAlt} />
                            <span>Đăng nhập</span>
                        </div>
                        <div className="sidebar-header-icon-item" onClick={() => {
                            // Xử lý profile
                            handleCloseSideBar();
                        }}>
                            <FontAwesomeIcon icon={faUser} />
                            <span>Tài khoản</span>
                        </div>
                    </div>
                </Collapse>
            </div>
        </Nav>
    );
};

export default Sidebar;
