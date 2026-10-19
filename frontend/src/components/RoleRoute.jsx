import { Navigate, useLocation } from "react-router-dom";
import { currentUser } from "../api";
export default function RoleRoute({ role, children }) {
  const user = currentUser(),
    loc = useLocation();
  if (!user) {
    sessionStorage.setItem("afterLogin", loc.pathname);
    return (
      <Navigate
        to="/login"
        state={{ message: "Please login to continue." }}
        replace
      />
    );
  }
  const allowedRoles = Array.isArray(role) ? role : [role];
  if (!allowedRoles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}