export function isValidEmailAddress(email) {
  if (
    typeof email !== "string" ||
    email.length > 254
  ) {
    return false;
  }

  const [localPart, domain, ...extra] =
    email.split("@");

  if (
    extra.length > 0 ||
    !localPart ||
    localPart.length > 64 ||
    !domain ||
    !domain.includes(".")
  ) {
    return false;
  }

  return (
    /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(
      localPart
    ) &&
    domain
      .split(".")
      .every(
        (label) =>
          label.length > 0 &&
          label.length <= 63 &&
          /^[a-z0-9-]+$/i.test(label) &&
          !label.startsWith("-") &&
          !label.endsWith("-")
      )
  );
}
