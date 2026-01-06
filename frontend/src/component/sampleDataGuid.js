import React from 'react';
import { Table } from 'react-bootstrap'; // Import Table từ react-bootstrap

const SampleDataGuide = () => {
    // Dữ liệu mẫu (có thể lấy từ JSON hoặc từ file Excel được parse)
    const sampleData = [
        { "Year": 2000, "Month": 1, "Rainfall": 1200 },
        { "Year": 2000, "Month": 2, "Rainfall": 1350 },
        { "Year": 2000, "Month": 3, "Rainfall": 1100 },
        { "Year": 2000, "Month": 4, "Rainfall": 1400 },
        { "Year": 2000, "Month": 5, "Rainfall": 1250 },
        // ... thêm các dòng dữ liệu mẫu khác
    ];

    return (
        <div style={styles.container}>
            <h2 style={styles.title}>Hướng Dẫn Sử Dụng Dữ Liệu Mẫu</h2>
            <p style={styles.description}>
                Để sử dụng phần mềm một cách hiệu quả, vui lòng tham khảo dữ liệu mẫu dưới đây. File Excel mẫu bao gồm các cột: <b>Year</b>, <b>Month</b> và <b>Rainfall</b>, trong đó <b>Rainfall</b> là chỉ số cần tính toán. <br />
                <i style={{ color: 'red' }}>Lưu ý:</i> File tải lên phải được đặt tên theo cú pháp <b>"tên chỉ số_đơn vị"</b>. Ví dụ: <b>Rainfall_mm.csv</b>.
            </p>

            {/* Bảng dữ liệu mẫu */}
            <Table striped bordered hover responsive>
                <thead>
                    <tr>
                        <th>Year</th>
                        <th>Month</th>
                        <th>Rainfall</th>

                    </tr>
                </thead>
                <tbody>
                    {sampleData.map((row, index) => (
                        <tr key={index}>
                            <td>{row["Year"]}</td>
                            <td>{row["Month"]}</td>
                            <td>{row["Rainfall"]}</td>
                        </tr>
                    ))}
                </tbody>
            </Table>


            <div style={styles.downloadContainer}>
                <p style={{ margin: '15px auto 20px auto', color: 'red' }}>Đây chỉ là dữ liệu mẫu, nếu bạn muốn thử sử dụng hãy :

                </p> <a href="/Rainfall_mm.csv" download style={styles.downloadLink}>
                    Tải File Excel Dữ Liệu Mẫu
                </a>
            </div>
            <p style={styles.note}>
                <b>Lưu ý</b>: Dữ liệu trong file Excel phải tuân theo định dạng như trong file mẫu để đảm bảo phần mềm hoạt động chính xác.
            </p>
        </div>
    );
};

// Giữ nguyên phần style

const styles = {
    container: {
        padding: '20px',
        border: '1px solid #ccc',
        borderRadius: '8px',
        margin: '20px auto',
        backgroundColor: '#f8f8f8',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
        maxWidth: '900px',
        textAlign: 'center',
    },
    title: {
        color: '#007bff',
        marginBottom: '15px',
        fontSize: '22px',
    },
    description: {
        marginBottom: '20px',
        lineHeight: '1.6',
        textAlign: 'left'
    },
    downloadContainer: {
        marginBottom: '20px',
    },
    downloadLink: {
        display: 'inline-block',
        padding: '10px 20px',
        backgroundColor: '#28a745',
        color: 'white',
        textDecoration: 'none',
        borderRadius: '5px',
        transition: 'background-color 0.3s',
    },
    note: {
        fontStyle: 'italic',
        color: 'red',
    },
};

export default SampleDataGuide;

