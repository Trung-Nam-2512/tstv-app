import React from 'react';
import Plot from 'react-plotly.js';

const StationHistogram = ({ frequencyData, distributionName = 'gumbel' }) => {
    if (!frequencyData?.basic_frequency_table || !Array.isArray(frequencyData.basic_frequency_table)) {
        return (
            <div className="text-center py-4">
                <p>Không có dữ liệu histogram</p>
                <small className="text-muted">Dữ liệu chưa đủ để tạo histogram</small>
            </div>
        );
    }

    const basicData = frequencyData.basic_frequency_table || [];

    // Tạo histogram từ dữ liệu empirical
    const values = basicData.map(item => parseFloat(item["Chỉ số"] || 0)).filter(v => v > 0);

    if (values.length === 0) {
        return (
            <div className="text-center py-4">
                <p>Không có dữ liệu hợp lệ</p>
                <small className="text-muted">Tất cả giá trị đều bằng 0 hoặc không hợp lệ</small>
            </div>
        );
    }
    // const frequencies = basicData.map(item => parseFloat(item["Tần suất P(%)"])); // Sử dụng sau nếu cần

    // Tính số bin tối ưu (theo rule of thumb: sqrt(n))
    const numBins = Math.max(3, Math.ceil(Math.sqrt(values.length)));

    // Tạo histogram data
    const histogramData = {
        x: values,
        type: 'histogram',
        nbinsx: numBins,
        name: 'Dữ liệu quan trắc',
        marker: {
            color: 'rgba(54, 162, 235, 0.7)',
            line: {
                color: 'rgba(54, 162, 235, 1)',
                width: 2
            }
        },
        opacity: 0.7
    };

    // Nếu có dữ liệu theoretical, tạo density curve
    let theoreticalTrace = null;
    if (frequencyData.frequency_curves?.[distributionName]?.curve_data?.theoretical_curve) {
        const theoretical = frequencyData.frequency_curves[distributionName].curve_data.theoretical_curve;

        // Lấy một số điểm để vẽ density curve
        const densityPoints = theoretical.filter((_, index) => index % 20 === 0); // Lấy mỗi 20 điểm

        theoreticalTrace = {
            x: densityPoints.map(pt => pt.Q),
            y: densityPoints.map(pt => 1 / (100 / parseFloat(pt.P_percent))), // Convert to density
            type: 'scatter',
            mode: 'lines',
            name: `Phân phối ${distributionName.toUpperCase()}`,
            line: {
                color: 'red',
                width: 3
            },
            yaxis: 'y2'
        };
    }

    const layout = {
        title: {
            text: `Histogram và Phân phối Lý thuyết - ${distributionName.toUpperCase()}`,
            font: { size: 16, color: 'black' }
        },
        width: 700,
        height: 400,
        xaxis: {
            title: { text: 'Độ sâu nước (m)', font: { size: 12 } },
            tickfont: { size: 10 },
            showgrid: true,
            gridcolor: '#E5E5E5'
        },
        yaxis: {
            title: { text: 'Tần số', font: { size: 12 } },
            tickfont: { size: 10 },
            showgrid: true,
            gridcolor: '#E5E5E5'
        },
        yaxis2: theoreticalTrace ? {
            title: { text: 'Mật độ lý thuyết', font: { size: 11, color: 'red' } },
            titlefont: { color: 'red' },
            tickfont: { color: 'red', size: 9 },
            overlaying: 'y',
            side: 'right',
            showgrid: false
        } : undefined,
        margin: { l: 60, r: theoreticalTrace ? 80 : 30, t: 60, b: 60 },
        showlegend: true,
        legend: {
            x: 0.02,
            y: 0.98,
            bgcolor: 'rgba(255,255,255,0.8)',
            bordercolor: '#E2E2E2',
            borderwidth: 1
        },
        bargap: 0.1
    };

    const data = theoreticalTrace ? [histogramData, theoreticalTrace] : [histogramData];

    const config = {
        responsive: true,
        displayModeBar: true,
        modeBarButtonsToRemove: ['lasso2d', 'select2d'],
        displaylogo: false,
        toImageButtonOptions: {
            format: 'png',
            filename: `station-histogram-${distributionName}`,
            height: 400,
            width: 700,
            scale: 2
        }
    };


    return (
        <div className="station-histogram">
            <Plot
                data={data}
                layout={layout}
                config={config}
                style={{ width: '100%', height: '100%' }}
            />

            {/* Thống kê cơ bản */}
            <div className="mt-3 p-3 rounded bg-light" >
                <h6>Thống kê mô tả:</h6>
                <div className="row">
                    <div className="col-md-3">
                        <small><strong>Số quan trắc:</strong> {values.length}</small>
                    </div>
                    <div className="col-md-3">
                        <small><strong>Min:</strong> {Math.min(...values).toFixed(2)}m</small>
                    </div>
                    <div className="col-md-3">
                        <small><strong>Max:</strong> {Math.max(...values).toFixed(2)}m</small>
                    </div>
                    <div className="col-md-3">
                        <small><strong>Mean:</strong> {(values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)}m</small>
                    </div>
                </div>
            </div>
        </div>
    );
};



export default StationHistogram;