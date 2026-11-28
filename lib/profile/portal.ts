export function usesTyai(pathname = globalThis.location?.pathname || "") {
  return pathname === "/s-profile" || pathname.startsWith("/s-profile/");
}

export function profilePath(path: string) {
  return (usesTyai() ? "/s-profile" : "") + path;
}

export function openTyaiLogin() {
  const { pathname, search, hash } = window.location;
  window.location.replace("/?next=" + encodeURIComponent(pathname + search + hash));
}

export async function logoutTyai() {
  const response = await fetch("/api/logout", {
    method: "POST",
    headers: { "X-TYAI-Request": "1", "Content-Type": "application/json" },
    body: "{}",
  });
  if (!response.ok && response.status !== 401) throw new Error("退出失败，请重试");
  window.location.replace("/");
}
