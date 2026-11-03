import React from "react";
import { InstitutionsFooter } from "./InstitutionsFooter";

/**
 * Dark sign-in layout ("Dark Luxe" from the RLKG PMS Screens design):
 * brand bar, headline on the left, glass card on the right, institutions footer.
 * Used by the Sign-in and Create-account pages.
 */
export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="rlk-auth">
      <div className="rlk-auth__main">
        <img src="/brand/rlk-logo-gold.png" alt="" aria-hidden="true" className="rlk-auth__watermark" />
        <div className="rlk-auth__top">
          <div className="rlk-auth__brand">
            <img src="/brand/rlk-logo-gold.png" alt="RLK Group logo" />
            <span>RLKG PMS</span>
          </div>
          <span className="rlk-auth__group">Rashid Latif Khan Group</span>
        </div>
        <div className="rlk-auth__body">
          <div className="rlk-auth__pitch">
            <h1>
              One workspace
              <br />
              for every
              <br />
              <em>institution.</em>
            </h1>
            <p>
              Projects, tasks and approvals across RLK Group hospitals, colleges and the university — tracked in real
              time, governed by role.
            </p>
          </div>
          {children}
        </div>
      </div>
      <InstitutionsFooter variant="auth" />
    </div>
  );
}
