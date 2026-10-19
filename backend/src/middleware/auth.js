import {
  verifyAccessToken,
} from "../utils.js";

export function auth(
  request,
  response,
  next
) {
  const authorizationHeader =
    request.headers.authorization;

  if (
    !authorizationHeader ||
    !authorizationHeader.startsWith(
      "Bearer "
    )
  ) {
    return response
      .status(401)
      .json({
        message: "Login required",
      });
  }

  const token =
    authorizationHeader.slice(7);

  if (!token) {
    return response
      .status(401)
      .json({
        message: "Login required",
      });
  }

  try {
    request.user =
      verifyAccessToken(token);

    return next();
  } catch {
    return response
      .status(401)
      .json({
        message:
          "Invalid or expired token",
      });
  }
}

export function role(expectedRole) {
  return function roleMiddleware(
    request,
    response,
    next
  ) {
    const allowedRoles =
      expectedRole === "seller"
        ? [
            "business_seller",
            "individual_seller",
            "seller",
          ]
        : Array.isArray(expectedRole)
          ? expectedRole
          : [expectedRole];

    if (
      !allowedRoles.includes(
        request.user?.role
      )
    ) {
      return response
        .status(403)
        .json({
          message:
            `Only ${allowedRoles.join(" or ")} accounts can use this feature`,
        });
    }

    return next();
  };
}
