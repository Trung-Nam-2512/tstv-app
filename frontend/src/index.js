import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import reportWebVitals from './reportWebVitals';
import ErrorBoundary from './component/errorBoundary';
import { ModelProvider } from './context/selectedModelContext'
import { FileInfoProvider } from './context/fileInfoContext'
import { UnitProvider } from './context/unitContext'
import 'bootstrap/dist/css/bootstrap.min.css';
import 'leaflet/dist/leaflet.css';
import './index.css'
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <ModelProvider>
        <FileInfoProvider>
          <UnitProvider>
            <App />
          </UnitProvider>
        </FileInfoProvider>
      </ModelProvider>
    </ErrorBoundary>
  </React.StrictMode>
);

reportWebVitals();
