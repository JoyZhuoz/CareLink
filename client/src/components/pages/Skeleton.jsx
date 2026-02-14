import React from "react";

import "../../utilities.css";
import "./Skeleton.css";

const Skeleton = () => {
  return (
    <>
      <h1>CareLink Dashboard Demo</h1>
      <h2>Hackathon mode: public dashboard access (no auth)</h2>
      <ul>
        <li>Google login removed for faster demos.</li>
        <li>MongoDB and auth integrations are disabled.</li>
        <li>Next step: wire Elasticsearch Cloud-backed patient/call dashboard.</li>
      </ul>
    </>
  );
};

export default Skeleton;
