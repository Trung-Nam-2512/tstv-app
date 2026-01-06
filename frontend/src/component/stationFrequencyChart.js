import React from 'react';
import Plot from 'react-plotly.js';

const StationFrequencyChart = ({ frequencyCurveData, distributionName = 'gumbel' }) => {
    if (!frequencyCurveData?.curve_data?.theoretical_curve || !frequencyCurveData?.curve_data?.empirical_points) {
        return (
            <div className="text-center py-4">
                <p>Không có dữ liệu biểu đồ tần suất</p>
                <small className="text-muted">Dữ liệu chưa đủ để tạo biểu đồ</small>
            </div>
        );
    }

    const theoretical_curve = frequencyCurveData.curve_data.theoretical_curve || [];
    const empirical_points = frequencyCurveData.curve_data.empirical_points || [];

    // Tạo dữ liệu đường cong lý thuyết
    const theoreticalData = {
        x: theoretical_curve?.map(pt => pt.P_percent) || [],
        y: theoretical_curve?.map(pt => pt.Q) || [],
        type: 'scatter',
        mode: 'lines',
        name: `Phân bố ${distributionName.toUpperCase()}`,
        line: { color: 'blue', width: 2, shape: 'spline', smoothing: 0.5 }
    };

    // Tạo dữ liệu điểm kinh nghiệm
    const empiricalData = {
        x: empirical_points?.map(pt => pt.P_percent) || [],
        y: empirical_points?.map(pt => pt.Q) || [],
        type: 'scatter',
        mode: 'markers',
        name: 'Điểm kinh nghiệm',
        marker: { color: 'orange', size: 8, symbol: 'circle' }
    };

    // Tính phạm vi trục y
    const allYValues = [
        ...(theoretical_curve?.map(pt => pt.Q) || []),
        ...(empirical_points?.map(pt => pt.Q) || [])
    ];
    const maxY = Math.max(...allYValues, 0);
    const minY = Math.min(...allYValues, 0);
    const yRange = [Math.floor(minY * 0.9), Math.ceil(maxY * 1.1)];

    const layout = {
        title: {
            text: `Biểu đồ tần suất theo trạm - ${distributionName.toUpperCase()}`,
            font: { size: 16, color: 'black' }
        },
        width: 700,
        height: 450,
        xaxis: {
            type: 'log',
            tickvals: [0.01, 0.1, 1, 10, 50, 99],
            ticktext: ['0.01', '0.1', '1', '10', '50', '99'],
            title: { text: 'Xác suất vượt (%)', font: { size: 12 } },
            tickfont: { size: 10 },
            showgrid: true,
            gridcolor: '#E5E5E5',
            gridwidth: 1,
            zeroline: false,
            showline: true,
            linecolor: 'black',
            linewidth: 2
        },
        yaxis: {
            title: { text: 'Độ sâu nước (m)', font: { size: 12 } },
            range: yRange,
            tickfont: { size: 10 },
            showgrid: true,
            gridcolor: '#E5E5E5',
            gridwidth: 1,
            zeroline: false,
            showline: false
        },
        margin: { l: 60, r: 30, t: 60, b: 70 },
        hovermode: 'closest',
        showlegend: true,
        legend: {
            x: 0.7,
            y: 0.95,
            bgcolor: 'rgba(255,255,255,0.8)',
            bordercolor: '#E2E2E2',
            borderwidth: 1
        },
        shapes: [
            {
                type: 'line',
                xref: 'x',
                yref: 'paper',
                x0: 1,
                x1: 1,
                y0: 0,
                y1: 1,
                line: { color: 'red', width: 2, dash: 'dash' }
            },
            {
                type: 'line',
                xref: 'x',
                yref: 'paper',
                x0: 10,
                x1: 10,
                y0: 0,
                y1: 1,
                line: { color: 'green', width: 2, dash: 'dash' }
            }
        ]
    };

    const config = {
        responsive: true,
        displayModeBar: true,
        modeBarButtonsToRemove: ['lasso2d', 'select2d'],
        displaylogo: false,
        toImageButtonOptions: {
            format: 'png',
            filename: `station-frequency-${distributionName}`,
            height: 450,
            width: 700,
            scale: 2
        }
    };

    return (
        <div className="station-frequency-chart">
            <Plot
                data={[theoreticalData, empiricalData]}
                layout={layout}
                config={config}
                style={{ width: '100%', height: '100%' }}
            />
        </div>
    );
};

export default StationFrequencyChart;