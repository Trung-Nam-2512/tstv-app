// ChartSelector.jsx
import React, { useContext } from 'react'; // Đã loại bỏ useState vì sử dụng props từ parent
import HistogramWithTheoreticalCurve from './testQuantile'
import { ModelContext } from '../context/selectedModelContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner } from '@fortawesome/free-solid-svg-icons';

const QuantileSelector = ({ fetch, dataUpdated }) => {
    // const [selectedModel, setSelectedModel] = useState('gumbel');
    // const [dataUpdate, setDataUpdate] = useState(false); // Đã sử dụng props từ parent
    // const handleDataUpdate = () => { // Đã sử dụng props từ parent
    //     setDataUpdate((prev) => !prev)
    // }

    const { selectedModel, selectedValue } = useContext(ModelContext)

    // Xác định endpoint dựa trên lựa chọn của người dùng
    let endpoint;
    if (selectedModel === 'gumbel') {
        endpoint = `/analysis/quantile_data/gumbel?agg_func=${selectedValue}`;
    } else if (selectedModel === 'lognorm') {
        endpoint = `/analysis/quantile_data/lognorm?agg_func=${selectedValue}`;
    } else if (selectedModel === 'gamma') {
        endpoint = `/analysis/quantile_data/gamma?agg_func=${selectedValue}`;
    } else if (selectedModel === 'logistic') {
        endpoint = `/analysis/quantile_data/logistic?agg_func=${selectedValue}`;
    } else if (selectedModel === 'expon') {
        endpoint = `/analysis/quantile_data/expon?agg_func=${selectedValue}`;
    } else if (selectedModel === 'genpareto') {
        endpoint = `/analysis/quantile_data/genpareto?agg_func=${selectedValue}`;
    } else if (selectedModel === 'frechet') {
        endpoint = `/analysis/quantile_data/frechet?agg_func=${selectedValue}`;
    } else if (selectedModel === 'pearson3') {
        endpoint = `/analysis/quantile_data/pearson3?agg_func=${selectedValue}`;
    } else if (selectedModel === 'genextreme') {
        endpoint = `/analysis/quantile_data/genextreme?agg_func=${selectedValue}`;
    }
    if (selectedModel === 'null' || selectedValue === 'null' || !endpoint) {
        return (
            <div className="text-center py-5" style={{ marginTop: '100px' }}>
                <FontAwesomeIcon icon={faSpinner} className="loading-spinner me-3" />
                <p className="mt-3">Đang tải biểu đồ tần số...</p>
            </div>
        );
    }
    return (
        <div className="container-histogram" style={{ width: '100%', padding: '0 20px' }}>
                <HistogramWithTheoreticalCurve endpoint={endpoint} dataUpdated={dataUpdated} fetch={fetch} />
        </div>
    );
};

export default QuantileSelector;
