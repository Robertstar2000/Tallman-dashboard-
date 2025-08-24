
import React from 'react';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // You can also log the error to an error reporting service
    console.error("Dashboard rendering error caught by ErrorBoundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // You can render any custom fallback UI
      return (
        <div className="bg-red-900/50 text-red-200 p-8 rounded-lg m-4">
          <h1 className="text-2xl font-bold mb-4">Dashboard Render Error</h1>
          <p className="mb-2">Something went wrong while trying to display the dashboard. Please check the console for detailed logs.</p>
          <details className="mt-4 bg-black/30 p-4 rounded-md text-sm">
            <summary className="cursor-pointer font-semibold">Error Details</summary>
            <pre className="mt-2 whitespace-pre-wrap">
              <code>{this.state.error?.toString()}</code>
              {this.state.error?.stack && <><br /><br />{this.state.error.stack}</>}
            </pre>
          </details>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
