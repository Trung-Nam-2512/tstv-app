import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Navbar, Nav, Card, Button } from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { library } from '@fortawesome/fontawesome-svg-core';
import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import {
  faUpload, faChartLine,
  faChartBar, faTable, faSlidersH, faFileAlt,
  faDatabase, faArrowDown, faArrowUp, faCaretDown,
  faBell, faUser, faSignInAlt, faSignOutAlt, faKey,
  faRightToBracket
} from '@fortawesome/free-solid-svg-icons';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
// Import các components con
import FileInput from './component/fileInput';
import DataInputForm from './component/manualInput';
import ChartSelector from './component/chartSelector';
import StatsDisplay from './component/descriptiveStats';
import QQPPPlot from './component/qqppPlot';
import QuantileSelector from './component/quantileSelector';
import FrequencyAnalysisTable from './component/frequencyAnalysis';
import FrequencyByModel from './component/frequencyByModel';
import AnnualStatistics from './component/annual';
import ModelSelector from './component/modelSelector';
import Sidebar from './component/sideBar';
import Analysis from './component/analysis';
import RainfallAnalysis from './component/rainfallAnalysis';
import logo from './assets/assets'
import Footer from './component/footer';
import SampleDataGuide from './component/sampleDataGuid';
import { FileInfoProvider } from './context/fileInfoContext'
import Map from './component/map';
import { UnitProvider } from './context/unitContext';
import { AnalysisProvider } from './context/analysisContext';
import { ChartSettingsProvider } from './context/chartSettingsContext';
import { SessionProvider } from './context/sessionContext';
import './app.css';
import './assets/sidebar.css';

library.add(faUpload, faChartLine, faChartBar,
  faTable, faSlidersH, faFileAlt, faDatabase, faArrowDown, faArrowUp,
  faCaretDown, faBell, faUser, faSignInAlt, faSignOutAlt,
  faKey);

const AppContent = () => {
  const [data, setData] = useState(null);
  const [dataUpdate, setDataUpdate] = useState(false);
  const [fetch, setFetch] = useState(false);
  const [checkInput, setCheckInput] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  // Map URL paths to sections
  const pathToSection = {
    '/': 'tai-len-file',
    '/tai-len-file': 'tai-len-file',
    '/nhap-du-lieu': 'nhap-du-lieu',
    '/xem-thong-ke': 'xem-thong-ke',
    '/du-lieu-api': 'du-lieu-api',
    '/phan-tich-mua': 'phan-tich-mua',
    '/ket-qua': 'ket-qua',
    '/bieu-do-qqpp': 'bieu-do-qqpp',
    '/chi-so-phan-tich': 'chi-so-phan-tich',
    '/ket-qua-mo-hinh': 'ket-qua-mo-hinh',
    '/phan-tich-dong-chay': 'phan-tich-dong-chay'
  };

  const sectionToPath = {
    'tai-len-file': '/tai-len-file',
    'nhap-du-lieu': '/nhap-du-lieu',
    'xem-thong-ke': '/xem-thong-ke',
    'du-lieu-api': '/du-lieu-api',
    'phan-tich-mua': '/phan-tich-mua',
    'ket-qua': '/ket-qua',
    'bieu-do-qqpp': '/bieu-do-qqpp',
    'chi-so-phan-tich': '/chi-so-phan-tich',
    'ket-qua-mo-hinh': '/ket-qua-mo-hinh',
    'phan-tich-dong-chay': '/phan-tich-dong-chay'
  };

  const [activeSection, setActiveSection] = useState(pathToSection[location.pathname] || 'tai-len-file');

  // Update activeSection when URL changes
  useEffect(() => {
    const section = pathToSection[location.pathname] || 'tai-len-file';
    setActiveSection(section);
    
    // Set fetch flag khi navigate đến /ket-qua (để components biết có data)
    // Không auto-refresh (data từ cache), chỉ set flag
    if (location.pathname === '/ket-qua') {
      setFetch(true);
    }
  }, [location.pathname]);

  const handleFileDataReceived = (receivedData) => {
    setData(receivedData);
    setFetch(true);
  };

  const handleDataUpdate = () => {
    setDataUpdate((prev) => !prev);
  };

  const handleSectionChange = (section) => {
    setActiveSection(section);
    const path = sectionToPath[section] || '/tai-len-file';
    navigate(path);
  };
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Mobile sidebar
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false); // Desktop sidebar collapse

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const handleCloseSideBar = () => {
    setIsSidebarOpen(false);
  }
  
  // Sync sidebar state with session (but don't restore on mount to avoid UI jump)
  const handleSidebarToggle = () => {
    const newState = !sidebarCollapsed;
    setSidebarCollapsed(newState);
    // Update session but don't restore from it on mount
  }

  const handleOverlayClick = () => {
    setIsSidebarOpen(false);
  };
  return (
    <SessionProvider>
      <FileInfoProvider>
        <UnitProvider>
          <AnalysisProvider>
            <ChartSettingsProvider>
        <Container fluid className="app-container p-0">
          <Navbar variant="dark" expand="xxl" className="app-navbar fixed-top">
            <Container fluid>
              <Navbar.Toggle aria-controls="basic-navbar-nav" onClick={toggleSidebar} />
              <Navbar.Collapse id="basic-navbar-nav" className="justify-content-center d-flex">
                {/* Toggle Sidebar Button - Desktop */}
                <button
                  onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                  className="sidebar-toggle-header d-none d-md-flex"
                  title={sidebarCollapsed ? "Hiện sidebar" : "Ẩn sidebar"}
                >
                  <FontAwesomeIcon icon={faArrowUp} rotation={sidebarCollapsed ? 90 : 270} />
                </button>
                
                <Navbar.Brand href="#home" className="app-logo">
                  <img
                    src={logo}
                    alt="Logo"
                    height="70"
                    className="d-inline-block align-top app-logo-image"
                  />
                  <span >PHẦN MỀM PHÂN TÍCH TẦN SUẤT DỮ LIỆU KHÍ TƯỢNG THỦY VĂN</span>
                </Navbar.Brand>
                <Nav className="ms-auto app-nav-links">
                  {/* Nút thông báo */}
                  <Nav.Link href="#notifications" className="app-notification-link">
                    <FontAwesomeIcon icon={faBell} />
                  </Nav.Link>

                  {/* Nút đăng nhập */}
                  <Nav.Link href="#login" className="app-login-link">
                    <FontAwesomeIcon icon={faRightToBracket} /> Đăng nhập
                  </Nav.Link>

                  {/* Nút người dùng */}
                  <Nav.Link href="#user" className="app-user-link">
                    <FontAwesomeIcon icon={faUser} />
                  </Nav.Link>



                </Nav>
              </Navbar.Collapse>
            </Container>
          </Navbar>


          <Row className="app-content">
            {/* Overlay for mobile sidebar */}
            <div
              className={`sidebar-overlay ${isSidebarOpen ? 'active' : ''}`}
              onClick={handleOverlayClick}
            ></div>

            {/* Sidebar */}
            {!sidebarCollapsed && (
            <Col xs={12} md={2} className={`app-sidebar ${isSidebarOpen ? 'open' : ''}`}>
                <Sidebar 
                  onSectionChange={handleSectionChange} 
                  activeSection={activeSection} 
                  handleCloseSideBar={handleCloseSideBar}
                />
            </Col>
            )}

            {/* Main Content */}
            <Col xs={10} md={sidebarCollapsed ? 12 : 10} className={`app-main-content fix-flex ${isSidebarOpen ? 'sidebar-open' : ''}`}>
              <Routes>
                <Route path="/" element={
                  <Card className='section-card'>
                    <Card.Body>
                      <Row className="row-input">
                        <Col md={6} style={{ marginTop: '70px' }}>
                          <FileInput setData={handleFileDataReceived} onDataUpdate={handleDataUpdate} />
                        </Col>
                        <Col md={6} className='mt-3'>
                          <SampleDataGuide />
                        </Col>
                      </Row>
                    </Card.Body>
                  </Card>
                } />
                <Route path="/tai-len-file" element={
                  <Card className='section-card'>
                    <Card.Body>
                      <Row className="row-input">
                        <Col md={6} style={{ marginTop: '70px' }}>
                          <FileInput setData={handleFileDataReceived} onDataUpdate={handleDataUpdate} />
                        </Col>
                        <Col md={6} className='mt-3'>
                          <SampleDataGuide />
                        </Col>
                      </Row>
                    </Card.Body>
                  </Card>
                } />
                <Route path="/nhap-du-lieu" element={
                  <Card className='section-card'>
                    <Card.Body>
                      <Row className="row-input">
                        <Col md={12}>
                          <DataInputForm onUploadSuccess={() => setFetch(true)} checked={setCheckInput} />
                        </Col>
                      </Row>
                    </Card.Body>
                  </Card>
                } />
                <Route path="/xem-thong-ke" element={
                  <Card className='section-card'>
                    <Card.Body>
                      <Row className='row-stats'>
                        {!fetch && <h2 style={{ textAlign: 'center', marginTop: '50px' }}>Nhập dữ liệu để xem thống kê...</h2>}
                        <Col md={12} className='stats-year mb-4'>
                          <AnnualStatistics dataUpdated={dataUpdate} fetch={fetch} />
                        </Col>
                        <Col md={12} className='stats-month'>
                          <StatsDisplay dataUpdated={dataUpdate} fetch={fetch} checked={checkInput} />
                        </Col>
                      </Row>
                    </Card.Body>
                  </Card>
                } />
                <Route path="/du-lieu-api" element={
                  <Card className='section-card'>
                    <Card.Body>
                      <Row className='row-stats'>
                        <Col md={12} className='stats-year'>
                          <Map dataUpdated={dataUpdate} fetch={fetch} />
                        </Col>
                      </Row>
                    </Card.Body>
                  </Card>
                } />
                <Route path="/ket-qua" element={
                  <Card className='section-card'>
                    <Card.Body>
                      <Row className='row-select-model'>
                        <Col md={12}>
                          <ModelSelector />
                        </Col>
                      </Row>
                      <Row className='row-chart'>
                        <Col md={12} xs={12}>
                          <ChartSelector dataUpdated={dataUpdate} fetch={fetch} />
                        </Col>
                      </Row>
                      <Row className='row-chart'>
                        <Col md={12} xs={12}>
                          <QuantileSelector dataUpdated={dataUpdate} fetch={fetch} />
                        </Col>
                      </Row>
                    </Card.Body>
                  </Card>
                } />
                <Route path="/bieu-do-qqpp" element={
                  <Card className='section-card'>
                    <Card.Body>
                      <Row className='pp-qq-chart'>
                        <Col md={12}>
                          <QQPPPlot dataUpdated={dataUpdate} fetch={fetch} />
                        </Col>
                      </Row>
                    </Card.Body>
                  </Card>
                } />
                <Route path="/chi-so-phan-tich" element={
                  <Card className='section-card'>
                    <Card.Body>
                      <Row className='analyst-model'>
                        <Col md={12}>
                          {/* <h2 style={{ textAlign: 'center', marginTop: '100px', marginBottom: '0px', marginRight: '80px', color: 'blue' }}>Chỉ số phân phối xác suất</h2> */}
                          <Analysis dataUpdated={dataUpdate} fetch={fetch} />
                        </Col>
                      </Row>
                    </Card.Body>
                  </Card>
                } />
                <Route path="/ket-qua-mo-hinh" element={
                  <Card className='section-card'>
                    <Card.Body>
                      <Row className='row-result'>
                        <Col md={12}>
                          <FrequencyByModel dataUpdated={dataUpdate} fetch={fetch} />
                        </Col>
                      </Row>
                    </Card.Body>
                  </Card>
                } />
                <Route path="/phan-tich-dong-chay" element={
                  <Card className='section-card'>
                    <Card.Body>
                      <Row className='row-result2'>
                        <Col md={12}>
                          <FrequencyAnalysisTable dataUpdated={dataUpdate} fetch={fetch} checked={checkInput} />
                        </Col>
                      </Row>
                    </Card.Body>
                  </Card>
                } />
                <Route path="/phan-tich-mua" element={<RainfallAnalysis />} />
              </Routes>

            </Col>
          </Row>
          <Footer />
          <ToastContainer />
        </Container>
            </ChartSettingsProvider>
          </AnalysisProvider>
        </UnitProvider>
      </FileInfoProvider>
    </SessionProvider>

  );
};

const App = () => {
  return (
    <Router>
      <AppContent />
    </Router>
  );
};

export default App;
