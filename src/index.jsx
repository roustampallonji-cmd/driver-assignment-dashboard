import React from "react";
import { createRoot } from "react-dom/client";
import "@geotab/zenith/dist/index.css";
import "./styles.css";
import App from "./App";

geotab.addin.driverAssignmentDashboard = function () {
  let reactRoot = null;
  const apiRef = { current: null };

  return {
    initialize: function (api, state, callback) {
      apiRef.current = api;
      const root = document.getElementById("dad-root");
      reactRoot = createRoot(root);
      reactRoot.render(<App apiRef={apiRef} />);
      callback();
    },
    focus: function (api) {
      apiRef.current = api;
      if (reactRoot) {
        reactRoot.render(<App apiRef={apiRef} />);
      }
    },
    blur: function () {
      // Timer cleanup handled inside App via useEffect
    }
  };
};
