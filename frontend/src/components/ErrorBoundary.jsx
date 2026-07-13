import { Component } from "react";
import i18n from "../i18n";

/**
 * Catches render errors and shows a friendly reload screen instead of a white page.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Uncaught render error:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-boundary">
          <h1>{i18n.t("errorBoundary.title")}</h1>
          <p>{i18n.t("errorBoundary.message")}</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => window.location.reload()}
          >
            {i18n.t("common.reload")}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
