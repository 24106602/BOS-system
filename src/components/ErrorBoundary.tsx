import { Component, type ErrorInfo, type ReactNode } from "react";

type ErrorBoundaryProps = {
  children: ReactNode;
  onNavigate?: (to: string) => void;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
};

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("页面渲染错误:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onNavigate?.("/college");
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "60vh",
            display: "grid",
            placeItems: "center",
            padding: 24,
          }}
        >
          <div
            style={{
              maxWidth: 560,
              padding: 24,
              border: "1px solid #f5c2c7",
              borderRadius: 8,
              background: "#fff5f5",
              color: "#842029",
            }}
          >
            <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>页面加载出错</h2>
            <p style={{ margin: "0 0 12px", fontSize: 13, lineHeight: 1.6 }}>
              该页面在渲染时发生错误，请返回首页重试。如果问题持续出现，请联系管理员。
            </p>
            <pre
              style={{
                margin: "0 0 16px",
                padding: 12,
                borderRadius: 6,
                background: "#fdeaea",
                fontSize: 11,
                lineHeight: 1.5,
                overflow: "auto",
                maxHeight: 200,
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {this.state.error?.message || "未知错误"}
              {this.state.error?.stack ? `\n\n${this.state.error.stack}` : ""}
            </pre>
            <button
              onClick={this.handleReset}
              style={{
                padding: "8px 16px",
                border: "1px solid #842029",
                borderRadius: 6,
                background: "#842029",
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              返回首页
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
