import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  // Khi có lỗi xảy ra ở bất kỳ component nào bên trong ErrorBoundary, phương thức này sẽ được gọi
  componentDidCatch(error, errorInfo) {
    this.setState({ hasError: true, error, errorInfo });
    // Ghi log lỗi để dễ dàng debug
    console.error("ErrorBoundary bắt được lỗi:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // Bạn có thể tùy chỉnh giao diện fallback hiển thị lỗi theo ý muốn
      return (
        <div style={{ padding: '20px', backgroundColor: '#fdd', color: '#900' }}>
          <h2>Đã có lỗi xảy ra!</h2>
          <details style={{ whiteSpace: 'pre-wrap' }}>
            {this.state.error && this.state.error.toString()}
            <br />
            {this.state.errorInfo && this.state.errorInfo.componentStack}
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
